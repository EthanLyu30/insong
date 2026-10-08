import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';

async function cameraModule(){return import('../src/regionalMapView.ts').catch(()=>({}));}

test('regional view frames province-scale surroundings rather than a single venue roof',async()=>{
  const {regionalMapView}=await cameraModule();assert.equal(typeof regionalMapView,'function');
  const region={key:'sz',center:[114.06,22.54],bounds:[[113.92,22.42],[114.2,22.66]],eventIds:['one']};
  const view=regionalMapView(null,region);
  assert.deepEqual(view.center,[114.06,22.54]);
  assert.ok(view.bounds[1][0]-view.bounds[0][0]>=7.5);
  assert.ok(view.bounds[1][1]-view.bounds[0][1]>=5);
  assert.ok(view.bounds[0][0]<=110.5&&view.bounds[1][0]>=117.5,'Guangdong and adjoining geography remain understandable');
  assert.equal(view.pitch,0);assert.equal(view.bearing,0);assert.equal(view.duration,0);
  assert.ok(view.maxZoom<7,'default framing must not enter vector street detail');
});

test('explicit city view stays regional and does not borrow the previous city or personal region',async()=>{
  const {regionalMapView}=await cameraModule();assert.equal(typeof regionalMapView,'function');
  const view=regionalMapView({lng:118.08,lat:24.48},{center:[114,22],bounds:[[113,21],[115,23]]});
  assert.deepEqual(view.center,[118.08,24.48]);
  assert.ok(view.bounds[0][0]>113.5&&view.bounds[1][0]>121);
  assert.equal(view.duration,0);
});

test('a broad known region is not cropped away while a no-data map uses an honest fixed overview',async()=>{
  const {regionalMapView}=await cameraModule();assert.equal(typeof regionalMapView,'function');
  const wide=regionalMapView(null,{center:[110,30],bounds:[[100,20],[120,40]]});
  assert.deepEqual(wide.bounds,[[100,20],[120,40]]);
  const empty=regionalMapView(null,null);
  assert.deepEqual(empty.center,[120.75,31.3]);assert.equal(empty.duration,0);
});

test('regional frame application jumps once to the fitted view without scheduling a flight or projection',async()=>{
  const {applyRegionalMapView}=await cameraModule();assert.equal(typeof applyRegionalMapView,'function');
  const calls=[];
  const map={stop(){calls.push(['stop']);},setPadding(p){calls.push(['padding',p]);},setTransformCameraUpdate(value){calls.push(['transform',value]);},setCenterElevation(value){calls.push(['elevation',value]);},setVerticalFieldOfView(value){calls.push(['fov',value]);},cameraForBounds(bounds,options){calls.push(['fit',bounds,options]);return{center:[114,22.7],zoom:5.4};},jumpTo(options){calls.push(['jump',options]);},flyTo(){throw Error('automatic flight not allowed');},easeTo(){throw Error('automatic easing not allowed');}};
  const view={center:[114.06,22.54],bounds:[[110.26,19.94],[117.86,25.14]],maxZoom:6.4,pitch:0,bearing:0,duration:0};
  applyRegionalMapView(map,view,{height:844,header:185,sheet:278,nav:70});
  const fit=calls.filter(call=>call[0]==='fit');assert.equal(fit.length,1);
  assert.deepEqual(fit[0][1],[[110.26,19.94],[117.86,25.14]]);
  const jumps=calls.filter(call=>call[0]==='jump');assert.equal(jumps.length,1);
  assert.equal(jumps[0][1].pitch,0);assert.equal(jumps[0][1].bearing,0);
  assert.deepEqual(jumps[0][1].center,[114,22.7]);assert.equal(jumps[0][1].zoom,5.4);
  assert.ok(fit[0][2].padding.top>=185);assert.ok(fit[0][2].padding.bottom>=348);
  assert.ok(calls.some(call=>call[0]==='transform'&&call[1]===null));
  assert.ok(calls.some(call=>call[0]==='elevation'&&call[1]===0));
});

test('static overview style keeps borders and names without entry fades or aerial background changes',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try{
    const {atlasMapStyle}=await server.ssrLoadModule('/src/atlasMapStyle.ts');
    const style=atlasMapStyle(true);
    assert.equal(style.transition.duration,0);
    assert.ok(!style.layers.some(layer=>layer.type==='raster'||layer.type==='hillshade'),'the flat view has no background imagery work or fading');
    assert.ok(style.layers.some(layer=>layer.id==='province-names'&&layer.source==='province-labels'),'the overview exposes one real administrative name per province');
    assert.ok(style.layers.some(layer=>layer.id==='city-names'&&layer.source==='cities'));
    assert.equal(style.sources.china.type,'geojson');
    assert.equal(style.layers.find(layer=>layer.id==='china-fill').paint['fill-opacity'],1);
  }finally{await server.close();}
});

test('small-screen regional zoom still exposes province and city names instead of a blank outline',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try{
    const {atlasMapStyle}=await server.ssrLoadModule('/src/atlasMapStyle.ts');
    const style=atlasMapStyle(true),smallFrameZoom=3.9;
    for(const id of ['province-names','city-names']){
      const layer=style.layers.find(layer=>layer.id===id);
      assert.ok((layer.minzoom??0)<=smallFrameZoom&&layer.maxzoom>smallFrameZoom,`${id} must be legible at the observed 360x640 regional view`);
    }
  }finally{await server.close();}
});
