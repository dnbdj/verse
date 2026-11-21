import { isAndroid } from "../lib/platform";
import type { Folder, Playlist } from "../lib/types";
import { FolderIcon, MusicIcon, PlusIcon, TrashIcon } from "./icons";

type Props = {
  view: string;
  trackCount: number;
  albumCount: number;
  artistCount: number;
  folders: Folder[];
  playlists: Playlist[];
  scanning: boolean;
  spotifyConnected: boolean;
  onNavigate: (view: string) => void;
  onOpenPlaylist: (id: string) => void;
  onAddFolder: () => void;
  onRemoveFolder: (path: string) => void;
  onCreatePlaylist: () => void;
};

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function Sidebar({
  view,
  trackCount,
  albumCount,
  artistCount,
  folders,
  playlists,
  scanning,
  spotifyConnected,
  onNavigate,
  onOpenPlaylist,
  onAddFolder,
  onRemoveFolder,
  onCreatePlaylist,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" />
        Verse
      </div>

      <div className="nav-group">
        <span className="nav-label">Library</span>
        <button
          className="nav-item"
          data-active={view === "songs"}
          onClick={() => onNavigate("songs")}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <MusicIcon />
            Songs
          </span>
          <span className="nav-count">{trackCount}</span>
        </button>
        <button
          className="nav-item"
          data-active={view === "albums"}
          onClick={() => onNavigate("albums")}
        >
          <span>Albums</span>
          <span className="nav-count">{albumCount}</span>
        </button>
        <button
          className="nav-item"
          data-active={view === "artists"}
          onClick={() => onNavigate("artists")}
        >
          <span>Artists</span>
          <span className="nav-count">{artistCount}</span>
        </button>
        <button
          className="nav-item"
          data-active={view === "spotify"}
          onClick={() => onNavigate("spotify")}
        >
          <span>Spotify</span>
          <span
            className="nav-count"
            style={{
              width: 6,
              height: 6,
              borderRadius: 99,
              background: spotifyConnected ? "#3ecf8e" : "var(--text-faint)",
            }}
          />
        </button>
      </div>

      <div className="nav-group">
        <span className="nav-label" style={{ display: "flex", justifyContent: "space-between" }}>
          Playlists
          <button
            className="btn-icon"
            style={{ padding: 2 }}
            onClick={onCreatePlaylist}
            title="New playlist"
          >
            <PlusIcon size={14} />
          </button>
        </span>
        {playlists.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--text-faint)", padding: "2px 10px" }}>
            None yet
          </span>
        )}
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            className="nav-item"
            data-active={view === `playlist:${playlist.id}`}
            onClick={() => onOpenPlaylist(playlist.id)}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {playlist.name}
            </span>
            <span className="nav-count">{playlist.trackIds.length}</span>
          </button>
        ))}
      </div>

      <div className="nav-group" style={{ marginTop: "auto" }}>
        <span className="nav-label" style={{ display: "flex", justifyContent: "space-between" }}>
          Folders
          <button className="btn-icon" style={{ padding: 2 }} onClick={onAddFolder} title="Add folder">
            <PlusIcon size={14} />
          </button>
        </span>
        {folders.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--text-faint)", padding: "2px 10px", lineHeight: 1.6 }}>
            {scanning ? "Indexing…" : isAndroid() ? "Scan this device for music" : "Add a folder of music to begin"}
          </span>
        )}
        {folders.map((folder) => (
          <div
            key={folder.path}
            className="nav-item"
            style={{ cursor: "default" }}
            title={folder.path}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <FolderIcon size={14} />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 13,
                }}
              >
                {baseName(folder.path)}
              </span>
            </span>
            <button
              className="btn-icon"
              style={{ padding: 2 }}
              title="Remove folder"
              onClick={() => onRemoveFolder(folder.path)}
            >
              <TrashIcon size={13} />
            </button>
          </div>
        ))}
        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={onAddFolder}>
          <PlusIcon size={15} />
          {scanning ? "Indexing…" : isAndroid() ? "Scan device music" : "Add folder"}
        </button>
      </div>
    </aside>
  );
}
