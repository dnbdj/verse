import { useState } from "react";
import { formatTime } from "../lib/format";
import type { Playlist, Track } from "../lib/types";
import { PlayIcon, PlusIcon } from "./icons";

type Props = {
  tracks: Track[];
  currentId: string | null;
  playlists: Playlist[];
  onPlay: (track: Track) => void;
  onAddToPlaylist: (playlistId: string, trackId: string) => void;
  onRemove?: (track: Track) => void;
  emptyMessage?: string;
};

export function TrackTable({
  tracks,
  currentId,
  playlists,
  onPlay,
  onAddToPlaylist,
  onRemove,
  emptyMessage = "Nothing here yet.",
}: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  if (tracks.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="panel">
      {tracks.map((track, index) => (
        <div
          key={track.id}
          className="track-row"
          data-current={track.id === currentId}
          style={{ position: "relative" }}
          onDoubleClick={() => onPlay(track)}
        >
          <div className="track-index">{index + 1}</div>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <button className="track-play" onClick={() => onPlay(track)} title="Play">
              <PlayIcon size={16} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="track-title">{track.title}</div>
              <div className="track-artist">{track.artist || "Unknown artist"}</div>
            </div>
          </div>
          <div className="track-album">{track.album || "—"}</div>
          <div className="track-dur">{formatTime(track.durationMs)}</div>
          <button
            className="btn-icon"
            style={{ padding: 4 }}
            title="Add to playlist"
            onClick={() => setMenuFor(menuFor === track.id ? null : track.id)}
          >
            <PlusIcon size={15} />
          </button>

          {menuFor === track.id && (
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
      ))}
    </div>
  );
}
