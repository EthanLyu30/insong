"""Data integrity gates for the reviewed concert catalog, without network or DB access."""
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest


CATALOG_PATH = Path(__file__).parents[1] / 'app' / 'footprint_catalog.json'

# Attendance and saved playlists refer to these IDs. Correcting an announcement
# must preserve the record, including the three subsequently cancelled shows.
ORIGINAL_EVENT_IDS = {
    'gem-chongqing-20260822', 'gem-ganzhou-20250802', 'gem-ganzhou-20250803',
    'gem-hangzhou-20260710', 'gem-hangzhou-20260711', 'gem-hangzhou-20260712',
    'gem-nanchang-20260808', 'gem-sanya-20251206', 'gem-sanya-20251207',
    'gem-shenzhen-20260911', 'gem-shenzhen-20260912', 'gem-shenzhen-20260913',
    'gem-shenzhen-20260919', 'gem-shenzhen-20260920', 'gem-shenzhen-20260925',
    'gem-shenzhen-20260926', 'gem-shenzhen-20260927', 'gem-shenzhen-20261001',
    'gem-shenzhen-20261002', 'gem-shenzhen-20261004', 'gem-shenzhen-20261005',
    'gem-tianjin-20260724', 'gem-tianjin-20260725', 'gem-tianjin-20260726',
    'gem-xiamen-20260501', 'gem-xiamen-20260502', 'gem-xiamen-20260503',
    'liu-yuxin-beijing-20250920', 'liu-yuxin-guangzhou-20251018',
    'luo-tianyi-jinan-20261005', 'phoenix-jinan-20260925', 'phoenix-jinan-20260926',
    'phoenix-jinan-20260927', 'phoenix-jinan-20261002', 'phoenix-jinan-20261003',
    'phoenix-jinan-20261004', 'tnt-shanghai-20260802', 'tnt-shanghai-20260803',
    'tnt-shanghai-20260805', 'tnt-shanghai-20260806',
}


@pytest.fixture(scope='module')
def catalog():
    return json.loads(CATALOG_PATH.read_text(encoding='utf-8'))


def assert_https_url(value):
    parsed = urlparse(value)
    assert parsed.scheme == 'https' and parsed.hostname, value
    assert not parsed.username and not parsed.password, value


def test_catalog_ids_and_references(catalog):
    artists = catalog['artists']
    cities = catalog['cities']
    events = catalog['events']
    artist_ids = {artist['id'] for artist in artists}
    city_names = {city['name'] for city in cities}
    event_ids = {event['id'] for event in events}
    assert len(artist_ids) == len(artists)
    assert len({city['id'] for city in cities}) == len(cities)
    assert len(city_names) == len(cities)
    assert len(event_ids) == len(events)
    assert ORIGINAL_EVENT_IDS <= event_ids
    assert len({(event['artist_id'], event['date'], event['venue']) for event in events}) == len(events)
    for event in events:
        assert event['artist_id'] in artist_ids
        assert event['city'] in city_names
        assert event['title'] and event['venue']
        assert date.fromisoformat(event['date']).isoformat() == event['date']


def test_every_event_has_provenance_and_explicit_time_uncertainty(catalog):
    reviewed = date.fromisoformat(catalog['verified_on'])
    assert catalog['coverage_note']
    for event in catalog['events']:
        assert_https_url(event['source_url'])
        assert event['source_title']
        assert event['source_kind'] in {'announcement', 'report'}
        assert date.fromisoformat(event['verified_on']) <= reviewed
        if event.get('time'):
            assert re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', event['time'])
        else:
            assert '未核实' in event['time_note']
        for source in event.get('source_references', []):
            assert_https_url(source['url'])
            assert source['title']
            assert source['kind'] in {'announcement', 'report'}
            assert date.fromisoformat(source['verified_on']) <= reviewed


def test_venue_locations_are_consistent_and_not_city_fallbacks(catalog):
    city_points = {city['name']: (city['lng'], city['lat']) for city in catalog['cities']}
    venue_points = {}
    for event in catalog['events']:
        lng, lat = event['venue_lng'], event['venue_lat']
        assert isinstance(lng, (int, float)) and not isinstance(lng, bool)
        assert isinstance(lat, (int, float)) and not isinstance(lat, bool)
        assert -180 <= lng <= 180 and -90 <= lat <= 90
        city_lng, city_lat = city_points[event['city']]
        assert abs(lng - city_lng) < 1.5 and abs(lat - city_lat) < 1.5
        assert (lng, lat) != (city_lng, city_lat)
        assert event['venue_coordinate_system'] == 'WGS84'
        assert event['venue_location_kind'] in {'poi', 'building_center'}
        assert_https_url(event['venue_location_source'])
        assert date.fromisoformat(event['venue_location_verified_on']) <= date.fromisoformat(catalog['verified_on'])
        point = (event['city'], lng, lat, event['venue_location_source'])
        assert venue_points.setdefault(event['venue'], point) == point
    # The arena and stadium at the same sports complex are different map targets.
    stadium = venue_points['深圳大运中心体育场']
    arena = venue_points['深圳大运中心体育馆']
    assert stadium[1:3] != arena[1:3]


def test_song_collections_use_qq_search_and_do_not_claim_live_setlists(catalog):
    artist_names = {artist['id']: artist['name'] for artist in catalog['artists']}
    for event in catalog['events']:
        assert event['setlist_kind'] == 'artist_collection'
        assert '实际' in event['setlist_note'] and '待核实' in event['setlist_note']
        assert len({song['title'] for song in event['songs']}) == len(event['songs'])
        for song in event['songs']:
            assert song['title'] and song['artist'] == artist_names[event['artist_id']]
            parsed = urlparse(song['url'])
            assert parsed.scheme == 'https' and parsed.hostname == 'y.qq.com'
            assert parsed.path == '/n/ryqq_v2/search'
            assert parse_qs(parsed.query) == {'w': [song['artist'] + ' ' + song['title']]}
            assert song['platform'] == 'QQ音乐' and song['link_kind'] == 'search'
            assert not song.get('audio_url')
            if song.get('source_url'):
                assert_https_url(song['source_url'])
                assert song['source_title'] and date.fromisoformat(song['verified_on'])


def test_cancelled_hangzhou_dates_keep_their_ids_and_cancellation_source(catalog):
    by_id = {event['id']: event for event in catalog['events']}
    for day in ('10', '11', '12'):
        event = by_id[f'gem-hangzhou-202607{day}']
        assert event['event_status'] == 'cancelled'
        assert '取消' in event['event_status_note']
        assert_https_url(event['cancellation_source_url'])
        assert event['cancellation_source_title']
        assert date.fromisoformat(event['cancellation_verified_on'])
        assert any(source['url'] == event['cancellation_source_url'] for source in event['source_references'])


def test_reviewed_liu_stops_and_original_tracks_remain_available(catalog):
    liu = [event for event in catalog['events'] if event['artist_id'] == 'liu-yuxin']
    assert {'北京', '广州', '上海', '苏州', '深圳'} <= {event['city'] for event in liu}
    for event in liu:
        titles = {song['title'] for song in event['songs']}
        assert {'原来那个人', '看着月亮想你', 'REALITY', 'WALLS', '飓', 'Boom Tick Boom',
                'Of Course', '练习曲', 'Baby I Know', 'Look Into The Mirror'} <= titles
