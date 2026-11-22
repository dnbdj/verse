import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import { moveItem } from "../lib/order";
import { isAndroid } from "../lib/platform";
import { SERVICES, serviceById, type ServiceId } from "../lib/services";
import type { Folder, Playlist, PlaylistFolder } from "../lib/types";
import {
  ChevronIcon,
  FolderIcon,
  GearIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./icons";
import { ServiceLogo } from "./ServiceLogo";

type Props = {
  view: string;
  folders: Folder[];
  playlists: Playlist[];
  playlistFolders: PlaylistFolder[];
  scanning: boolean;
  /** Local tracks, shown as the count on All songs. */
  trackCount: number;
  likedCount: number;
  savedCount: number;
  pinned: ServiceId[];
  onOpenService: (id: ServiceId) => void;
  onReorderPins: (next: ServiceId[]) => void;
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
  onNavigate: (view: string) => void;
  onOpenPlaylist: (id: string) => void;
  onAddFolder: () => void;
  onRemoveFolder: (path: string) => void;
  onCreatePlaylist: () => void;
  onCreatePlaylistFolder: () => void;
  onRenamePlaylistFolder: (id: string, name: string) => void;
  onDeletePlaylistFolder: (id: string) => void;
  onMovePlaylistToFolder: (playlistId: string, folderId: string | null) => void;
};

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

const PLAYLIST_DRAG_PREFIX = "playlist:";
const PLAYLIST_DRAG_TYPE = "application/x-verse-playlist";
const LOOSE_DROP = "loose";

function hasPlaylistDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(PLAYLIST_DRAG_TYPE);
}

function draggedPlaylistId(dataTransfer: DataTransfer): string | null {
  const direct = dataTransfer.getData(PLAYLIST_DRAG_TYPE).trim();
  if (direct) return direct;
  const raw = dataTransfer.getData("text/plain");
  if (!raw.startsWith(PLAYLIST_DRAG_PREFIX)) return null;
  return raw.slice(PLAYLIST_DRAG_PREFIX.length).trim() || null;
}

