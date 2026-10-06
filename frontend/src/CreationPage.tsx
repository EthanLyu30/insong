import {useSearchParams} from 'react-router';
import {LoginGate,MemoryForm} from './MemoryPages';
import {useSession} from './SessionContext';

export function CreationPage(){
  const {user}=useSession();
  const [params]=useSearchParams();
  return user?<MemoryForm key={`${params.get('draft')??params.get('drafts')??'new-memory'}:${params.get('event')??''}`} initialEvent={params.get('event')} initialTheme={params.get('theme')}/>:<LoginGate/>;
}
