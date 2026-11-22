import type { Folder, Playlist, RemoteTrack, Track } from "./types";

/**
 * The browser preview has no SQLite behind it, so Verse would otherwise open empty
 * with an IPC error. This local store keeps a small demo library in localStorage and
 * implements the same playlist calls as the native commands. It is only used when
 * the Tauri runtime is absent; the desktop app always talks to the real database.
 */

export type LibraryStore = {
  listTracks: () => Promise<Track[]>;
  listFolders: () => Promise<Folder[]>;
  listPlaylists: () => Promise<Playlist[]>;
  createPlaylist: (name: string) => Promise<Playlist>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addRemoteToPlaylist: (playlistId: string, track: RemoteTrack) => Promise<void>;
  removeRemoteFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  renamePlaylist: (playlistId: string, name: string) => Promise<void>;
  reorderPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
};

const KEY = "verse.demo.library";

/** 44-byte silent WAV, so demo tracks can be "played" without shipping audio files. */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const cover = (from: string, to: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="140" height="140" fill="url(#g)"/><circle cx="70" cy="70" r="26" fill="rgba(255,255,255,0.18)"/></svg>`,
  )}`;

const track = (
  number: number,
  title: string,
  artist: string,
  album: string,
  from: string,
  to: string,
  durationMs: number,
): Track => ({
  id: `demo-track-${number}`,
  path: SILENCE,
  title,
  artist,
  album,
  albumArtist: artist,
  durationMs,
  trackNo: number,
  discNo: 1,
  year: 2026,
  genre: null,
  coverPath: cover(from, to),
  size: 0,
  addedAt: 1_760_000_000_000 - number * 86_400_000,
  lastPlayedAt: null,
  playCount: 0,
});

type DemoData = { tracks: Track[]; playlists: Playlist[] };

const seed = (): DemoData => ({
  tracks: [
    track(1, "Glass Horizon", "Mira Vale", "Soft Focus", "#ff375f", "#ff9f0a", 214_000),
    track(2, "Slow Static", "Kite Weather", "Soft Focus", "#0a84ff", "#5e5ce6", 188_000),
    track(3, "Paper Sun", "Mira Vale", "Daylight Hours", "#30d158", "#00cfff", 246_000),
    track(4, "Night Ferry", "Harbour Lights", "Night Drive", "#bf5af2", "#ff2d78", 201_000),
    track(5, "Low Beam", "Harbour Lights", "Night Drive", "#5e5ce6", "#0a84ff", 233_000),
    track(6, "Quiet Machines", "Kite Weather", "Daylight Hours", "#ff9f0a", "#ff375f", 179_000),
  ],
  playlists: [
    {
      id: "demo-playlist-1",
      name: "Warm up",
      trackIds: ["demo-track-1", "demo-track-3", "demo-track-6"],
      remoteTracks: [],
    },
    {
      id: "demo-playlist-2",
      name: "Night drive",
      trackIds: ["demo-track-4", "demo-track-5"],
      remoteTracks: [],
    },
  ],
});

let cache: DemoData | null = null;

function data(): DemoData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoData;
      if (Array.isArray(parsed.tracks) && Array.isArray(parsed.playlists)) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    // Fall through and reseed.
  }
  cache = seed();
  persist(cache);
  return cache;
}

function persist(next: DemoData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Demo state is disposable; a full quota should not break the UI.
  }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const find = (playlistId: string): Playlist | undefined =>
  data().playlists.find((playlist) => playlist.id === playlistId);

export const demoLibrary: LibraryStore = {
  listTracks: async () => clone(data().tracks),
  listFolders: async () => [],
  listPlaylists: async () => clone(data().playlists),
  createPlaylist: async (name) => {
    const playlist: Playlist = {
      id: `demo-playlist-${Date.now().toString(36)}`,
      name: name.trim() || "New playlist",
      trackIds: [],
      remoteTracks: [],
    };
    data().playlists.push(playlist);
    persist(data());
    return clone(playlist);
  },
  deletePlaylist: async (playlistId) => {
    const current = data();
    current.playlists = current.playlists.filter((playlist) => playlist.id !== playlistId);
    persist(current);
  },
  addToPlaylist: async (playlistId, trackId) => {
    const playlist = find(playlistId);
    if (!playlist || playlist.trackIds.includes(trackId)) return;
    playlist.trackIds.push(trackId);
    persist(data());
  },
  addRemoteToPlaylist: async (playlistId, track) => {
    const playlist = find(playlistId);
    if (!playlist) return;
    const remote = playlist.remoteTracks ?? [];
    const existing = remote.findIndex((entry) => entry.id === track.id);
    if (existing >= 0) remote[existing] = track;
    else remote.push(track);
    playlist.remoteTracks = remote;
    persist(data());
  },
  removeRemoteFromPlaylist: async (playlistId, trackId) => {
    const playlist = find(playlistId);
    if (!playlist) return;
    playlist.remoteTracks = (playlist.remoteTracks ?? []).filter((entry) => entry.id !== trackId);
    persist(data());
  },
  removeFromPlaylist: async (playlistId, trackId) => {
    const playlist = find(playlistId);
    if (!playlist) return;
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    persist(data());
  },
  renamePlaylist: async (playlistId, name) => {
    const playlist = find(playlistId);
    if (!playlist) return;
    playlist.name = name.trim() || playlist.name;
    persist(data());
  },
  reorderPlaylist: async (playlistId, trackIds) => {
    const playlist = find(playlistId);
    if (!playlist) return;
    const known = new Set(playlist.trackIds);
    playlist.trackIds = trackIds.filter((id) => known.has(id));
    persist(data());
  },
};
