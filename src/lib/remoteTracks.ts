import type { SpTrack } from "./spotify";
import { type DeezerTrack, type LinkTarget, serviceById } from "./services";
import type { RemoteTrack, Track } from "./types";

const stamp = () => Date.now();

const playedAt = (track: RemoteTrack): Track => ({
  id: track.id,
  path: track.previewUrl ?? track.uri ?? track.url,
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.artist,
  durationMs: track.durationMs,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  coverPath: track.art,
  size: 0,
  addedAt: track.addedAt,
  lastPlayedAt: null,
  playCount: 0,
  remote: track,
});

/** Playlist rows use the same shape as local tracks, flagged with their remote source. */
export const remoteAsTrack = playedAt;

export function remoteFromDeezer(track: DeezerTrack): RemoteTrack {
  return {
    id: `deezer:track:${track.id}`,
    service: "deezer",
    title: track.title,
    artist: track.artist,
    album: track.album,
    art: track.cover,
    durationMs: track.durationMs,
    url: track.url || `https://www.deezer.com/track/${track.id}`,
    previewUrl: track.preview,
    uri: null,
    addedAt: stamp(),
  };
}

export function remoteFromSpotify(track: SpTrack): RemoteTrack {
  return {
    id: `spotify:track:${track.id}`,
    service: "spotify",
    title: track.name,
    artist: track.artists,
    album: "",
    art: track.art,
    durationMs: track.durationMs,
    url: `https://open.spotify.com/track/${track.id}`,
    previewUrl: null,
    uri: track.uri,
    addedAt: stamp(),
  };
}

/**
 * Turns a parsed link into a playlist row. Links carry no title metadata beyond the
 * resource id, so the service and id are kept as an honest label until it is opened.
 */
export function remoteFromLink(target: LinkTarget): RemoteTrack {
  const service = serviceById(target.service);
  const label = target.resource === "unknown" ? "link" : target.resource;
  return {
    id: `${target.service}:${target.resource}:${target.id || target.webUrl}`,
    service: target.service,
    title: target.id ? `${label} · ${target.id}` : `${service.name} ${label}`,
    artist: service.name,
    album: "",
    art: null,
    durationMs: 0,
    url: target.webUrl,
    previewUrl: null,
    uri: target.uri ?? null,
    addedAt: stamp(),
  };
}
