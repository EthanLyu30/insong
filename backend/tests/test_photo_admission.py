import base64
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import threading

from fastapi import Request
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from app import photos


def photo_data():
    output = BytesIO()
    Image.new('RGB', (12, 12), '#b78664').save(output, format='JPEG')
    return base64.b64encode(output.getvalue()).decode()


def test_concurrent_upload_rejected_before_body_read_across_apps(tmp_path, monkeypatch):
    started, finish = threading.Event(), threading.Event()
    sanitize = photos.sanitize_photo
    stream = Request.stream
    probe_read = []

    def hold_first(data):
        if not started.is_set():
            started.set()
            assert finish.wait(10), 'First upload did not get released'
        return sanitize(data)

    async def observe_stream(request):
        if request.headers.get('x-admission-probe'):
            probe_read.append(True)
        async for chunk in stream(request):
            yield chunk

    monkeypatch.setattr(photos, 'sanitize_photo', hold_first)
    monkeypatch.setattr(Request, 'stream', observe_stream)
    with TestClient(create_app(f'sqlite:///{tmp_path / "first.db"}')) as first, \
            TestClient(create_app(f'sqlite:///{tmp_path / "second.db"}')) as second:
        first.post('/api/demo/sessions', json={'user_id': 1}).raise_for_status()
        second.post('/api/demo/sessions', json={'user_id': 2}).raise_for_status()
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(first.post, '/api/photos', json={'data': photo_data()})
            try:
                assert started.wait(5)
                busy = second.post('/api/photos', json={'data': photo_data()},
                                   headers={'x-admission-probe': 'true'})
                assert busy.status_code == 503
                assert busy.headers['retry-after'] == '1'
                assert not probe_read, 'Busy requests must not retain photo bodies'
            finally:
                finish.set()
                assert pending.result().status_code == 201
        # Both success and validation failure must release the process-wide slot.
        assert second.post('/api/photos', json={'data': 'invalid'}).status_code == 422
        assert second.post('/api/photos', json={'data': photo_data()}).status_code == 201
