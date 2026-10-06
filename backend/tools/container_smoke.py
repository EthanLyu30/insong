"""Exercise only synthetic data in a CI container; report genuine E5 execution."""
from concurrent.futures import ThreadPoolExecutor
import base64
from io import BytesIO
import json
import os
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
        # The allowed maximum decoded pixel count, with a compact generated JPEG.
        Image.new('RGB', (5000, 4000), '#b78664').save(data, format='JPEG')
        encoded = base64.b64encode(data.getvalue()).decode()
        with ThreadPoolExecutor(max_workers=2) as pool:
            upload = pool.submit(client.post, '/api/photos', json={'data': encoded})
            search = pool.submit(client.post, '/api/stories/search', json={'query': query, 'mode': 'semantic'})
            photo_response, search_response = upload.result(), search.result()
        photo_response.raise_for_status()
        search_response.raise_for_status()
        photo = photo_response.json()
        assert client.get(photo['url']).status_code == 200
        assert client.get('/api/health').status_code == 200
        print(json.dumps({'health': 'pass', 'model': 'semantic', 'items': len(matches['items']),
                          'max_pixel_upload': 'pass', 'concurrent_search_mode': search_response.json()['mode']}))


if __name__ == '__main__':
    main()
