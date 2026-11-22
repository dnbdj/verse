import type { Playlist } from "./types";

/** What one playlist action looked like before it ran, kept so it can be undone later. */
export type PlaylistAction = "delete" | "duplicate" | "merge" | "import";

export type PlaylistUndoSnapshot = {
  action: PlaylistAction;
  label: string;
  at: number;
  /** The view that was open, so undo can bring the playlist back on screen. */
  view: string;
  playlists: Playlist[];
};

export const PLAYLIST_UNDO_KEY = "verse.playlistUndo";

const clonePlaylists = (playlists: Playlist[]): Playlist[] =>
  playlists.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    trackIds: [...playlist.trackIds],
    remoteTracks: (playlist.remoteTracks ?? []).map((track) => ({ ...track })),
  }));

const isPlaylist = (value: unknown): value is Playlist => {
  if (!value || typeof value !== "object") return false;
  const raw = value as Partial<Playlist>;
  return (
    typeof raw.id === "string" &&
    typeof raw.name === "string" &&
    Array.isArray(raw.trackIds) &&
    raw.trackIds.every((id) => typeof id === "string") &&
    (raw.remoteTracks === undefined ||
      (Array.isArray(raw.remoteTracks) &&
        raw.remoteTracks.every(
          (track) =>
            Boolean(track) &&
            typeof track === "object" &&
            typeof track.id === "string" &&
            typeof track.service === "string" &&
            typeof track.title === "string",
        )))
  );
};

/** Snapshots the playlists as they are right now, before an edit touches them. */
export function snapshotPlaylists(
  action: PlaylistAction,
  label: string,
  view: string,
  playlists: Playlist[],
  at: number = Date.now(),
): PlaylistUndoSnapshot {
  return { action, label, at, view, playlists: clonePlaylists(playlists) };
}

export function cleanSnapshot(value: unknown): PlaylistUndoSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PlaylistUndoSnapshot>;
  if (
    raw.action !== "delete" &&
    raw.action !== "duplicate" &&
    raw.action !== "merge" &&
    raw.action !== "import"
  ) {
    return null;
  }
  if (typeof raw.label !== "string" || typeof raw.view !== "string") return null;
  if (typeof raw.at !== "number" || !Array.isArray(raw.playlists)) return null;
  if (!raw.playlists.every(isPlaylist)) return null;
  return snapshotPlaylists(raw.action, raw.label, raw.view, raw.playlists, raw.at);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function savePlaylistUndo(snapshot: PlaylistUndoSnapshot): void {
  try {
    storage()?.setItem(PLAYLIST_UNDO_KEY, JSON.stringify(snapshot));
  } catch {
    // Undo is a convenience; a full quota must not break the edit itself.
  }
}

export function readPlaylistUndo(): PlaylistUndoSnapshot | null {
  try {
    const raw = storage()?.getItem(PLAYLIST_UNDO_KEY);
    if (!raw) return null;
    return cleanSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearPlaylistUndo(): void {
  try {
    storage()?.removeItem(PLAYLIST_UNDO_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * "Late ferry copy", then "Late ferry copy 2"… so duplicating twice never collides.
 * Comparison is case-insensitive because playlist matching during import is too.
 */
export function duplicateName(existing: string[], name: string): string {
  const taken = new Set(existing.map((entry) => entry.trim().toLowerCase()));
  const base = `${name.trim() || "Playlist"} copy`;
  if (!taken.has(base.toLowerCase())) return base;
  let index = 2;
  while (taken.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

/** Target order first, then the source's unseen tracks in their own order. */
export function mergeTrackIds(target: string[], source: string[]): string[] {
  const merged = [...target];
  const seen = new Set(merged);
  for (const id of source) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

/** Maps a snapshot's old playlist id to the id the recreated playlist got. */
export function viewAfterRestore(view: string, idMap: Map<string, string>): string {
  if (!view.startsWith("playlist:")) return view;
  const oldId = view.slice("playlist:".length);
  const nextId = idMap.get(oldId);
  return nextId ? `playlist:${nextId}` : "songs";
}
