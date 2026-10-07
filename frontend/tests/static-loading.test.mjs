import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
async function fontCss(file){
  let css=await readFile(file,'utf8');
  for(const match of css.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g))css+='\n'+await fontCss(path.resolve(path.dirname(file),match[1]));
  return css;
}
test('the home handwriting downloads at most 180 KiB instead of the entire typeface',async()=>{
  const css=await fontCss(path.join(root,'src/styles.css'));
  const text='歌里有我后来才发现记住的从来不只是歌还有那时的风和当时的我们追过的光留在歌里散场以后凌晨三点的耳机夏天最后一首歌下一站再见回声。';
  const needed=new Set();
  for(const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)){
    const face=match[1];if(!face.includes('Wanwei Handwriting'))continue;
    const source=/url\(['"]?([^'"\)]+)/.exec(face)?.[1];assert.ok(source);
    const ranges=/unicode-range:\s*([^;]+)/.exec(face)?.[1];
    const includes=cp=>!ranges||ranges.split(',').some(range=>{const [start,end]=range.trim().replace(/^U\+/,'').split('-').map(part=>parseInt(part,16));return cp>=start&&cp<=(end??start);});
    if([...text].some(char=>includes(char.codePointAt(0))))needed.add(source);
  }
  assert.ok(needed.size,'the original handwriting must still be available');
  let bytes=0;for(const source of needed)bytes+=(await stat(path.join(root,'public',source))).size;
  assert.ok(bytes<=180*1024,`home needs ${bytes} font bytes`);
});

test('immutable cache rules cover versioned static assets and exclude private routes',async()=>{
  const config=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));
  const cacheFor=url=>(config.headers??[]).filter(rule=>rule.source.endsWith('/:path*')?url.startsWith(rule.source.slice(0,-6)):url===rule.source).flatMap(rule=>rule.headers).filter(header=>header.key.toLowerCase()==='cache-control').map(header=>header.value);
  assert.ok(cacheFor('/assets/index-abc123.js').some(value=>value.includes('immutable')));
  assert.ok(cacheFor('/fonts/chunks/wanwei-abc123.woff2').some(value=>value.includes('immutable')));
  for(const url of ['/','/api/me','/api/photos/example','/api/memories','/memories','/create'])assert.deepEqual(cacheFor(url),[],`no static cache override for ${url}`);
});
