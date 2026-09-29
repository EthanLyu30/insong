import { ArrowRight, Heart, MusicNote, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, SpeakerHigh } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Song } from "./api";

type Point = readonly [number, number];
type Quad = readonly [Point, Point, Point, Point];

// Reference coordinates in the 750 × 1000 photo, clockwise from each card's
// unrotated top-left corner. The lower cards keep their sideways orientation.
const slots: { name: string; corners: Quad }[] = [
  { name: "top", corners: [[238, 89], [506, 96], [451, 376], [287, 373]] },
  { name: "upper-left", corners: [[-12, 348], [153, 185], [308, 397], [184, 495]] },
  { name: "upper-right", corners: [[573, 166], [757, 328], [568, 479], [453, 382]] },
  { name: "lower-left", corners: [[15, 725], [-25, 480], [240, 490], [260, 638]] },
  { name: "lower-right", corners: [[754, 482], [715, 742], [486, 636], [508, 494]] },
];

// Project a portrait player onto its four reference corners. A homography
// preserves the taper that a plain rotate() loses; outer geometry never animates.
function cardProjection([p0, p1, p2, p3]: Quad): string {
  const dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0];
  const dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1];
  const dx3 = p0[0] - p1[0] + p2[0] - p3[0];
  const dy3 = p0[1] - p1[1] + p2[1] - p3[1];
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = p1[0] - p0[0] + g * p1[0];
  const b = p3[0] - p0[0] + h * p3[0];
  const d = p1[1] - p0[1] + g * p1[1];
  const e = p3[1] - p0[1] + h * p3[1];
  return `matrix3d(${a / 240},${d / 240},0,${g / 240},${b / 380},${e / 380},0,${h / 380},0,0,1,0,${p0[0]},${p0[1]},0,1)`;
}
const projections = slots.map((slot) => cardProjection(slot.corners));

function Artwork({ songs, activeId, className }: { songs: Song[]; activeId: number; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {songs.map((song) => (
        <img key={song.id} src={`/covers/song-${song.id}.png`} alt="" className={song.id === activeId ? "is-visible" : ""} draggable={false} />
      ))}
    </span>
  );
}

function PlayerDetails({ title }: { title: string }) {
  return (
    <span className="collage-player-details" aria-hidden="true">
      <span className="collage-track"><span><strong>{title}</strong><small>歌里有我 · 演示曲目</small></span><Heart size={15} /></span>
      <span className="collage-track-progress"><i /></span>
      <span className="collage-track-times"><span>0:00</span><span>0:48</span></span>
      <span className="collage-track-controls"><Shuffle /><SkipBack weight="fill" /><Play weight="fill" /><SkipForward weight="fill" /><Repeat /></span>
      <span className="collage-track-volume"><SpeakerHigh /><i /><SpeakerHigh weight="fill" /></span>
      <span className="collage-track-footer">点选这首歌</span>
    </span>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function MemoryCollage({ songs }: { songs: Song[] }) {
  const [params] = useSearchParams();
  const themeQuery = params.get('theme') ? `?theme=${encodeURIComponent(params.get('theme')!)}` : '';
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [scale, setScale] = useState(0.5);
  const sceneRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const resize = () => setScale(scene.getBoundingClientRect().width / 750);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(scene);
    return () => observer.disconnect();
  }, [songs.length]);

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
      <div className={`collage-scene${isPaused || reducedMotion ? " is-paused" : ""}`} ref={sceneRef}>
        <div className="collage-stage" style={{ transform: `scale(${scale})` }}>
          <img className="collage-backdrop" src="/collage-scene.png" alt="" draggable={false} />
          <span className="collage-scene-label">我的生活，有它的配乐。</span>
          {visibleSongs.map((song, index) => (
            <button
              className={`collage-card collage-card--${slots[index].name}${selected.id === song.id ? " is-selected" : ""}`}
              style={{ transform: projections[index] }}
              type="button"
              key={slots[index].name}
              aria-label={`选择演示歌曲《${song.title}》`}
              aria-pressed={selected.id === song.id}
              onFocus={() => setIsPaused(true)}
              onClick={() => { setSelectedId(song.id); setIsPaused(true); }}
            >
              <Artwork songs={songs} activeId={song.id} className="collage-card-art" />
              <PlayerDetails title={song.title} />
            </button>
          ))}
          <Link className="collage-phone" to={`/songs/${selected.id}${themeQuery}`} aria-label={`打开《${selected.title}》的记忆入口`} onFocus={() => setIsPaused(true)}>
            <span className="collage-phone-status" aria-hidden="true"><span>14:36</span><span>••• ▰</span></span>
            <span className="collage-phone-player">
              <Artwork songs={songs} activeId={selected.id} className="collage-phone-art" />
              <PlayerDetails title={selected.title} />
            </span>
          </Link>
          <span className="collage-year" aria-hidden="true">2026</span>
          <MusicNote className="collage-note collage-note--left" weight="fill" aria-hidden="true" />
          <MusicNote className="collage-note collage-note--right" weight="fill" aria-hidden="true" />
          <span className="collage-scene-footnote">后来才发现，记住的从来不只是歌。<br />还有那时的风，和当时的我们。</span>
        </div>
      </div>

      <div className="collage-copy">
        <div className="collage-copy-topline">
          <span className="section-kicker">把故事留在旋律里</span>
          <button className="collage-motion-toggle" type="button" disabled={reducedMotion} aria-pressed={!isPaused && !reducedMotion} onClick={() => { setIsPaused((value) => !value); setSelectedId(null); }}>
            {isPaused || reducedMotion ? <Play weight="fill" /> : <Pause weight="fill" />}
            {reducedMotion ? "静止画面" : isPaused ? "继续轮播" : "暂停轮播"}
          </button>
        </div>
        <h1>有些时刻，<br /><em>会住在歌里。</em></h1>
        <p>把那时的自己，留在一句歌里。<br />愿意分享时，也许会有人在这里遇见共鸣。</p>
        <Link className="collage-primary" to={`/songs/${selected.id}${themeQuery}`}>从《{selected.title}》开始 <ArrowRight aria-hidden="true" /></Link>
        <span className="collage-disclaimer">原创器乐样例 · 可试听 · 记忆默认仅自己可见</span>
      </div>
    </section>
  );
}
