import { ArrowRight, MusicNotes, Pause, SkipBack, SkipForward } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { Song } from "./api";

const slots = ["top", "upper-left", "upper-right", "lower-left", "lower-right"] as const;

function coverPath(song: Song): string {
  return `/covers/song-${song.id}.png`;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function MemoryCollage({ songs }: { songs: Song[] }) {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (isPaused || reducedMotion || songs.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setOffset((value) => (value + 1) % songs.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [isPaused, reducedMotion, songs.length]);

  const visibleSongs = useMemo(
    () => slots.map((_, index) => songs[(index + offset) % songs.length]).filter((song): song is Song => Boolean(song)),
    [offset, songs],
  );
  const selected = songs.find((song) => song.id === selectedId) ?? visibleSongs[0];

  if (!selected) return null;

  return (
    <section className="collage-section" aria-label="从演示歌曲中选一首">
      <div className="collage-scene">
        <span className="collage-scene-label">五首歌 · 五个可能被记住的瞬间</span>
        {visibleSongs.map((song, index) => (
          <button
            className={`collage-card collage-card--${slots[index]}${selected.id === song.id ? " is-selected" : ""}`}
            type="button"
            key={slots[index]}
            aria-label={`选择演示歌曲《${song.title}》`}
            aria-pressed={selected.id === song.id}
            onClick={() => {
              setSelectedId(song.id);
              setIsPaused(true);
            }}
          >
            <span className="collage-card-art" key={`${slots[index]}-${song.id}`}>
              <img src={coverPath(song)} alt="" loading={index < 3 ? "eager" : "lazy"} />
            </span>
            <span className="collage-card-meta">
              <strong>{song.title}</strong>
              <small>虚构演示曲目</small>
              <span className="collage-card-progress" aria-hidden="true"><i /></span>
              <span className="collage-card-controls" aria-hidden="true"><SkipBack weight="fill" /><Pause weight="fill" /><SkipForward weight="fill" /></span>
            </span>
          </button>
        ))}

        <span className="collage-year" aria-hidden="true">2026</span>
        <Link className="collage-phone" to={`/songs/${selected.id}`} aria-label={`打开《${selected.title}》的记忆入口`}>
          <span className="collage-phone-speaker" aria-hidden="true" />
          <span className="collage-phone-art" key={selected.id}>
            <img src={coverPath(selected)} alt="" />
          </span>
          <span className="collage-phone-content">
            <span className="collage-phone-caption">现在播放 · 演示曲目</span>
            <strong>{selected.title}</strong>
            <span className="collage-phone-progress" aria-hidden="true"><i /></span>
            <span className="collage-phone-controls" aria-hidden="true"><SkipBack weight="fill" /><Pause weight="fill" /><SkipForward weight="fill" /></span>
          </span>
        </Link>
        <MusicNotes className="collage-note collage-note--left" weight="fill" aria-hidden="true" />
        <MusicNotes className="collage-note collage-note--right" weight="fill" aria-hidden="true" />
        <span className="collage-scene-footnote">轻触一张歌卡，让那段记忆慢慢浮现。</span>
      </div>

      <div className="collage-copy">
        <span className="section-kicker">SONGS HOLD STORIES</span>
        <h1>有些时刻，<br /><em>会住在歌里。</em></h1>
        <p>选一首歌，留住它陪你经过的那一刻。先私密收好，想分享时再公开一小段。</p>
        <Link className="collage-primary" to={`/songs/${selected.id}`}>
          从《{selected.title}》开始 <ArrowRight weight="bold" aria-hidden="true" />
        </Link>
        <span className="collage-disclaimer">当前为虚构演示曲目与原创画面，未接入授权音源。</span>
      </div>
    </section>
  );
}
