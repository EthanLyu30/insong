// Component tests control API timing; preload the SSR route modules so the
// browser's separate chunk-download timing does not escape React's act scope.
export async function loadApp(server){
  for(const page of ['AccountPage','MemoryPages','PublicPages','CreationPage','SongPicker'])
    await server.ssrLoadModule(`/src/${page}.tsx`);
  return server.ssrLoadModule('/src/App.tsx');
}
