import type { CSSProperties } from "react";
import { useState } from "react";
import { formatTime } from "../lib/format";
import { assetUrl } from "../lib/api";
import type { Player } from "../hooks/usePlayer";
import {
  ExpandIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeIcon,
} from "./icons";

type Props = {
  player: Player;
  onExpand: () => void;
};

export function PlayerBar({ player, onExpand }: Props) {
  const [showQueue, setShowQueue] = useState(false);
  const { current, position, duration, volume, shuffle, repeat, playing, queue } = player;
  const pct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="player-bar">
      <div
        className="now-playing-mini"
        onClick={onExpand}
        style={{ opacity: current ? 1 : 0.55 }}
        title={current ? "Open now playing" : "Nothing playing"}
      >
        {current?.coverPath ? (
          <img className="cover" src={assetUrl(current.coverPath)} alt="" />
        ) : (
          <div className="cover" style={{ width: 50, height: 50 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="track-title">{current?.title ?? "Nothing playing"}</div>
          <div className="track-artist">
            {current ? current.artist || "Unknown artist" : "Pick a track to start"}
          </div>
        </div>
      </div>

      <div className="transport">
        <div className="transport-row">
          <button
            className="btn-icon"
            data-active={shuffle}
            title="Shuffle"
            onClick={player.toggleShuffle}
          >
            <ShuffleIcon />
          </button>
          <button className="btn-icon" title="Previous" onClick={player.previous}>
            <PrevIcon />
          </button>
          <button className="play-button" onClick={player.toggle} title={playing ? "Pause" : "Play"}>
            {playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
          </button>
          <button className="btn-icon" title="Next" onClick={player.next}>
            <NextIcon />
          </button>
          <button
            className="btn-icon"
            data-active={repeat !== "off"}
            title={repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Repeat off"}
            onClick={player.cycleRepeat}
          >
            {repeat === "one" ? <RepeatOneIcon /> : <RepeatIcon />}
          </button>
        </div>
        <div className="seek-row">
          <span className="time">{formatTime(position)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            value={Math.min(position, duration || 0)}
            style={{ "--p": `${pct}%` } as CSSProperties}
            onChange={(event) => player.seek(Number(event.target.value))}
            aria-label="Seek"
          />
          <span className="time right">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="bar-right" style={{ position: "relative" }}>
        <button className="btn-icon" title="Queue" onClick={() => setShowQueue((v) => !v)}>
          <QueueIcon />
        </button>
        <VolumeIcon />
        <input
          className="volume-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          style={{ "--p": `${volume * 100}%` } as CSSProperties}
          onChange={(event) => player.changeVolume(Number(event.target.value))}
          aria-label="Volume"
        />
        <button className="btn-icon" title="Now playing" onClick={onExpand}>
          <ExpandIcon />
        </button>

        {showQueue && (
          <div
            className="menu"
            style={{ bottom: 46, top: "auto", right: 0, minWidth: 280, maxHeight: 320 }}
          >
            <div
              className="nav-label"
              style={{ padding: "6px 10px 8px", letterSpacing: "0.1em" }}
            >
              Queue
            </div>
            {queue.length === 0 && (
              <span className="menu-item" style={{ cursor: "default" }}>
                Empty
              </span>
            )}
            {queue.map((track, index) => (
              <button
                key={`${track.id}-${index}`}
                className="menu-item"
                style={{ color: track.id === current?.id ? "var(--accent)" : undefined }}
                onClick={() => {
                  player.playQueue(queue, index);
                  setShowQueue(false);
                }}
              >
                {index + 1}. {track.title} — {track.artist || "Unknown"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
