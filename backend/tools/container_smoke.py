"""Exercise only synthetic data in a CI container; report genuine E5 execution."""
from concurrent.futures import ThreadPoolExecutor
import base64
from io import BytesIO
import json
import os
import threading
import time

import httpx
from PIL import Image


BASE = os.environ.get('SMOKE_BASE_URL', 'http://127.0.0.1:8000')


def main():
    with httpx.Client(base_url=BASE, trust_env=False, timeout=30) as client:
        deadline = time.monotonic() + 120
        while True:
            try:
                if client.get('/api/health').status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            if time.monotonic() > deadline:
                raise RuntimeError('Container did not become healthy')
            time.sleep(1)
        assert client.get('/api/search/status').json()['semantic_available']
        response = client.post('/api/demo/sessions', json={'user_id': 1})
        response.raise_for_status()
        stories = client.get('/api/stories').json()
        assert stories
        query = stories[0]['excerpt'][:200]
        matches = None
        warm_deadline = time.monotonic() + 90
        while time.monotonic() < warm_deadline:
            result = client.post('/api/stories/search', json={'query': query, 'mode': 'semantic'})
            result.raise_for_status()
            matches = result.json()
            if matches['mode'] == 'semantic':
                break
            # A bounded first call may still be loading the model or caching
            # passages. Let that worker finish before issuing another query.
            time.sleep(2)
        assert matches['mode'] == 'semantic', 'E5 could not finish; keyword fallback is not a passing semantic test'
        assert matches['items']
        data = BytesIO()
        # RGBA needs more decoded memory than RGB at the allowed pixel limit.
        Image.new('RGBA', (5000, 4000), (183, 134, 100, 128)).save(data, format='PNG')
        encoded = base64.b64encode(data.getvalue()).decode()
        start = threading.Barrier(4)
        def upload_photo():
            start.wait()
            return client.post('/api/photos', json={'data': encoded})
        def search_stories():
            start.wait()
            return client.post('/api/stories/search', json={'query': query, 'mode': 'semantic'})
        with ThreadPoolExecutor(max_workers=4) as pool:
            uploads = [pool.submit(upload_photo) for _ in range(3)]
            search = pool.submit(search_stories)
            responses = [upload.result() for upload in uploads]
            search_response = search.result()
        assert all(response.status_code in (201, 503) for response in responses)
        busy = [response for response in responses if response.status_code == 503]
        assert busy, 'Overlapping large uploads must use bounded admission'
        assert all(response.headers.get('retry-after') == '1' for response in busy)
        accepted = [response for response in responses if response.status_code == 201]
        assert accepted
        # A rejected upload remains retryable once the active one finishes.
        retry = client.post('/api/photos', json={'data': encoded})
        retry.raise_for_status()
        search_response.raise_for_status()
        assert search_response.json()['mode'] == 'semantic'
        photo = accepted[0].json()
        assert client.get(photo['url']).status_code == 200
        assert client.get('/api/health').status_code == 200
        print(json.dumps({'health': 'pass', 'model': 'semantic', 'items': len(matches['items']),
                          'max_pixel_upload': 'pass', 'input_format': 'RGBA PNG', 'concurrent_uploads': 'bounded',
                          'busy_uploads': len(busy), 'upload_retry': 'pass',
                          'concurrent_search_mode': search_response.json()['mode']}))


if __name__ == '__main__':
    main()
