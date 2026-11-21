import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Folder, LyricsPayload, Playlist, ScanSummary, Track } from "./types";

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
  removeFromPlaylist: (playlistId: string, trackId: string) =>
    invoke<void>("remove_from_playlist", { playlistId, trackId }),
  lyricsFor: (trackId: string) => invoke<LyricsPayload>("lyrics_for", { trackId }),
  saveLyrics: (trackId: string, text: string) =>
    invoke<LyricsPayload>("save_lyrics", { trackId, text }),
  forgetLyrics: (trackId: string) => invoke<LyricsPayload>("forget_lyrics", { trackId }),
};

/** Turn an absolute local path into a URL the webview can stream from. */
export const assetUrl = (path: string): string => {
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
};
