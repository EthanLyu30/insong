import { useEffect, useRef } from 'react';

// A server write may finish after leaving the route or switching accounts.
// It may persist, but must never redirect or clear a newer page's draft.
export function useLivePage() {
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  return live;
}
