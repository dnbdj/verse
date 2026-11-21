import { useCallback, useEffect, useState } from "react";
import { spotify, type SpLibrary, type SpPlayback, type SpotifyStatus } from "../lib/spotify";

export type SpotifyState = {
  status: SpotifyStatus | null;
  library: SpLibrary;
  playback: SpPlayback | null;
  busy: boolean;
  error: string | null;
  connect: (clientId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  reload: () => Promise<void>;
  control: (action: "play" | "pause" | "next" | "previous") => Promise<void>;
  playUri: (uri: string) => Promise<void>;
  clearError: () => void;
};

export function useSpotify(): SpotifyState {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [library, setLibrary] = useState<SpLibrary>({ liked: [], playlists: [] });
  const [playback, setPlayback] = useState<SpPlayback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    try {
      setLibrary(await spotify.library());
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const next = await spotify.status();
      setStatus(next);
      if (next.connected) await loadLibrary();
    } catch (cause) {
      setError(String(cause));
    }
  }, [loadLibrary]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!status?.connected) {
      setPlayback(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await spotify.playback();
        if (!cancelled) setPlayback(next);
      } catch {
        // Transient failures while nothing is playing are expected.
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status?.connected]);

  const connect = useCallback(
    async (clientId: string) => {
      setBusy(true);
      setError(null);
      try {
        await spotify.configure(clientId);
        const next = await spotify.login();
        setStatus(next);
        if (next.connected) await loadLibrary();
      } catch (cause) {
        setError(String(cause));
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [loadLibrary, reload],
  );

  const disconnect = useCallback(async () => {
    await spotify.disconnect();
    setLibrary({ liked: [], playlists: [] });
    setPlayback(null);
    await reload();
  }, [reload]);

  const control = useCallback(
    async (action: "play" | "pause" | "next" | "previous") => {
      try {
        await spotify.control(action);
        window.setTimeout(() => void spotify.playback().then(setPlayback).catch(() => undefined), 400);
      } catch (cause) {
        setError(String(cause));
      }
    },
    [],
  );

  const playUri = useCallback(async (uri: string) => {
    try {
      await spotify.play(uri);
      window.setTimeout(() => void spotify.playback().then(setPlayback).catch(() => undefined), 600);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  return {
    status,
    library,
    playback,
    busy,
    error,
    connect,
    disconnect,
    reload,
    control,
    playUri,
    clearError: () => setError(null),
  };
}
