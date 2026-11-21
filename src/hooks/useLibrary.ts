import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Folder, Playlist, Track } from "../lib/types";

export type Library = {
  tracks: Track[];
  folders: Folder[];
  playlists: Playlist[];
  loading: boolean;
  scanning: boolean;
  notice: string | null;
  refresh: () => Promise<void>;
  addFolder: () => Promise<void>;
  scanDeviceMusic: () => Promise<void>;
  removeFolder: (path: string) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  setNotice: (message: string | null) => void;
};

export function useLibrary(): Library {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 6000);
  }, []);

  const refresh = useCallback(async () => {
    const [nextTracks, nextFolders, nextPlaylists] = await Promise.all([
      api.listTracks(),
      api.listFolders(),
      api.listPlaylists(),
    ]);
    setTracks(nextTracks);
    setFolders(nextFolders);
    setPlaylists(nextPlaylists);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((error: unknown) => flash(`Could not read the library: ${String(error)}`))
      .finally(() => setLoading(false));
  }, [refresh, flash]);

  const addFolder = useCallback(async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Add a music folder",
    });
    if (typeof picked !== "string") return;
    setScanning(true);
    try {
      const summary = await api.addFolder(picked);
      await refresh();
      flash(
        summary.added > 0
          ? `Added ${summary.added} tracks, refreshed ${summary.updated}`
          : `No new tracks found — refreshed ${summary.updated}`,
      );
    } catch (error) {
      flash(`Scan failed: ${String(error)}`);
    } finally {
      setScanning(false);
    }
  }, [refresh, flash]);

  const scanDeviceMusic = useCallback(async () => {
    setScanning(true);
    try {
      const summary = await api.scanDeviceMusic();
      await refresh();
      flash(
        summary.added > 0
          ? `Added ${summary.added} tracks, refreshed ${summary.updated}`
          : `No new tracks found — refreshed ${summary.updated}`,
      );
    } catch (error) {
      flash(`Scan failed: ${String(error)}`);
    } finally {
      setScanning(false);
    }
  }, [refresh, flash]);

  const removeFolder = useCallback(
    async (path: string) => {
      try {
        await api.removeFolder(path);
        await refresh();
      } catch (error) {
        flash(`Could not remove folder: ${String(error)}`);
      }
    },
    [refresh, flash],
  );

  const createPlaylist = useCallback(
    async (name: string) => {
      try {
        await api.createPlaylist(name);
        await refresh();
      } catch (error) {
        flash(`Could not create playlist: ${String(error)}`);
      }
    },
    [refresh, flash],
  );

  const deletePlaylist = useCallback(
    async (id: string) => {
      try {
        await api.deletePlaylist(id);
        await refresh();
      } catch (error) {
        flash(`Could not delete playlist: ${String(error)}`);
      }
    },
    [refresh, flash],
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      try {
        await api.addToPlaylist(playlistId, trackId);
        await refresh();
      } catch (error) {
        flash(`Could not add to playlist: ${String(error)}`);
      }
    },
    [refresh, flash],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      try {
        await api.removeFromPlaylist(playlistId, trackId);
        await refresh();
      } catch (error) {
        flash(`Could not remove from playlist: ${String(error)}`);
      }
    },
    [refresh, flash],
  );

  return {
    tracks,
    folders,
    playlists,
    loading,
    scanning,
    notice,
    refresh,
    addFolder,
    scanDeviceMusic,
    removeFolder,
    createPlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    setNotice,
  };
}
