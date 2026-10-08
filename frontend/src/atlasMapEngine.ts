let library:Promise<typeof import('maplibre-gl')>|undefined;

/** Warm the shared engine while catalog/identity requests are still in flight. */
export function loadAtlasMapEngine(){
  return library??=import('maplibre-gl').catch(reason=>{library=undefined;throw reason;});
}
