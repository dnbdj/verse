import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Folder, LyricsPayload, Playlist, RemoteTrack, ScanSummary, Track } from "./types";

/** The newest GitHub release, when it is newer than this build. */
export type UpdateInfo = {
  current: string;
  latest: string;
  url: string;
  notes: string;
};

export const api = {
  listTracks: () => invoke<Track[]>("list_tracks"),
  listFolders: () => invoke<Folder[]>("list_folders"),
  addFolder: (path: string) => invoke<ScanSummary>("add_folder", { path }),
  scanDeviceMusic: () => invoke<ScanSummary>("scan_device_music"),
  removeFolder: (path: string) => invoke<void>("remove_folder", { path }),
  markPlayed: (trackId: string) => invoke<void>("mark_played", { trackId }),
  listPlaylists: () => invoke<Playlist[]>("list_playlists"),
  createPlaylist: (name: string) => invoke<Playlist>("create_playlist", { name }),
  deletePlaylist: (playlistId: string) => invoke<void>("delete_playlist", { playlistId }),
  addToPlaylist: (playlistId: string, trackId: string) =>
    invoke<void>("add_to_playlist", { playlistId, trackId }),
  addRemoteToPlaylist: (playlistId: string, track: RemoteTrack) =>
    invoke<void>("add_remote_to_playlist", { playlistId, track }),
  removeRemoteFromPlaylist: (playlistId: string, trackId: string) =>
    invoke<void>("remove_remote_from_playlist", { playlistId, trackId }),
  removeFromPlaylist: (playlistId: string, trackId: string) =>
    invoke<void>("remove_from_playlist", { playlistId, trackId }),
  renamePlaylist: (playlistId: string, name: string) =>
    invoke<void>("rename_playlist", { playlistId, name }),
  reorderPlaylist: (playlistId: string, trackIds: string[]) =>
    invoke<void>("reorder_playlist", { playlistId, trackIds }),
  takeDeepLink: () => invoke<string | null>("take_deep_link"),
  saveBundle: (contents: string, fileName: string) =>
    invoke<string | null>("save_bundle", { contents, fileName }),
  openBundle: () => invoke<string | null>("open_bundle"),
  lyricsFor: (trackId: string) => invoke<LyricsPayload>("lyrics_for", { trackId }),
  saveLyrics: (trackId: string, text: string) =>
    invoke<LyricsPayload>("save_lyrics", { trackId, text }),
  forgetLyrics: (trackId: string) => invoke<LyricsPayload>("forget_lyrics", { trackId }),
  checkForUpdate: () => invoke<UpdateInfo | null>("check_for_update"),
};

/** Turn an absolute local path into a URL the webview can stream from. */
export const assetUrl = (path: string): string => {
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
};
