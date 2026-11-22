import { invoke } from "@tauri-apps/api/core";

export type SpotifyStatus = {
  configured: boolean;
  connected: boolean;
  name: string | null;
};

export type SpTrack = {
  id: string;
  name: string;
  artists: string;
  art: string | null;
  durationMs: number;
  uri: string;
};

export type SpPlaylist = {
  id: string;
  name: string;
  art: string | null;
  trackCount: number;
  uri: string;
};

export type SpLibrary = { liked: SpTrack[]; playlists: SpPlaylist[] };

export type SpPlayback = {
  playing: boolean;
  name: string;
  artists: string;
  art: string | null;
  progressMs: number;
  durationMs: number;
  device: string | null;
};

export const spotify = {
  status: () => invoke<SpotifyStatus>("spotify_status"),
  configure: (clientId: string) => invoke<void>("spotify_configure", { clientId }),
  login: () => invoke<SpotifyStatus>("spotify_login"),
  disconnect: () => invoke<void>("spotify_disconnect"),
  library: () => invoke<SpLibrary>("spotify_library"),
  playback: () => invoke<SpPlayback | null>("spotify_playback"),
  control: (action: "play" | "pause" | "next" | "previous") =>
    invoke<void>("spotify_control", { action }),
  play: (uri: string) => invoke<void>("spotify_play", { uri }),
  addToPlaylist: (playlistId: string, uri: string) =>
    invoke<void>("spotify_add_to_playlist", { playlistId, uri }),
  addBySearch: (playlistId: string, title: string, artist: string) =>
    invoke<void>("spotify_add_by_search", { playlistId, title, artist }),
};
