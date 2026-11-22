import { cleanAlbumKey } from "./albums";

/**
 * Web hashes and desktop `verse://play` links share this parser, so a bad id produces
 * the same message everywhere:
 *
 *   #play=<trackId>            verse://play?track=<id>
 *   #playlist=<playlistId>     verse://play?playlist=<id>
 *   #album=<artist|album>      verse://play?album=<artist|album>
 */
export const PLAY_HASH_PARAM = "play";
export const PLAYLIST_HASH_PARAM = "playlist";
export const ALBUM_HASH_PARAM = "album";

/** Local ids are uuids or demo ids; spaces/punctuation are not ids. */
const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type PlayTarget =
  | { kind: "track"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "album"; key: string };

export type PlayArrival =
  | { kind: "play"; target: PlayTarget }
  | { kind: "error"; error: string }
  | { kind: "none" };

export function cleanLocalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return LOCAL_ID.test(trimmed) ? trimmed : null;
}

export function invalidTrackIdError(): string {
  return "That link has a track id Verse cannot read — copy a fresh link from the app.";
}

export function invalidPlaylistIdError(): string {
  return "That link has a playlist id Verse cannot read — copy a fresh link from the app.";
}

export function invalidAlbumKeyError(): string {
  return "That link has an album reference Verse cannot read — copy a fresh link from the app.";
}

export function missingTrackError(): string {
  return "That link points at a track that is not in this library.";
}

export function missingPlaylistError(): string {
  return "That link points at a playlist that is not in this library.";
}

export function missingAlbumError(): string {
  return "That link points at an album that is not in this library.";
}

export function emptyPlaylistError(): string {
  return "That playlist is empty, so there is nothing to play.";
}

export function playTarget(target: PlayTarget): PlayArrival {
  if (target.kind === "track") {
    const id = cleanLocalId(target.id);
    return id ? { kind: "play", target: { kind: "track", id } } : { kind: "error", error: invalidTrackIdError() };
  }
  if (target.kind === "playlist") {
    const id = cleanLocalId(target.id);
    return id
      ? { kind: "play", target: { kind: "playlist", id } }
      : { kind: "error", error: invalidPlaylistIdError() };
  }
  const key = cleanAlbumKey(target.key);
  return key
    ? { kind: "play", target: { kind: "album", key } }
    : { kind: "error", error: invalidAlbumKeyError() };
}

/**
 * Reads the first play-style parameter present. Track wins over playlist over album,
 * and each parameter is validated even when a later one would also be valid.
 */
export function parsePlayParams(params: URLSearchParams): PlayArrival {
  const track = params.get("track") ?? params.get("id") ?? params.get(PLAY_HASH_PARAM);
  if (track !== null) return playTarget({ kind: "track", id: track });

  const playlist = params.get("playlist") ?? params.get("list");
  if (playlist !== null) return playTarget({ kind: "playlist", id: playlist });

  const album = params.get("album");
  if (album !== null) return playTarget({ kind: "album", key: album });

  return { kind: "none" };
}

export function readPlayFromUrl(href: string): PlayArrival {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "none" };
  }

  const hash = url.hash.replace(/^#/, "");
  if (!hash) return { kind: "none" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(hash);
  } catch {
    return { kind: "none" };
  }
  return parsePlayParams(params);
}
