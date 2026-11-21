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
};

export type Folder = { path: string; trackCount: number };

export type Playlist = { id: string; name: string; trackIds: string[] };

export type ScanSummary = { added: number; updated: number; skipped: number };

export type LyricsPayload = {
  synced: string | null;
  plain: string | null;
  source: "embedded" | "sidecar" | "lrclib" | "manual" | "none";
  recordId: number | null;
  instrumental: boolean;
  durationMs: number;
};
