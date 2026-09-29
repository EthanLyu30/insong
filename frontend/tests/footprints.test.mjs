import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('footprint catalog contains unique dated events and explicit primary sources', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../backend/app/footprint_catalog.json', import.meta.url), 'utf8'));
  assert.deepEqual(catalog.artists.map(artist => artist.name), ['邓紫棋', '刘雨昕']);
  assert.equal(new Set(catalog.events.map(event => event.id)).size, catalog.events.length);
  for (const event of catalog.events) {
    assert.ok(catalog.artists.some(artist => artist.id === event.artist_id));
    assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(Date.parse(event.date)));
    assert.ok(new URL(event.source_url).hostname.endsWith('.gov.cn'));
    assert.ok(['report', 'announcement'].includes(event.source_kind));
    assert.ok(event.venue && event.city && event.source_title);
    assert.ok(event.map_x >= 15 && event.map_x <= 85 && event.map_y >= 20 && event.map_y <= 75);
    for (const song of event.songs) {
      assert.ok(['music.apple.com', 'www.kugou.com'].includes(new URL(song.url).hostname));
      assert.ok(!('rank' in song), 'unverified rankings are never presented as facts');
    }
  }
});

test('footprints are selected by artist, manually saved, and stale identity writes are ignored', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5173' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MemoryRouter } = await import('react-router');
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { FootprintsPage } = await server.ssrLoadModule('/src/FootprintsPage.tsx');
  const { SessionProvider } = await server.ssrLoadModule('/src/SessionContext.tsx');
  const root = createRoot(document.getElementById('root'));
  const originalFetch = globalThis.fetch;
  let user = { id: 3, display_name: '听友', is_demo: false }, saved = [], writes = 0, finishWrite;
  const catalog = { artists: [{ id: 'gem', name: '邓紫棋' }, { id: 'liu', name: '刘雨昕' }], events: [
    { id: 'gem-test', artist_id: 'gem', title: '测试演唱会', city: '三亚', venue: '白鹭体育场', date: '2025-12-06', source_url: 'https://gaj.sanya.gov.cn/', source_title: '官方演后记录', source_kind: 'report', songs: [], map_x: 40, map_y: 60 },
    { id: 'gem-other-date', artist_id: 'gem', title: '另一晚演唱会', city: '三亚', venue: '白鹭体育场', date: '2025-12-05', source_url: 'https://gaj.sanya.gov.cn/', source_title: '官方演后记录', source_kind: 'report', songs: [], map_x: 40, map_y: 60 },
    { id: 'liu-test', artist_id: 'liu', title: '仙那度', city: '北京', venue: '五棵松', date: '2025-09-20', source_url: 'https://www.beijing.gov.cn/', source_title: '官方公告', source_kind: 'announcement', songs: [], map_x: 65, map_y: 35 },
  ] };
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/me') return Response.json({ user });
    if (url === '/api/footprints/catalog') return Response.json(catalog);
    if (url === '/api/footprints') return Response.json(saved);
    if (String(url).startsWith('/api/stories?')) return Response.json([]);
    if (url === '/api/footprints/gem-test' && options.method === 'PUT') {
      writes++;
      return new Promise(resolve => { finishWrite = () => { saved = JSON.parse(options.body).attended ? ['gem-test'] : []; resolve(Response.json(saved)); }; });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const click = async label => React.act(async () => {
    const button = [...document.querySelectorAll('button')].find(element => element.textContent.includes(label));
    assert.ok(button, label); button.click();
  });
  try {
    await React.act(async () => root.render(React.createElement(MemoryRouter, null, React.createElement(SessionProvider, null, React.createElement(FootprintsPage)))));
    assert.equal(document.querySelector('.footprint-map'), null, 'choose an artist before browsing venues');
    await click('邓紫棋');
    assert.ok(document.querySelector('.footprint-map'));
    assert.equal(writes, 0, 'browsing a show never records attendance');
    assert.ok(document.querySelector('a[href="/?event=gem-test"]'));
    await click('点亮：我去过');
    await click('保存中');
    assert.equal(writes, 1, 'repeat clicks cannot duplicate a mutation');
    await React.act(async () => finishWrite());
    assert.ok(document.querySelector('.footprint-stamp'));
    await click('取消到场标记');
    await React.act(async () => finishWrite());
    assert.equal(document.querySelector('.footprint-stamp'), null);
    await click('点亮：我去过');
    await click('2025.12.05');
    await React.act(async () => finishWrite());
    assert.equal(document.querySelector('.footprint-stamp'), null, 'saving one date does not mark another date at the same venue');
    await click('2025.12.06');
    assert.ok(document.querySelector('.footprint-stamp'));
    await click('取消到场标记');
    await React.act(async () => finishWrite());
    await click('点亮：我去过');
    await click('刘雨昕');
    await React.act(async () => finishWrite());
    assert.equal(document.querySelector('.footprint-stamp'), null, 'late responses from another artist remain inert');
    await click('邓紫棋');
    assert.ok(document.querySelector('.footprint-stamp'), 'returning reads the authoritative saved state');
    await click('取消到场标记');
    await React.act(async () => finishWrite());
    await click('点亮：我去过');
    await React.act(async () => { user = { id: 4, display_name: '另一位', is_demo: false }; saved = []; window.dispatchEvent(new window.StorageEvent('storage', { key: 'memory-session-change' })); });
    await React.act(async () => finishWrite());
    assert.equal(document.querySelector('.footprint-stamp'), null, 'a previous identity cannot light this identity’s venue');
    await React.act(async () => { user = null; saved = []; window.dispatchEvent(new window.StorageEvent('storage', { key: 'memory-session-change' })); });
    const login = [...document.querySelectorAll('a')].find(link => link.textContent.includes('登录后点亮'));
    assert.ok(login); assert.equal(new URL(login.href).searchParams.get('next'), '/footprints?artist=gem&event=gem-test');
    await click('刘雨昕');
    assert.match(document.querySelector('.footprint-event-title').textContent, /仙那度/);
    assert.equal(document.querySelector('.footprint-stamp'), null);
    await React.act(async () => root.render(React.createElement(MemoryRouter, { key: 'event-link', initialEntries: ['/footprints?event=gem-test'] }, React.createElement(SessionProvider, null, React.createElement(FootprintsPage)))));
    assert.match(document.querySelector('.footprint-event-title')?.textContent ?? '', /测试演唱会/, 'a story’s event-only link resolves the matching artist');
  } finally {
    await React.act(async () => root.unmount()); await server.close();
    globalThis.fetch = originalFetch; dom.window.close();
  }
});
