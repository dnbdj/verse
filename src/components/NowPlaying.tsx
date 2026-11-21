import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { assetUrl, api } from "../lib/api";
import { tintFromImage } from "../lib/color";
import { formatTime } from "../lib/format";
import { lineIndexAt, parseLrc, type ParsedLyrics } from "../lib/lrc";
import type { Player } from "../hooks/usePlayer";
import { LyricsPane } from "./LyricsPane";
import { Visualizer } from "./Visualizer";
import {
  CloseIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
} from "./icons";

type Props = { player: Player; onClose: () => void };

export function NowPlaying({ player, onClose }: Props) {
  const track = player.current;
  const trackId = track?.id ?? null;

  const [parsed, setParsed] = useState<ParsedLyrics | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [source, setSource] = useState("none");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [pasting, setPasting] = useState(false);
  const [draft, setDraft] = useState("");
  const [tint, setTint] = useState("#2a2118");

  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    setLoading(true);
    setParsed(null);
    setPlain(null);
    const stored = Number(localStorage.getItem(`verse.offset.${trackId}`) ?? "0");
    setOffset(Number.isFinite(stored) ? stored : 0);

    api
      .lyricsFor(trackId)
      .then((payload) => {
        if (cancelled) return;
        const next = parseLrc(payload.synced ?? "");
        setParsed(next);
        setPlain(payload.plain ?? null);
        setSource(payload.source);
      })
      .catch(() => {
        if (cancelled) return;
        setParsed(null);
        setSource("none");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  useEffect(() => {
    if (!track?.coverPath) {
      setTint("#2a2118");
      return;
    }
    let cancelled = false;
    void tintFromImage(assetUrl(track.coverPath)).then((value) => {
      if (!cancelled) setTint(value);
    });
    return () => {
      cancelled = true;
    };
  }, [track?.coverPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lines = parsed?.lines ?? [];
  const shift = offset + (parsed?.offsetMs ?? 0);
  const effectiveTime = player.position + shift;
  const active = useMemo(() => lineIndexAt(lines, effectiveTime), [lines, effectiveTime]);

  if (!track) return null;

  const nudge = (delta: number) => {
    const next = Math.round((offset + delta) * 100) / 100;
    setOffset(next);
    if (trackId) localStorage.setItem(`verse.offset.${trackId}`, String(next));
  };

  const seekToLine = (time: number) => {
    player.seek(Math.max(0, time - shift));
  };

  const savePasted = async () => {
    if (!trackId) return;
    const payload = await api.saveLyrics(trackId, draft);
    setParsed(parseLrc(payload.synced ?? ""));
    setPlain(null);
    setSource(payload.source);
    setPasting(false);
  };

  const relookup = async () => {
    if (!trackId) return;
    setLoading(true);
    await api.forgetLyrics(trackId);
    const payload = await api.lyricsFor(trackId);
    setParsed(parseLrc(payload.synced ?? ""));
    setPlain(payload.plain ?? null);
    setSource(payload.source);
    setLoading(false);
  };

  const seekPct = player.duration > 0 ? (player.position / player.duration) * 100 : 0;

  return (
    <div className="now-playing-full" style={{ "--tint": tint } as CSSProperties}>
      <div className="now-playing-art">
        {track.coverPath && (
          <div
            className="np-backdrop"
            style={{ backgroundImage: `url(${assetUrl(track.coverPath)})` }}
          />
        )}
        <Visualizer playing={player.playing} seed={track.id.length} />
        {track.coverPath ? (
          <img className="np-cover cover" src={assetUrl(track.coverPath)} alt="" />
        ) : (
          <div className="np-cover cover" />
        )}
      </div>

      <div className="np-side">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="np-title">{track.title}</div>
            <div className="np-sub">
              {track.artist || "Unknown artist"}
              {track.album ? ` · ${track.album}` : ""}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="np-controls">
          <div className="np-seek">
            <span className="time">{formatTime(player.position)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(player.duration, 1)}
              value={Math.min(player.position, player.duration || 0)}
              style={{ "--p": `${seekPct}%` } as CSSProperties}
              onChange={(event) => player.seek(Number(event.target.value))}
              aria-label="Seek"
            />
            <span className="time right">{formatTime(player.duration)}</span>
          </div>

          <div className="transport-row" style={{ gap: 10 }}>
            <button
              className="btn-icon"
              data-active={player.shuffle}
              onClick={player.toggleShuffle}
              title="Shuffle"
            >
              <ShuffleIcon size={18} />
            </button>
            <button className="btn-icon" onClick={player.previous} title="Previous">
              <PrevIcon size={20} />
            </button>
            <button className="play-button" onClick={player.toggle} style={{ width: 46, height: 46 }}>
              {player.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>
            <button className="btn-icon" onClick={player.next} title="Next">
              <NextIcon size={20} />
            </button>
            <button
              className="btn-icon"
              data-active={player.repeat !== "off"}
              onClick={player.cycleRepeat}
              title="Repeat"
            >
              {player.repeat === "one" ? <RepeatOneIcon size={18} /> : <RepeatIcon size={18} />}
            </button>
          </div>
        </div>

        <LyricsPane
          lines={lines}
          active={active}
          timeMs={effectiveTime}
          plain={plain}
          loading={loading}
          source={source}
          onSeek={seekToLine}
        />

        <div className="lyrics-tools">
          <span className="chip">source · {source}</span>
          <button className="chip" onClick={() => nudge(-0.25)} title="Lyrics earlier">
            −0.25s
          </button>
          <span className="chip" style={{ minWidth: 58, justifyContent: "center" }}>
            {offset > 0 ? "+" : ""}
            {offset.toFixed(2)}s
          </span>
          <button className="chip" onClick={() => nudge(0.25)} title="Lyrics later">
            +0.25s
          </button>
          <button
            className="chip"
            onClick={() => {
              setOffset(0);
              if (trackId) localStorage.removeItem(`verse.offset.${trackId}`);
            }}
          >
            reset
          </button>
          <button
            className="chip"
            onClick={() => {
              setDraft(
                lines.length > 0
                  ? lines
                      .map((line, index) => {
                        const m = Math.floor(line.t / 60000);
                        const s = ((line.t % 60000) / 1000).toFixed(2).padStart(5, "0");
                        void index;
                        return `[${String(m).padStart(2, "0")}:${s}]${line.text}`;
                      })
                      .join("\n")
                  : "",
              );
              setPasting(true);
            }}
          >
            paste LRC
          </button>
          <button className="chip" onClick={relookup}>
            look up again
          </button>
        </div>
      </div>

      {pasting && (
        <div className="modal-scrim" onClick={() => setPasting(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 640 }}>Lyrics for {track.title}</div>
                <div style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: 4 }}>
                  Paste plain or timed LRC — <code>[mm:ss.xx]</code> stamps become synced lines.
                </div>
              </div>
              <button className="btn-icon" onClick={() => setPasting(false)}>
                <CloseIcon />
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="[00:12.40]First line&#10;[00:18.10]Second line"
              spellCheck={false}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button className="btn" onClick={() => setPasting(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void savePasted()}>
                Save lyrics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
