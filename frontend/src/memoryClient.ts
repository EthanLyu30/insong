import type { Song } from './api';

export type Reflection = { id: string; text: string; created_at: string };
export type Memory = {
  id: number; owner_id: number; song_id: number; song: Song; story: string;
  life_time: string | null; life_precision: string; offset_ms: number | null;
  visibility: 'private' | 'public'; is_demo_sample: boolean; revision: number;
  created_at: string; updated_at: string; reflections: Reflection[]; tags: string[];
};
export type SearchResult = { items: { memory: Memory; evidence: string; match_label: string }[]; mode: 'keyword' | 'semantic'; notice: string };

export function formatPosition(ms: number | null): string {
  if (ms === null) return '整首歌';
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function parsePosition(value: string, duration: number): number | null {
  if (!value.trim()) return null;
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim());
  if (!match) throw new Error('请按 分:秒 填写音乐位置，例如 00:12。');
  const ms = (Number(match[1]) * 60 + Number(match[2])) * 1000;
  if (ms >= duration) throw new Error('这个位置已经超过音乐长度，请重新选择。');
  return ms;
}

export function safeNext(path: string | null): string {
  return path && /^\/(songs\/\d+(\/write)?|memories(\/\d+(\/edit)?)?|discover)(\?[^\\]*)?$/.test(path) ? path : '/memories';
}

export async function apiRequest<T>(base: string, path: string, options: RequestInit = {}, request: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try {
    response = await request(base + path, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('暂时连接不上，请检查服务后再试。填写的内容还在。');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === 'string' ? body.detail : '请检查填写内容，然后重试。');
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function dayLabel(value: string): string {
  return new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z').toLocaleDateString('zh-CN');
}
