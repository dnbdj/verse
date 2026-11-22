import type { ServiceId } from "./services";

/** A song saved from a streaming service into a Verse playlist. */
export type RemoteTrack = {
  /** Stable within its playlist, usually `service:kind:id`. */
  id: string;
  service: ServiceId;
  title: string;
  artist: string;
  album: string;
  art: string | null;
  durationMs: number;
  /** The song's page in its own service. */
  url: string;
  /** A direct thirty-second preview, when the service publishes one. */
  previewUrl: string | null;
  /** Spotify URI, so a saved Spotify song can play remotely. */
  uri: string | null;
  addedAt: number;
};

export type Track = {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  durationMs: number;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string | null;
  coverPath: string | null;
  size: number;
  addedAt: number;
  lastPlayedAt: number | null;
  playCount: number;
  /** Present on rows assembled from a playlist's remote tracks. */
  remote?: RemoteTrack;
};

export type Folder = { path: string; trackCount: number };

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  /** Songs saved from streaming services, kept in the order they were added. */
  remoteTracks?: RemoteTrack[];
};

/** A local grouping of playlists; the playlists themselves stay in the library. */
export type PlaylistFolder = { id: string; name: string; playlistIds: string[] };

export type ScanSummary = { added: number; updated: number; skipped: number };

export type LyricsPayload = {
  synced: string | null;
  plain: string | null;
  source: "embedded" | "sidecar" | "lrclib" | "manual" | "none";
  recordId: number | null;
  instrumental: boolean;
  durationMs: number;
};
