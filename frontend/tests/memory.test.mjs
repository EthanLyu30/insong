import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPosition, parsePosition, safeNext, apiRequest, timelineGroups } from '../src/memoryClient.ts';

test('life timeline uses explicit years and never guesses from vague life labels', () => {
  const cards = [{id:1,life_year:null,life_time:'去年夏天'}, {id:2,life_year:2021}, {id:3,life_year:2024}, {id:4,life_year:2021}];
  const groups = timelineGroups(cards);
  assert.deepEqual(groups.map(group=>group.year), [2024,2021,null]);
  assert.deepEqual(groups[1].cards.map(card=>card.id),[2,4]);
  assert.equal(groups[2].cards[0].id,1);
});

test('time input is explicit and rejects out of range or malformed values', () => {
  assert.equal(formatPosition(12300), '00:12');
  assert.equal(formatPosition(null), '整首歌');
  assert.equal(parsePosition('00:12', 48000), 12000);
  assert.equal(parsePosition('', 48000), null);
  for (const value of ['-1', '0:60', '00:48', 'abc', '1:2:3']) {
    assert.throws(() => parsePosition(value, 48000));
  }
});
test('login destination cannot leave this app', () => {
  assert.equal(safeNext('/songs/1/write?at=12'), '/songs/1/write?at=12');
  assert.equal(safeNext('//evil.example'), '/memories');
  assert.equal(safeNext('https://evil.example'), '/memories');
  assert.equal(safeNext('/\\evil.example'), '/memories');
});
test('API errors preserve a useful server message and never masquerade as success', async () => {
  await assert.rejects(apiRequest('', '/api/memories', {}, async () => new Response(JSON.stringify({detail:'记忆已更新'}), {status:409})), /记忆已更新/);
  await assert.rejects(apiRequest('', '/api/memories', {}, async () => {throw new Error('socket');}), /连接/);
  let captured;
  assert.equal(await apiRequest('', '/api/memories/1', {method:'DELETE'}, async (_, options) => {captured=options;return new Response(null,{status:204});}), undefined);
  assert.equal(captured.credentials, 'include');
});
