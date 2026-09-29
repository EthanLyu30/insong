import { useEffect, useState } from 'react';
import { apiBaseUrl } from './api';
import { apiRequest } from './memoryClient';

export function useData<T>(path: string, version = 0) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const control = new AbortController(); setValue(null); setError('');
    apiRequest<T>(apiBaseUrl, path, {signal:control.signal}).then(data => {if (!control.signal.aborted) setValue(data);})
      .catch(reason => {if (!control.signal.aborted) setError(reason instanceof Error ? reason.message : '加载失败，请重试。');});
    return () => control.abort();
  }, [path, version]);
  return { value, error };
}
