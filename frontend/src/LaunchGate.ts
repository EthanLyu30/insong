import {type ReactNode} from 'react';

export function LaunchGate({children}:{children:ReactNode}){
  // The root route owns the intro; fresh documents must preserve deep links.
  return children;
}
