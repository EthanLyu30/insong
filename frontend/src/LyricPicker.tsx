import type { Song } from './api';
import { formatPosition } from './memoryClient';

export function LyricPicker({song, selected, onSelect, disabled = false}: {song: Song; selected: string | null; onSelect: (id: string, ms: number) => void; disabled?: boolean}) {
  if (!song.lyrics?.length) return null;
  return <section className="lyric-picker" aria-label="选择一句词">
    <span className="journal-eyebrow">{song.is_demo?'选一句示例词句':'选一句，把这一刻放进去'}</span>
    {song.lyrics.map(line => <button type="button" key={line.id} disabled={disabled || !song.audio_available} aria-pressed={selected === line.id} onClick={() => onSelect(line.id, line.start_ms)}><time>{formatPosition(line.start_ms)}</time><span>{line.text}</span><span aria-hidden="true">{selected === line.id ? '✓' : '＋'}</span></button>)}
  </section>;
}
