import {apiRequest} from './memoryClient';

export type Song = {
  id: number;
  title: string;
  artist: string;
  version: string;
  source_label: string;
  is_demo: boolean;
  audio_available: boolean;
  audio_url: string | null;
  duration_ms: number | null;
  recording_label: string;
  cover_url?: string;
  lyrics?: Lyric[];
  lyrics_note?: string;
  qq_music_url?: string | null;
};

export type Lyric = { id: string; text: string; start_ms: number };

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function getSongs(signal?: AbortSignal): Promise<Song[]> {
  return apiRequest<Song[]>(apiBaseUrl, '/api/songs', {signal});
}

export async function getSong(id: number, signal?: AbortSignal): Promise<Song> {
  return apiRequest<Song>(apiBaseUrl, `/api/songs/${id}`, {signal});
}
