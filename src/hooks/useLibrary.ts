import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { demoLibrary, type LibraryStore } from "../lib/demoLibrary";
import { insideTauri } from "../lib/platform";
import type { Folder, Playlist, RemoteTrack, Track } from "../lib/types";

export type Library = {
  tracks: Track[];
  folders: Folder[];
  playlists: Playlist[];
  loading: boolean;
  scanning: boolean;
  notice: string | null;
  /** True when running in a browser against the demo store rather than SQLite. */
  demo: boolean;
  refresh: () => Promise<void>;
  addFolder: () => Promise<void>;
  scanDeviceMusic: () => Promise<void>;
  removeFolder: (path: string) => Promise<void>;
  createPlaylist: (name: string) => Promise<Playlist | null>;
  deletePlaylist: (id: string) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  reorderPlaylist: (id: string, trackIds: string[]) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addRemoteToPlaylist: (playlistId: string, track: RemoteTrack) => Promise<void>;
  removeRemoteFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  setNotice: (message: string | null) => void;
};

export function useLibrary(): Library {
  const [native] = useState(insideTauri);
  const [store] = useState<LibraryStore>(() => (native ? api : demoLibrary));
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
      store.listTracks(),
      store.listFolders(),
      store.listPlaylists(),
    ]);
    setTracks(nextTracks);
    setFolders(nextFolders);
    setPlaylists(nextPlaylists);
  }, [store]);

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
    async (name: string): Promise<Playlist | null> => {
      try {
        const created = await store.createPlaylist(name);
        await refresh();
        return created;
      } catch (error) {
        flash(`Could not create playlist: ${String(error)}`);
        return null;
      }
    },
    [store, refresh, flash],
  );

  const deletePlaylist = useCallback(
    async (id: string) => {
      try {
        await store.deletePlaylist(id);
        await refresh();
      } catch (error) {
        flash(`Could not delete playlist: ${String(error)}`);
      }
    },
    [store, refresh, flash],
  );

  const renamePlaylist = useCallback(
    async (id: string, name: string) => {
      try {
        await store.renamePlaylist(id, name);
        await refresh();
      } catch (error) {
        flash(`Could not rename playlist: ${String(error)}`);
      }
    },
    [store, refresh, flash],
  );

  const reorderPlaylist = useCallback(
    async (id: string, trackIds: string[]) => {
      try {
        await store.reorderPlaylist(id, trackIds);
        await refresh();
      } catch (error) {
        flash(`Could not reorder playlist: ${String(error)}`);
      }
    },
    [store, refresh, flash],
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      try {
        await store.addToPlaylist(playlistId, trackId);
        await refresh();
      } catch (error) {
        flash(`Could not add to playlist: ${String(error)}`);
      }
    },
    [store, refresh, flash],
  );

  const addRemoteToPlaylist = useCallback(
    async (playlistId: string, track: RemoteTrack) => {
      try {
        await store.addRemoteToPlaylist(playlistId, track);
        await refresh();
      } catch (error) {
        flash(`Could not add to playlist: ${String(error)}`);
        throw error;
      }
    },
    [store, refresh, flash],
  );

  const removeRemoteFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      try {
        await store.removeRemoteFromPlaylist(playlistId, trackId);
        await refresh();
      } catch (error) {
        flash(`Could not remove from playlist: ${String(error)}`);
      }
    },
    [store, refresh, flash],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      try {
        await store.removeFromPlaylist(playlistId, trackId);
        await refresh();
      } catch (error) {
        flash(`Could not remove from playlist: ${String(error)}`);
      }
    },
    [store, refresh, flash],
  );

  return {
    tracks,
    folders,
    playlists,
    loading,
    scanning,
    notice,
    demo: !native,
    refresh,
    addFolder,
    scanDeviceMusic,
    removeFolder,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    reorderPlaylist,
    addToPlaylist,
    addRemoteToPlaylist,
    removeRemoteFromPlaylist,
    removeFromPlaylist,
    setNotice,
  };
}