export function Sidebar({
  view,
  folders,
  playlists,
  playlistFolders,
  scanning,
  trackCount,
  likedCount,
  savedCount,
  pinned,
  onOpenService,
  onReorderPins,
  onOpenPalette,
  onToggleSidebar,
  onNavigate,
  onOpenPlaylist,
  onAddFolder,
  onRemoveFolder,
  onCreatePlaylist,
  onCreatePlaylistFolder,
  onRenamePlaylistFolder,
  onDeletePlaylistFolder,
  onMovePlaylistToFolder,
}: Props) {
  const dragIndex = useRef(-1);
  const [closedFolders, setClosedFolders] = useState<Record<string, boolean>>({});
  const [draggingPlaylist, setDraggingPlaylist] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const renameFinished = useRef(false);

  const byId = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const grouped = new Set(playlistFolders.flatMap((folder) => folder.playlistIds));
  const loose = playlists.filter((playlist) => !grouped.has(playlist.id));
  const playlistRow = (playlist: Playlist, inFolder: boolean) => (
    <button
      key={playlist.id}
      className="nav-item playlist-nav-item"
      data-active={view === `playlist:${playlist.id}`}
      data-in-folder={inFolder}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(PLAYLIST_DRAG_TYPE, playlist.id);
        event.dataTransfer.setData("text/plain", `${PLAYLIST_DRAG_PREFIX}${playlist.id}`);
        setDraggingPlaylist(playlist.id);
      }}
      onDragEnd={() => {
        setDraggingPlaylist(null);
        setDropTarget(null);
      }}
      onClick={() => onOpenPlaylist(playlist.id)}
      title={`${playlist.name} — drag onto a folder to group it`}
    >
      <span className="playlist-nav-name">{playlist.name}</span>
      <span className="nav-count">
        {playlist.trackIds.length + (playlist.remoteTracks?.length ?? 0)}
      </span>
    </button>
  );

  const acceptPlaylistDrag = (event: DragEvent, target: string) => {
    if (!hasPlaylistDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  };

  const leavePlaylistTarget = (event: DragEvent, target: string) => {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) return;
    setDropTarget((current) => (current === target ? null : current));
  };

  const dropPlaylist = (event: DragEvent, folderId: string | null) => {
    if (!hasPlaylistDrag(event.dataTransfer)) return;
    event.preventDefault();
    const playlistId = draggedPlaylistId(event.dataTransfer);
    setDraggingPlaylist(null);
    setDropTarget(null);
    if (!playlistId) return;
    onMovePlaylistToFolder(playlistId, folderId);
  };

  const startRename = (folder: PlaylistFolder) => {
    renameFinished.current = false;
    setRenaming({ id: folder.id, value: folder.name });
  };

  const commitRename = () => {
    if (!renaming || renameFinished.current) return;
    renameFinished.current = true;
    const name = renaming.value.trim();
    const id = renaming.id;
    if (name) onRenamePlaylistFolder(id, name);
    setRenaming(null);
    window.setTimeout(() => document.getElementById(`folder-rename-${id}`)?.focus(), 0);
  };

  const cancelRename = () => {
    if (!renaming || renameFinished.current) return;
    renameFinished.current = true;
    const id = renaming?.id;
    setRenaming(null);
    if (id) window.setTimeout(() => document.getElementById(`folder-toggle-${id}`)?.focus(), 0);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" />
        Verse
        <button className="brand-search" title="Search everything (Ctrl+K)" onClick={onOpenPalette}>
          <SearchIcon size={13} />
          <span className="brand-kbd">⌘K</span>
        </button>
        <button
          className="sidebar-collapse"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          onClick={onToggleSidebar}
        >
          <ChevronIcon size={14} />
        </button>
      </div>

      <div className="nav-group">
        <span className="nav-label">Services</span>
        <button
          className="nav-item"
          data-active={view === "services"}
          onClick={() => onNavigate("services")}
        >
          <span>All services</span>
          <span className="nav-count">{SERVICES.length}</span>
        </button>
        {pinned.map((id, index) => {
            const service = serviceById(id);
            return (
              <div
                key={id}
                className="nav-pin-row"
                draggable
                onDragStart={(event) => {
                  dragIndex.current = index;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = dragIndex.current;
                  dragIndex.current = -1;
                  if (from < 0 || from === index) return;
                  onReorderPins(moveItem(pinned, from, index));
                }}
              >
                <button
                  className="nav-item"
                  data-active={view === `service:${id}`}
                  onClick={() => onOpenService(id)}
                  onKeyDown={(event) => {
                    if (!event.altKey) return;
                    if (event.key === "ArrowUp" && index > 0) {
                      event.preventDefault();
                      onReorderPins(moveItem(pinned, index, index - 1));
                    } else if (event.key === "ArrowDown" && index < pinned.length - 1) {
                      event.preventDefault();
                      onReorderPins(moveItem(pinned, index, index + 1));
                    }
                  }}
                  title={
                    index < 9
                      ? `${service.name} — Alt+${index + 1} opens it; Alt+↑/↓ moves it, or drag`
                      : `${service.name} — Alt+↑/↓ moves it, or drag`
                  }
                >
                  <span className="nav-service-name">
                    <span
                      className="nav-mark"
                      style={{ background: service.color, "--mark-cut": service.color } as CSSProperties}
                    >
                      <ServiceLogo id={id} size={11} />
                    </span>
                    {service.name}
                  </span>
                  {index < 9 && (
                    <kbd className="nav-hotkey" aria-hidden>
                      Alt+{index + 1}
                    </kbd>
                  )}
                </button>
                <span className="pin-moves">
                  <button
                    className="pin-move"
                    aria-label={`Move ${service.name} up`}
                    disabled={index === 0}
                    onClick={() => onReorderPins(moveItem(pinned, index, index - 1))}
                  >
                    ↑
                  </button>
                  <button
                    className="pin-move"
                    aria-label={`Move ${service.name} down`}
                    disabled={index === pinned.length - 1}
                    onClick={() => onReorderPins(moveItem(pinned, index, index + 1))}
                  >
                    ↓
                  </button>
                </span>
              </div>
            );
        })}
      </div>

      <div className="nav-group folders-nav">
        <span className="nav-label">Browse</span>

        <div className="playlist-folder verse-folder">
          <div className="folder-row">
            <button
              id="folder-toggle-verse"
              className="nav-item folder-toggle"
              aria-expanded={!closedFolders.verse}
              aria-controls="folder-list-verse"
              onClick={() =>
                setClosedFolders((prev) => ({ ...prev, verse: !prev.verse }))
              }
              title="Verse — everything you have here"
            >
              <span className="folder-name">
                <span className="folder-chevron" data-open={!closedFolders.verse}>
                  <ChevronIcon dir="right" size={11} />
                </span>
                <FolderIcon size={14} />
                <span className="folder-title">Verse</span>
              </span>
            </button>
            <span className="folder-meta">
              <span className="nav-count">3</span>
            </span>
          </div>
          <div id="folder-list-verse">
            {!closedFolders.verse && (
              <>
                <button
                  className="nav-item playlist-nav-item"
                  data-in-folder="true"
                  data-active={view === "liked"}
                  onClick={() => onNavigate("liked")}
                >
                  <span className="playlist-nav-name">Liked songs</span>
                  <span className="nav-count">{likedCount}</span>
                </button>
                <button
                  className="nav-item playlist-nav-item"
                  data-in-folder="true"
                  data-active={view === "songs"}
                  onClick={() => onNavigate("songs")}
                >
                  <span className="playlist-nav-name">All songs</span>
                  <span className="nav-count">{trackCount}</span>
                </button>
                <button
                  className="nav-item playlist-nav-item"
                  data-in-folder="true"
                  data-active={view === "saved"}
                  onClick={() => onNavigate("saved")}
                >
                  <span className="playlist-nav-name">Saved songs</span>
                  <span className="nav-count">{savedCount}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <span className="nav-label nav-sublabel" style={{ display: "flex", justifyContent: "space-between" }}>
          Folders
          <button
            className="btn-icon"
            style={{ padding: 2 }}
            onClick={onCreatePlaylistFolder}
            title="New playlist folder"
            aria-label="New playlist folder"
          >
            <FolderIcon size={14} />
          </button>
        </span>

        {playlistFolders.length === 0 && (
          <span className="nav-empty">No folders yet</span>
        )}

        {playlistFolders.map((folder) => {
          const open = !closedFolders[folder.id];
          const inside = folder.playlistIds
            .map((id) => byId.get(id))
            .filter((playlist): playlist is Playlist => Boolean(playlist));
          const editing = renaming && renaming.id === folder.id ? renaming : null;
          return (
            <div
              key={folder.id}
              className="playlist-folder"
              data-drag-over={draggingPlaylist !== null}
              data-drop-active={dropTarget === folder.id}
              onDragOver={(event) => acceptPlaylistDrag(event, folder.id)}
              onDragLeave={(event) => leavePlaylistTarget(event, folder.id)}
              onDrop={(event) => dropPlaylist(event, folder.id)}
            >
              {editing ? (
                <div className="folder-row folder-row-editing">
                  <span className="folder-name">
                    <span className="folder-chevron" data-open={open}>
                      <ChevronIcon dir="right" size={11} />
                    </span>
                    <FolderIcon size={14} />
                    <input
                      autoFocus
                      className="folder-rename-input"
                      value={editing.value}
                      maxLength={40}
                      aria-label={`Rename ${folder.name}`}
                      onChange={(event) =>
                        setRenaming({ id: folder.id, value: event.target.value })
                      }
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={commitRename}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </span>
                  <span className="nav-count">{inside.length}</span>
                </div>
              ) : (
                <div className="folder-row">
                  <button
                    id={`folder-toggle-${folder.id}`}
                    className="nav-item folder-toggle"
                    aria-expanded={open}
                    aria-controls={`folder-list-${folder.id}`}
                    onClick={() =>
                      setClosedFolders((prev) => ({ ...prev, [folder.id]: open }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "F2") {
                        event.preventDefault();
                        startRename(folder);
                      }
                    }}
                    title={open ? "Collapse folder" : "Expand folder"}
                  >
                    <span className="folder-name">
                      <span className="folder-chevron" data-open={open}>
                        <ChevronIcon dir="right" size={11} />
                      </span>
                      <FolderIcon size={14} />
                      <span className="folder-title" title={folder.name}>
                        {folder.name}
                      </span>
                    </span>
                  </button>
                  <span className="folder-meta">
                    {dropTarget === folder.id ? (
                      <span className="drop-tag">Drop here</span>
                    ) : (
                      <span className="nav-count">{inside.length}</span>
                    )}
                    <span className="folder-actions">
                      <button
                        id={`folder-rename-${folder.id}`}
                        className="btn-icon folder-action"
                        aria-label={`Rename playlist folder ${folder.name}`}
                        title="Rename folder"
                        onClick={() => startRename(folder)}
                      >
                        <PencilIcon size={12} />
                      </button>
                      <button
                        className="btn-icon folder-action"
                        aria-label={`Delete playlist folder ${folder.name}`}
                        title="Delete folder — playlists are kept"
                        onClick={() => onDeletePlaylistFolder(folder.id)}
                      >
                        <TrashIcon size={12} />
                      </button>
                    </span>
                  </span>
                </div>
              )}
              <div id={`folder-list-${folder.id}`}>
                {open && inside.length === 0 && (
                  <span className="nav-empty folder-empty">Drop a playlist here</span>
                )}
                {open && inside.map((playlist) => playlistRow(playlist, true))}
              </div>
            </div>
          );
        })}

        <span
          className="nav-label nav-sublabel"
          data-drag-over={draggingPlaylist !== null}
          data-drop-active={dropTarget === LOOSE_DROP}
          onDragOver={(event) => acceptPlaylistDrag(event, LOOSE_DROP)}
          onDragLeave={(event) => leavePlaylistTarget(event, LOOSE_DROP)}
          onDrop={(event) => dropPlaylist(event, null)}
          title="Drop a playlist here to take it out of its folder"
        >
          Playlists
          {dropTarget === LOOSE_DROP ? (
            <span className="drop-tag">Drop to unfile</span>
          ) : (
            <button
              className="btn-icon"
              style={{ padding: 2 }}
              onClick={onCreatePlaylist}
              title="New playlist"
              aria-label="New playlist"
            >
              <PlusIcon size={14} />
            </button>
          )}
        </span>
        {playlists.length === 0 && (
          <span className="nav-empty">No playlists yet</span>
        )}
        {playlists.length > 0 && loose.length === 0 && (
          <span className="nav-empty">No loose playlists — drop one here.</span>
        )}
        {loose.map((playlist) => playlistRow(playlist, false))}
      </div>

      <div className="nav-group">
        <span className="nav-label">Music folders</span>
        {folders.length === 0 && (
          <span className="nav-empty">
            {scanning ? "Indexing…" : isAndroid() ? "Scan this device for music" : "Add a folder of music to begin"}
          </span>
        )}
        {folders.map((folder) => (
          <div key={folder.path} className="nav-item" style={{ cursor: "default" }} title={folder.path}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <FolderIcon size={14} />
              <span className="folder-title" style={{ fontSize: 13 }}>
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

      <div className="nav-group" style={{ marginTop: "auto" }}>
        <button
          id="nav-settings"
          className="nav-item"
          data-active={view === "settings"}
          onClick={() => onNavigate("settings")}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <GearIcon size={16} />
            Settings
          </span>
        </button>
      </div>
    </aside>
  );
}
