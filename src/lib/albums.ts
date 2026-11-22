import type { Track } from "./types";

/** The identity the library uses for an album: album artist (fallback artist) + album. */
export type AlbumGroup = {
  key: string;
  name: string;
  artist: string;
  coverPath: string | null;
  tracks: Track[];
};

export const albumKeyOf = (track: Track): string =>
  `${track.albumArtist || track.artist}|${track.album}`;

const trackOrder = (a: Track, b: Track): number =>
  (a.discNo ?? 0) - (b.discNo ?? 0) ||
  (a.trackNo ?? 0) - (b.trackNo ?? 0) ||
  a.title.localeCompare(b.title);

/** Groups tracks into albums, preserving the first-seen album order. */
export function albumGroups(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    const key = albumKeyOf(track);
    const existing = map.get(key);
    if (existing) {
      existing.tracks.push(track);
      if (!existing.coverPath && track.coverPath) existing.coverPath = track.coverPath;
      continue;
    }
    map.set(key, {
      key,
      name: track.album || "Unknown album",
      artist: track.albumArtist || track.artist || "Unknown artist",
      coverPath: track.coverPath,
      tracks: [track],
    });
  }
  const groups = [...map.values()];
  for (const group of groups) group.tracks.sort(trackOrder);
  return groups;
}

const normalizeKey = (value: string): string => value.trim().toLowerCase();

/**
 * Resolves an album link. Keys are exact first (that is what the app generates),
 * then case-insensitive so a hand-typed link still lands somewhere sensible.
 */
export function findAlbum(tracks: Track[], key: string): AlbumGroup | null {
  const groups = albumGroups(tracks);
  const exact = groups.find((group) => group.key === key);
  if (exact) return exact;
  const wanted = normalizeKey(key);
  return groups.find((group) => normalizeKey(group.key) === wanted) ?? null;
}

/** Album references may contain spaces and a `|`, but nothing unprintable or endless. */
export function cleanAlbumKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300) return null;
  if (!trimmed.includes("|")) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}
