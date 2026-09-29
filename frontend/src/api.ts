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
};

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function getSongs(signal?: AbortSignal): Promise<Song[]> {
  const response = await fetch(`${apiBaseUrl}/api/songs`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    throw new Error("歌曲加载失败，请稍后重试。");
  }
  return (await response.json()) as Song[];
}

export async function getSong(id: number, signal?: AbortSignal): Promise<Song> {
  const response = await fetch(`${apiBaseUrl}/api/songs/${id}`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "找不到这首演示歌曲。" : "歌曲加载失败，请稍后重试。");
  }
  return (await response.json()) as Song;
}
