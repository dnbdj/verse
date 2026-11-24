import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Folder, LyricsPayload, Playlist, RemoteTrack, ScanSummary, Track } from "./types";

/** The newest GitHub release, when it is newer than this build. */
export type UpdateInfo = {
  current: string;
  latest: string;
  url: string;
  notes: string;
};

/** One published GitHub release, used by the changelog in Settings. */
export type ReleaseInfo = {
  version: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string;
  downloadUrl: string | null;
  downloadSize: number;
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
  installUpdate: () => invoke<void>("install_update"),
  /** Download progress for the updater, as a 0–1 fraction; no-op in the browser. */
  onUpdateProgress: (handler: (progress: { received: number; total: number }) => void) => {
    let unlisten: (() => void) | null = null;
    let stopped = false;
    void listen<{ received: number; total: number }>("update-download", (event) =>
      handler(event.payload),
    )
      .then((stop) => {
        if (stopped) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      unlisten?.();
    };
  },
  /** Falls back to the public GitHub API so the browser preview can show it too. */
  listReleases: async (): Promise<ReleaseInfo[]> => {
    try {
      return await invoke<ReleaseInfo[]>("list_releases");
    } catch (error) {
      const response = await fetch(
        "https://api.github.com/repos/dnbdj/verse/releases?per_page=20",
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!response.ok) throw error;
      const body = (await response.json()) as {
        tag_name?: string;
        name?: string;
        body?: string;
        html_url?: string;
        published_at?: string;
        draft?: boolean;
        assets?: { name?: string; browser_download_url?: string; size?: number }[];
      }[];
      return body
        .filter((release) => !release.draft)
        .map((release) => {
          const asset = (release.assets ?? []).find((entry) =>
            (entry.name ?? "").toLowerCase().endsWith(".exe"),
          );
          return {
            version: (release.tag_name ?? "").replace(/^v/i, ""),
            name: release.name ?? "",
            notes: (release.body ?? "").slice(0, 4000),
            url: release.html_url ?? "",
            publishedAt: release.published_at ?? "",
            downloadUrl: asset?.browser_download_url ?? null,
            downloadSize: asset?.size ?? 0,
          };
        });
    }
  },
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
