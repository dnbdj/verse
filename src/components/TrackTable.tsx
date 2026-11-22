import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "../lib/format";
import { serviceById } from "../lib/services";
import type { Playlist, Track } from "../lib/types";
import { CloseIcon, PlayIcon, PlusIcon } from "./icons";

type Props = {
  tracks: Track[];
  currentId: string | null;
  playlists: Playlist[];
  onPlay: (track: Track) => void;
  onAddToPlaylist: (playlistId: string, trackId: string) => void;
  onRemove?: (track: Track) => void;
  /**
   * When set, rows can be dragged (or moved with Alt+↑/↓) to change playlist order.
   * `beforeId` is the row the dragged track should land in front of; null means the end.
   */
  onReorderTrack?: (fromId: string, beforeId: string | null) => void;
  emptyMessage?: string;
};

const EDGE = 76;
const MAX_STEP = 18;

/** The scroll container the playlist lives in; the panel itself is not scrollable. */
function scrollHostOf(element: HTMLElement | null): HTMLElement | null {
  return element?.closest<HTMLElement>(".main-scroll") ?? null;
}

export function TrackTable({
  tracks,
  currentId,
  playlists,
  onPlay,
  onAddToPlaylist,
  onRemove,
  onReorderTrack,
  emptyMessage = "Nothing here yet.",
}: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragIndex = useRef(-1);
  const scroll = useRef<{ host: HTMLElement; step: number } | null>(null);
  const timer = useRef(0);

  // A timer rather than requestAnimationFrame: browsers pause rAF in hidden or
  // background windows, and a long drag should keep scrolling there too.
  const setAutoScroll = useCallback((host: HTMLElement | null, step: number) => {
    if (!host || step === 0) {
      scroll.current = null;
      if (timer.current) {
        window.clearInterval(timer.current);
        timer.current = 0;
      }
      return;
    }
    scroll.current = { host, step };
    if (!timer.current) {
      timer.current = window.setInterval(() => {
        const state = scroll.current;
        if (!state) return;
        const max = state.host.scrollHeight - state.host.clientHeight;
        state.host.scrollTop = Math.min(max, Math.max(0, state.host.scrollTop + state.step));
      }, 24);
    }
  }, []);

  const stopDragging = useCallback(() => {
    dragIndex.current = -1;
    setDragging(null);
    setInsertAt(null);
    setAutoScroll(null, 0);
  }, [setAutoScroll]);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
    },
    [],
  );

  if (tracks.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">{emptyMessage}</div>
      </div>
    );
  }

  const reorderable = Boolean(onReorderTrack);
  const activeFrom = dragIndex.current;
  const showInsert =
    dragging !== null &&
    insertAt !== null &&
    insertAt !== activeFrom &&
    insertAt !== activeFrom + 1;

  return (
    <div className="panel">
      {tracks.map((track, index) => {
        const remote = track.remote;
        const canDrag = reorderable && !remote;
        return (
        <div
          key={track.id}
          className="track-row"
          data-current={track.id === currentId}
          data-reorderable={canDrag}
          data-dragging={dragging === track.id}
          data-insert-before={showInsert && insertAt === index}
          data-insert-after={showInsert && insertAt === tracks.length && index === tracks.length - 1}
          style={{ position: "relative" }}
          draggable={canDrag}
          tabIndex={canDrag ? 0 : undefined}
          aria-label={
            canDrag
              ? `${track.title} — drag to reorder, or press Alt with the arrow keys`
              : undefined
          }
          onDoubleClick={() => onPlay(track)}
          onKeyDown={(event) => {
            if (!canDrag || !onReorderTrack || !event.altKey) return;
            if (event.key === "ArrowUp" && index > 0) {
              event.preventDefault();
              onReorderTrack(track.id, tracks[index - 1].id);
            } else if (event.key === "ArrowDown" && index < tracks.length - 1) {
              event.preventDefault();
              onReorderTrack(track.id, tracks[index + 2]?.id ?? null);
            }
          }}
          onDragStart={(event) => {
            if (!canDrag) return;
            dragIndex.current = index;
            setDragging(track.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", track.id);
          }}
          onDragOver={(event) => {
            if (!reorderable || dragIndex.current < 0) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";

            const rect = event.currentTarget.getBoundingClientRect();
            const host = scrollHostOf(event.currentTarget);
            if (host) {
              const bounds = host.getBoundingClientRect();
              const top = bounds.top + EDGE;
              const bottom = bounds.bottom - EDGE;
              let step = 0;
              if (event.clientY < top) {
                step = -Math.ceil(((top - event.clientY) / EDGE) * MAX_STEP);
              } else if (event.clientY > bottom) {
                step = Math.ceil(((event.clientY - bottom) / EDGE) * MAX_STEP);
              }
              setAutoScroll(host, Math.max(-MAX_STEP, Math.min(MAX_STEP, step)));
            }

            const before = event.clientY < rect.top + rect.height / 2;
            setInsertAt(Math.max(0, Math.min(tracks.length, before ? index : index + 1)));
          }}
          onDragLeave={(event) => {
            // Only clear when the pointer leaves the panel, not when it crosses a row edge.
            const panel = (event.currentTarget as HTMLElement).parentElement;
            const next = event.relatedTarget as Node | null;
            if (panel && next && panel.contains(next)) return;
            setInsertAt(null);
          }}
          onDragEnd={stopDragging}
          onDrop={(event) => {
            if (!onReorderTrack) return;
            event.preventDefault();
            const from = dragIndex.current;
            const target = insertAt;
            stopDragging();
            if (from < 0 || target === null) return;
            const beforeId = target >= tracks.length ? null : tracks[target].id;
            if (beforeId === tracks[from].id) return;
            onReorderTrack(tracks[from].id, beforeId);
          }}
        >
          <div className="track-index">
            {canDrag ? (
              <span className="track-grip" aria-hidden>
                ⋮⋮
              </span>
            ) : (
              index + 1
            )}
          </div>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <button className="track-play" onClick={() => onPlay(track)} title="Play">
              <PlayIcon size={16} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="track-title">{track.title}</div>
              <div className="track-artist">
                {remote && (
                  <span className="track-source">{serviceById(remote.service).name}</span>
                )}
                {track.artist || "Unknown artist"}
              </div>
            </div>
          </div>
          <div className="track-album">{track.album || "—"}</div>
          <div className="track-dur">{formatTime(track.durationMs)}</div>
          {remote ? (
            onRemove && (
              <button
                className="btn-icon"
                style={{ padding: 4 }}
                title="Remove from playlist"
                onClick={() => onRemove(track)}
              >
                <CloseIcon size={13} />
              </button>
            )
          ) : (
            <button
              className="btn-icon"
              style={{ padding: 4 }}
              title="Add to playlist"
              onClick={() => setMenuFor(menuFor === track.id ? null : track.id)}
            >
              <PlusIcon size={15} />
            </button>
          )}

          {!remote && menuFor === track.id && (
            <div className="menu">
              {playlists.length === 0 && (
                <span className="menu-item" style={{ cursor: "default" }}>
                  Create a playlist first
                </span>
              )}
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  className="menu-item"
                  onClick={() => {
                    onAddToPlaylist(playlist.id, track.id);
                    setMenuFor(null);
                  }}
                >
                  {playlist.name}
                </button>
              ))}
              {onRemove && (
                <button
                  className="menu-item"
                  style={{ color: "#e08a7a" }}
                  onClick={() => {
                    onRemove(track);
                    setMenuFor(null);
                  }}
                >
                  Remove from playlist
                </button>
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
