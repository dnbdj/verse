import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "./hooks/useLibrary";
import { useShortcuts } from "./hooks/useShortcuts";
import { usePlayer } from "./hooks/usePlayer";
import { useSpotify } from "./hooks/useSpotify";
import { insideTauri, isAndroid } from "./lib/platform";
import { api, assetUrl, type UpdateInfo } from "./lib/api";
import { useArtworkTint } from "./lib/artwork";
import { moveBefore, moveItem } from "./lib/order";
import { serializeBundle, type ImportMode } from "./lib/bundle";
import {
  applyImportSections,
  planBundleText,
  type BundleImportReport,
  type BundlePreview,
  type ImportSections,
} from "./lib/importPlan";
import { albumGroups, findAlbum, type AlbumGroup } from "./lib/albums";
import { parseDeepLink, playlistDeepLinkFor, type DeepLinkArrival } from "./lib/deepLink";
import {
  emptyPlaylistError,
  missingAlbumError,
  missingPlaylistError,
  missingTrackError,
  readPlayFromUrl,
  type PlayTarget,
} from "./lib/playLink";
import {
  clearPlaylistUndo,
  duplicateName,
  mergeTrackIds,
  readPlaylistUndo,
  savePlaylistUndo,
  snapshotPlaylists,
  viewAfterRestore,
  type PlaylistAction,
  type PlaylistUndoSnapshot,
} from "./lib/playlistEdit";
import { DEFAULT_PREFS, loadPrefs, saveLook, savePrefs } from "./lib/prefs";
import { remoteAsTrack } from "./lib/remoteTracks";
import { SERVICES, openExternal, serviceById, type ServiceId } from "./lib/services";
import { readLookFromUrl, type Arrival } from "./lib/share";
import {
  GRADIENT_PRESETS,
  THEMES,
  appearanceOf,
  applyAppearance,
  type Appearance,
  type SavedLook,
} from "./lib/theme";
import { formatDuration } from "./lib/format";
import type { Playlist, PlaylistFolder, RemoteTrack, Track } from "./lib/types";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { PlayerBar } from "./components/PlayerBar";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { Sidebar } from "./components/Sidebar";
import { NowPlaying } from "./components/NowPlaying";
import { ServicesView } from "./components/ServicesView";
import { SettingsView } from "./components/SettingsView";
import { SpotifyView } from "./components/SpotifyView";
import { TrackTable } from "./components/TrackTable";
import { CloseIcon, MusicIcon, PlayIcon, SearchIcon, ShuffleIcon } from "./components/icons";

type Sort = "recent" | "title" | "artist" | "duration";

function sortTracks(tracks: Track[], sort: Sort): Track[] {
  const copy = [...tracks];
  switch (sort) {
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "artist":
      return copy.sort(
        (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
      );
    case "duration":
      return copy.sort((a, b) => b.durationMs - a.durationMs);
    case "recent":
    default:
      return copy.sort((a, b) => b.addedAt - a.addedAt);
  }
}

export default function App() {
  const library = useLibrary();
  const player = usePlayer();
  const spotify = useSpotify();

  const [view, setView] = useState("services");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [folderCreating, setFolderCreating] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance>(() => appearanceOf(loadPrefs()));
  const [serviceId, setServiceId] = useState<ServiceId>("ytmusic");
  const servicePageId = view.startsWith("service:")
    ? (view.slice("service:".length) as ServiceId)
    : null;
  const servicePage = servicePageId ? serviceById(servicePageId) : null;
  const [pinnedServices, setPinnedServices] = useState<ServiceId[]>(() => loadPrefs().pinned);
  const [recentServices, setRecentServices] = useState<ServiceId[]>(() => loadPrefs().recent);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchRequest, setSearchRequest] = useState(0);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>(() => loadPrefs().savedLooks);
  const [playlistFolders, setPlaylistFolders] = useState<PlaylistFolder[]>(
    () => loadPrefs().playlistFolders,
  );
  const [arrival, setArrival] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [previewArtwork, setPreviewArtwork] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);
  const [pendingPlay, setPendingPlay] = useState<PlayTarget | null>(null);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [playlistUndo, setPlaylistUndo] = useState<PlaylistUndoSnapshot | null>(() =>
    readPlaylistUndo(),
  );
  const playerLive = useRef(player);
  playerLive.current = player;
  const previousView = useRef(view);

  const artworkSource = player.current?.coverPath
    ? assetUrl(player.current.coverPath)
    : previewArtwork;
  const artAccent = useArtworkTint(
    artworkSource,
    appearance.artTint,
    appearance.artGlow / 100,
  );

  useEffect(() => {
    applyAppearance(appearance, artAccent);
    savePrefs(appearance);
  }, [appearance, artAccent]);

  useEffect(() => {
    savePrefs({ playlistFolders });
  }, [playlistFolders]);

  // Track how the user arrived at a control. Chromium's :focus-visible heuristic
  // can miss synthetic/automated key sequences, so the CSS also looks at this flag.
  useEffect(() => {
    const markKeyboard = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key === "Meta") return;
      document.documentElement.dataset.input = "keyboard";
    };
    const markPointer = () => {
      document.documentElement.dataset.input = "pointer";
    };
    document.documentElement.dataset.input = "pointer";
    window.addEventListener("keydown", markKeyboard, true);
    window.addEventListener("pointerdown", markPointer, true);
    return () => {
      window.removeEventListener("keydown", markKeyboard, true);
      window.removeEventListener("pointerdown", markPointer, true);
    };
  }, []);

  // Opening Settings puts focus on its heading; closing it returns focus to the
  // sidebar trigger instead of dropping keyboard users at the top of the document.
  useEffect(() => {
    const wasSettings = previousView.current === "settings";
    previousView.current = view;
    let timer: number | undefined;
    if (view === "settings" && !wasSettings) {
      // Wait for an invoking palette to unmount; it owns focus until then.
      timer = window.setTimeout(
        () => document.getElementById("settings-title")?.focus(),
        80,
      );
    } else if (wasSettings && view !== "settings") {
      timer = window.setTimeout(() => document.getElementById("nav-settings")?.focus(), 0);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [view]);

  // A shared look arrives as #look=… (web) or verse://look#look=… (desktop deep link),
  // applies once, then leaves the URL clean. Every path shares this one handler, so a
  // damaged payload always produces the same message and never a partial look.
  const clearHash = useCallback(() => {
    if (!window.location.hash) return;
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(null, "", url.toString());
  }, []);

  const applyArrivalResult = useCallback(
    (incoming: Arrival) => {
      if (incoming.kind === "none") return;

      if (incoming.kind === "error") {
        setArrival({ kind: "error", text: incoming.error });
        return;
      }

      setAppearance((prev) => ({ ...prev, ...incoming.look }));
      setArrival({ kind: "ok", text: "Look applied from the shared link." });
      clearHash();
    },
    [clearHash],
  );

  /** Deep links and web hashes share this: hold the id until the library can resolve it. */
  const applyDeepArrival = useCallback(
    (incoming: DeepLinkArrival) => {
      if (incoming.kind === "play") {
        setPendingPlay(incoming.target);
        return;
      }
      applyArrivalResult(incoming);
    },
    [applyArrivalResult],
  );

  const applyArrival = useCallback(() => {
    const play = readPlayFromUrl(window.location.href);
    if (play.kind === "error") {
      setArrival({ kind: "error", text: play.error });
      clearHash();
      return;
    }
    if (play.kind === "play") {
      setPendingPlay(play.target);
      clearHash();
      return;
    }
    applyArrivalResult(readLookFromUrl(window.location.href));
  }, [applyArrivalResult, clearHash]);

  // Listening for hashchange matters: opening a link in the same tab only changes
  // the fragment, so the app never remounts and a mount-only effect would miss it.
  useEffect(() => {
    applyArrival();
    window.addEventListener("hashchange", applyArrival);
    return () => window.removeEventListener("hashchange", applyArrival);
  }, [applyArrival]);

  // Once per launch, ask GitHub Releases whether a newer Verse exists. Offline or
  // rate-limited launches stay silent; nothing about the library depends on this.
  useEffect(() => {
    if (!insideTauri()) return;
    let cancelled = false;
    void api
      .checkForUpdate()
      .then((info) => {
        if (!cancelled && info) setUpdateInfo(info);
      })
      .catch((error) => console.warn("Verse: update check unavailable", error));
    return () => {
      cancelled = true;
    };
  }, []);

  // While an update downloads, Rust reports the bytes it has so far, so the banner
  // can show a bar instead of a spinner with no idea how long is left.
  useEffect(() => {
    if (!insideTauri()) return;
    return api.onUpdateProgress(({ received, total }) => {
      setUpdateProgress(total > 0 ? Math.min(1, received / total) : null);
    });
  }, []);

  // The desktop app receives verse:// links from Rust: one held from launch for the
  // first mount, the rest streamed as events while the window is open. The imports
  // stay dynamic so the browser build never touches Tauri internals.
  useEffect(() => {
    if (!insideTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;

    // Taking the link is not gated on this effect still being mounted: React's
    // StrictMode runs the effect twice, and a look can only be taken once. Applying
    // it twice would be harmless anyway, so never drop the one that was consumed.
    void (async () => {
      try {
        const pending = await api.takeDeepLink();
        if (pending) applyDeepArrival(parseDeepLink(pending));

        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen<string>("verse:deep-link", (event) => {
          applyDeepArrival(parseDeepLink(event.payload));
        });
        if (disposed) unlisten();
        else stop = unlisten;
      } catch (error) {
        // A build without the handler still works; deep links simply do not arrive.
        console.warn("Verse: deep links unavailable", error);
      }
    })();

    return () => {
      disposed = true;
      stop?.();
    };
  }, [applyDeepArrival]);

  // A cold start can deliver the link before tracks are readable, so resolution waits.
  useEffect(() => {
    if (!pendingPlay || library.loading) return;
    const target = pendingPlay;
    setPendingPlay(null);

    if (target.kind === "track") {
      const track = library.tracks.find((entry) => entry.id === target.id);
      if (!track) {
        setArrival({ kind: "error", text: missingTrackError() });
        return;
      }
      playerLive.current.playQueue([track], 0);
      setArrival({ kind: "ok", text: `Playing ${track.title} from the link.` });
      return;
    }

    if (target.kind === "playlist") {
      const list = library.playlists.find((entry) => entry.id === target.id);
      if (!list) {
        setArrival({ kind: "error", text: missingPlaylistError() });
        return;
      }
      const tracks = list.trackIds
        .map((id) => library.tracks.find((entry) => entry.id === id))
        .filter((entry): entry is Track => Boolean(entry));
      if (tracks.length === 0) {
        setArrival({ kind: "error", text: emptyPlaylistError() });
        return;
      }
      playerLive.current.playQueue(tracks, 0);
      setView(`playlist:${list.id}`);
      setArrival({ kind: "ok", text: `Playing ${list.name} from the link.` });
      return;
    }

    const album = findAlbum(library.tracks, target.key);
    if (!album) {
      setArrival({ kind: "error", text: missingAlbumError() });
      return;
    }
    playerLive.current.playQueue(album.tracks, 0);
    setArrival({ kind: "ok", text: `Playing ${album.name} from the link.` });
  }, [pendingPlay, library.loading, library.tracks, library.playlists]);

  const handleArtwork = useCallback((url: string | null) => setPreviewArtwork(url), []);

  const reorderPins = (next: ServiceId[]) => {
    setPinnedServices(next);
    savePrefs({ pinned: next });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable),
      );

      if (event.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        else if (shortcutsOpen) setShortcutsOpen(false);
        else if (view === "settings") {
          setView("services");
          setQuery("");
        }
        return;
      }
      if (typing) return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, shortcutsOpen, view]);

  const togglePin = (id: ServiceId) => {
    setPinnedServices((prev) => {
      const next = prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id];
      savePrefs({ pinned: next });
      return next;
    });
  };

  const createPlaylistFolder = (name: string) => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return;
    const id = `pfolder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setPlaylistFolders((prev) => [...prev, { id, name: clean, playlistIds: [] }]);
  };

  const renamePlaylistFolder = (id: string, name: string) => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return;
    setPlaylistFolders((prev) =>
      prev.map((folder) => (folder.id === id ? { ...folder, name: clean } : folder)),
    );
  };

  const deletePlaylistFolder = (id: string) => {
    setPlaylistFolders((prev) => prev.filter((folder) => folder.id !== id));
  };

  const movePlaylistToFolder = (playlistId: string, folderId: string | null) => {
    setPlaylistFolders((prev) =>
      prev
        .map((folder) => ({
          ...folder,
          playlistIds: folder.playlistIds.filter((id) => id !== playlistId),
        }))
        .map((folder) =>
          folder.id === folderId
            ? { ...folder, playlistIds: [playlistId, ...folder.playlistIds] }
            : folder,
        ),
    );
  };

  const touchService = (id: ServiceId) => {
    setRecentServices((prev) => {
      const next = [id, ...prev.filter((entry) => entry !== id)].slice(0, 5);
      savePrefs({ recent: next });
      return next;
    });
  };

  /** Every entry point — cards, recents, pins, palette — opens a service page. */
  const openServicePage = (id: ServiceId) => {
    setServiceId(id);
    setView(`service:${id}`);
    touchService(id);
  };

  const clearRecentServices = () => {
    setRecentServices([]);
    savePrefs({ recent: [] });
  };

  /** Creates a Verse playlist and puts the song that opened the picker inside it. */
  const createPlaylistWithTrack = useCallback(
    async (name: string, track: RemoteTrack) => {
      const created = await library.createPlaylist(name);
      if (!created) throw new Error("That playlist could not be created.");
      await library.addRemoteToPlaylist(created.id, track);
    },
    [library],
  );

  const addLook = (name: string) => {
    setSavedLooks((prev) => {
      const next = saveLook(prev, { name, appearance });
      savePrefs({ savedLooks: next });
      return next;
    });
  };

  const deleteLook = (id: string) => {
    setSavedLooks((prev) => {
      const next = prev.filter((entry) => entry.id !== id);
      savePrefs({ savedLooks: next });
      return next;
    });
  };

  const applyLook = (look: Appearance) => setAppearance((prev) => ({ ...prev, ...look }));

  /** Saves the playlists and the open view before an edit, and offers it as Undo. */
  const rememberPlaylists = useCallback(
    (action: PlaylistAction, label: string) => {
      const snap = snapshotPlaylists(action, label, view, library.playlists);
      savePlaylistUndo(snap);
      setPlaylistUndo(snap);
      return snap;
    },
    [view, library.playlists],
  );

  const duplicatePlaylist = useCallback(
    async (playlist: Playlist) => {
      rememberPlaylists("duplicate", `“${playlist.name}” duplicated`);
      const created = await library.createPlaylist(
        duplicateName(
          library.playlists.map((entry) => entry.name),
          playlist.name,
        ),
      );
      if (!created) {
        clearPlaylistUndo();
        setPlaylistUndo(null);
        return;
      }
      for (const trackId of playlist.trackIds) {
        await library.addToPlaylist(created.id, trackId);
      }
      for (const track of playlist.remoteTracks ?? []) {
        await library.addRemoteToPlaylist(created.id, track);
      }
      setView(`playlist:${created.id}`);
      library.setNotice(
        `Duplicated “${playlist.name}” as “${created.name}”. Undo is in the corner.`,
      );
    },
    [rememberPlaylists, library],
  );

  const mergePlaylistInto = useCallback(
    async (source: Playlist, target: Playlist) => {
      rememberPlaylists("merge", `“${source.name}” merged into “${target.name}”`);
      const merged = mergeTrackIds(target.trackIds, source.trackIds);
      // addToPlaylist first: reorder only accepts ids the target already knows about.
      for (const trackId of source.trackIds) {
        await library.addToPlaylist(target.id, trackId);
      }
      for (const track of source.remoteTracks ?? []) {
        await library.addRemoteToPlaylist(target.id, track);
      }
      await library.reorderPlaylist(target.id, merged);
      await library.deletePlaylist(source.id);
      setMergeSource(null);
      setView(`playlist:${target.id}`);
      library.setNotice(
        `Merged “${source.name}” into “${target.name}”. Undo is in the corner.`,
      );
    },
    [rememberPlaylists, library],
  );

  const deletePlaylistNow = useCallback(
    async (playlist: Playlist) => {
      rememberPlaylists("delete", `“${playlist.name}” deleted`);
      await library.deletePlaylist(playlist.id);
      if (view === `playlist:${playlist.id}`) setView("songs");
      library.setNotice(`Deleted “${playlist.name}”. Undo is in the corner.`);
    },
    [rememberPlaylists, library, view],
  );

  /**
   * Rebuilds the snapshotted playlists exactly (names, track order) and returns to the
   * playlist that was open, using the ids the recreated playlists received.
   */
  const undoPlaylistChange = useCallback(async () => {
    const snap = playlistUndo;
    if (!snap) return;
    for (const playlist of library.playlists) await library.deletePlaylist(playlist.id);
    const idMap = new Map<string, string>();
    for (const playlist of snap.playlists) {
      const created = await library.createPlaylist(playlist.name);
      if (!created) continue;
      idMap.set(playlist.id, created.id);
      for (const trackId of playlist.trackIds) {
        await library.addToPlaylist(created.id, trackId);
      }
      for (const track of playlist.remoteTracks ?? []) {
        await library.addRemoteToPlaylist(created.id, track);
      }
    }
    setView(viewAfterRestore(snap.view, idMap));
    clearPlaylistUndo();
    setPlaylistUndo(null);
    library.setNotice("Playlists restored.");
  }, [playlistUndo, library]);

  const copyPlaylistLink = useCallback(
    (playlist: Playlist) => {
      const link = insideTauri()
        ? playlistDeepLinkFor(playlist.id)
        : `${window.location.origin}${window.location.pathname}#playlist=${encodeURIComponent(playlist.id)}`;
      void navigator.clipboard?.writeText(link).catch(() => undefined);
      library.setNotice("Play link for this playlist copied.");
    },
    [library],
  );

  const exportBundleText = useCallback(
    () =>
      serializeBundle({
        looks: savedLooks,
        pinned: pinnedServices,
        prefs: appearance,
        playlists: library.playlists.map((playlist) => ({
          name: playlist.name,
          tracks: playlist.trackIds.map((id) => {
            const track = library.tracks.find((entry) => entry.id === id);
            return { id, title: track?.title ?? "", artist: track?.artist ?? "" };
          }),
        })),
      }),
    [savedLooks, pinnedServices, appearance, library.playlists, library.tracks],
  );

  const planBundle = useCallback(
    (text: string, mode: ImportMode) =>
      planBundleText(
        text,
        {
          playlists: library.playlists,
          looks: savedLooks,
          pinned: pinnedServices,
          prefs: appearance,
        },
        library.tracks,
        mode,
      ),
    [appearance, library.playlists, library.tracks, savedLooks, pinnedServices],
  );

  /**
   * Applies only the sections that survived the review sheet. Rejected bundles never
   * reach here; playlist writes are snapshotted first so even a mid-write failure can
   * be undone.
   */
  const applyBundle = useCallback(
    async (preview: BundlePreview, sections: ImportSections): Promise<BundleImportReport> => {
      const { next, applied } = applyImportSections(
        preview.plan,
        preview.bundle,
        {
          playlists: library.playlists,
          looks: savedLooks,
          pinned: pinnedServices,
          prefs: appearance,
        },
        sections,
      );

      let playlistsChanged = 0;
      if (applied.playlists) {
        const snap = snapshotPlaylists("import", "Playlist import", view, library.playlists);
        savePlaylistUndo(snap);
        setPlaylistUndo(snap);

        for (const id of preview.plan.playlists.deleteIds) await library.deletePlaylist(id);
        for (const entry of preview.plan.playlists.create) {
          const created = await library.createPlaylist(entry.name);
          if (!created) {
            return {
              ok: false,
              error:
                "The playlists in that bundle could not be written — looks, pins and appearance were left untouched. Undo is available for any playlists already changed.",
            };
          }
          for (const trackId of entry.trackIds) await library.addToPlaylist(created.id, trackId);
          playlistsChanged += 1;
        }
        for (const entry of preview.plan.playlists.append) {
          for (const trackId of entry.trackIds) await library.addToPlaylist(entry.playlistId, trackId);
          playlistsChanged += 1;
        }
      }

      setAppearance(next.prefs);
      setSavedLooks(next.looks);
      setPinnedServices(next.pinned);
      savePrefs({ ...next.prefs, savedLooks: next.looks, pinned: next.pinned });

      return {
        ok: true,
        mode: preview.plan.mode,
        legacy: preview.legacy,
        sections: applied,
        looks: next.looks.length,
        pinned: next.pinned.length,
        playlists: playlistsChanged,
        removedPlaylists: applied.playlists ? preview.plan.playlists.deleteIds.length : 0,
      };
    },
    [appearance, library, savedLooks, pinnedServices, view],
  );

  const albums = useMemo<AlbumGroup[]>(() => {
    return albumGroups(library.tracks).sort((a, b) => a.name.localeCompare(b.name));
  }, [library.tracks]);

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; tracks: Track[] }>();
    for (const track of library.tracks) {
      const name = track.artist || "Unknown artist";
      const existing = map.get(name);
      if (existing) existing.tracks.push(track);
      else map.set(name, { name, tracks: [track] });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [library.tracks]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "nav:songs",
        label: "Songs",
        group: "Go",
        hint: `${library.tracks.length} tracks`,
        run: () => setView("songs"),
      },
      { id: "nav:albums", label: "Albums", group: "Go", run: () => setView("albums") },
      { id: "nav:artists", label: "Artists", group: "Go", run: () => setView("artists") },
      {
        id: "nav:services",
        label: "Services",
        group: "Go",
        hint: `${SERVICES.length} services`,
        run: () => setView("services"),
      },
      {
        id: "nav:spotify",
        label: "Spotify",
        group: "Go",
        run: () => openServicePage("spotify"),
      },
      { id: "nav:settings", label: "Settings", group: "Go", run: () => setView("settings") },
      ...SERVICES.flatMap<Command>((service) => {
        const isPinned = pinnedServices.includes(service.id);
        return [
          {
            id: `service:${service.id}`,
            label: `Open ${service.name}`,
            group: "Services",
            hint: service.capability,
            run: () => {
              openServicePage(service.id);
            },
          },
          {
            id: `search:${service.id}`,
            label: `Search in ${service.name}`,
            group: "Services",
            hint:
              service.playback === "preview"
                ? "Live previews, focused search field"
                : "Opens the service's own search",
            run: () => {
              openServicePage(service.id);
              setSearchRequest((count) => count + 1);
            },
          },
          {
            id: `pin:${service.id}`,
            label: `${isPinned ? "Unpin" : "Pin"} ${service.name}`,
            group: "Pins",
            hint: isPinned ? "Remove from the pinned shelf" : "Keep on top and in the sidebar",
            run: () => togglePin(service.id),
          },
          {
            id: `handoff:${service.id}`,
            label: `Hand off to ${service.name}`,
            group: "Services",
            hint: service.home.replace(/^https?:\/\//, ""),
            run: () => void openExternal(service.home),
          },
        ];
      }),
      ...albums.flatMap<Command>((album) => [
        {
          id: `album:play:${album.key}`,
          label: `Play album: ${album.name}`,
          group: "Albums",
          hint: `${album.artist} · ${album.tracks.length} tracks`,
          run: () => playerLive.current.playQueue(album.tracks, 0),
        },
        {
          id: `album:open:${album.key}`,
          label: `Open album: ${album.name}`,
          group: "Albums",
          hint: album.artist,
          run: () => {
            setView("songs");
            setSort("recent");
            setQuery(album.name);
          },
        },
      ]),
      ...artists.flatMap<Command>((artist) => [
        {
          id: `artist:play:${artist.name}`,
          label: `Play artist: ${artist.name}`,
          group: "Artists",
          hint: `${artist.tracks.length} tracks`,
          run: () => playerLive.current.playQueue(artist.tracks, 0),
        },
        {
          id: `artist:open:${artist.name}`,
          label: `Open artist: ${artist.name}`,
          group: "Artists",
          hint: artist.tracks.length === 1 ? "1 track" : `${artist.tracks.length} tracks`,
          run: () => {
            setView("songs");
            setQuery(artist.name);
          },
        },
      ]),
      ...library.playlists.map((playlist) => ({
        id: `playlist:${playlist.id}`,
        label: playlist.name,
        group: "Playlists",
        hint: `Open playlist · ${playlist.trackIds.length} tracks`,
        run: () => setView(`playlist:${playlist.id}`),
      })),
      ...library.playlists.map((playlist) => ({
        id: `playplaylist:${playlist.id}`,
        label: `Play playlist: ${playlist.name}`,
        group: "Playlists",
        hint:
          playlist.trackIds.length === 0
            ? "Empty — nothing to play"
            : `From the first track · ${playlist.trackIds.length} tracks`,
        run: () => {
          const tracks = playlist.trackIds
            .map((id) => library.tracks.find((track) => track.id === id))
            .filter((track): track is Track => Boolean(track));
          if (tracks.length > 0) {
            playerLive.current.playQueue(tracks, 0);
            setView(`playlist:${playlist.id}`);
          }
        },
      })),
      ...(player.current
        ? library.playlists.map((entry) => ({
            id: `addtrack:${entry.id}`,
            label: `Add ${player.current?.title} to ${entry.name}`,
            group: "Playlists",
            hint: "Currently playing",
            run: () => {
              if (player.current) void library.addToPlaylist(entry.id, player.current.id);
            },
          }))
        : []),
      ...library.playlists.map((entry) => ({
        id: `rename:${entry.id}`,
        label: `Rename playlist: ${entry.name}`,
        group: "Playlists",
        hint: "Rename in place",
        run: () => setRenaming({ id: entry.id, name: entry.name }),
      })),
      ...library.playlists.map((entry) => ({
        id: `reorder:${entry.id}`,
        label: `Reorder tracks in ${entry.name}`,
        group: "Playlists",
        hint: `${entry.trackIds.length} tracks`,
        run: () => setReordering(entry.id),
      })),
      ...THEMES.map((theme) => ({
        id: `theme:${theme.id}`,
        label: `Theme: ${theme.name}`,
        group: "Appearance",
        hint: theme.note,
        run: () => setAppearance((prev) => ({ ...prev, theme: theme.id })),
      })),
      ...GRADIENT_PRESETS.map((preset) => ({
        id: `gradient:${preset.id}`,
        label: `Gradient: ${preset.name}`,
        group: "Appearance",
        run: () =>
          setAppearance((prev) => ({
            ...prev,
            gradient: { ...preset.gradient },
            accent: preset.accent,
            accentHex: null,
          })),
      })),
      {
        id: "gradient:off",
        label: "Gradient: off",
        group: "Appearance",
        hint: "Back to drifting colour only",
        run: () => setAppearance((prev) => ({ ...prev, gradient: null })),
      },
      {
        id: "appearance:reset",
        label: "Reset appearance",
        group: "Appearance",
        run: () => setAppearance(appearanceOf(DEFAULT_PREFS)),
      },
      {
        id: "layout:sidebar",
        label: appearance.sidebar === "hidden" ? "Show sidebar" : "Collapse sidebar",
        group: "Layout",
        hint: "Saved between launches",
        run: () =>
          setAppearance((prev) => ({
            ...prev,
            sidebar: prev.sidebar === "hidden" ? "full" : "hidden",
          })),
      },
      {
        id: "layout:focus",
        label: appearance.focus ? "Leave focus mode" : "Focus mode",
        group: "Layout",
        hint: "Hide the chrome, keep the controls",
        run: () => setAppearance((prev) => ({ ...prev, focus: !prev.focus })),
      },
      {
        id: "layout:art",
        label: appearance.artTint ? "Stop tinting from artwork" : "Tint glass from artwork",
        group: "Layout",
        run: () => setAppearance((prev) => ({ ...prev, artTint: !prev.artTint })),
      },
      {
        id: "help:shortcuts",
        label: "Keyboard shortcuts",
        group: "Help",
        hint: "?",
        run: () => setShortcutsOpen(true),
      },
    ];

    library.tracks.slice(0, 100).forEach((track, index) => {
      list.push({
        id: `track:${track.id}`,
        label: track.title,
        group: "Play",
        hint: track.artist,
        run: () => playerLive.current.playQueue(library.tracks, index),
      });
    });

    return list;
  }, [
    library.tracks,
    library.playlists,
    albums,
    artists,
    pinnedServices,
    appearance.sidebar,
    appearance.focus,
    appearance.artTint,
    player.current,
  ]);

  useShortcuts({
    player,
    overlayOpen: nowPlayingOpen,
    onToggleOverlay: () => setNowPlayingOpen((open) => !open),
    onCloseOverlay: () => setNowPlayingOpen(false),
    onQuickLaunch: (index) => {
      const id = pinnedServices[index];
      if (!id) return;
      openServicePage(id);
    },
  });

  const playlist = useMemo(() => {
    if (!view.startsWith("playlist:")) return null;
    const id = view.slice("playlist:".length);
    const found = library.playlists.find((entry) => entry.id === id) ?? null;
    if (!found) return null;
    const tracks = found.trackIds
      .map((trackId) => library.tracks.find((track) => track.id === trackId))
      .filter((track): track is Track => Boolean(track));
    const remoteTracks = found.remoteTracks ?? [];
    return { ...found, remoteTracks, tracks: [...tracks, ...remoteTracks.map(remoteAsTrack)] };
  }, [view, library.playlists, library.tracks]);

  const searchMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return library.tracks;
    return library.tracks.filter((track) =>
      [track.title, track.artist, track.album].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [library.tracks, query]);

  const songs = useMemo(() => sortTracks(searchMatches, sort), [searchMatches, sort]);

  /** Every remote song saved into any Verse playlist, once, newest first. */
  const savedRemote = useMemo(() => {
    const seen = new Set<string>();
    const list: RemoteTrack[] = [];
    for (const entry of library.playlists) {
      for (const remote of entry.remoteTracks ?? []) {
        if (seen.has(remote.id)) continue;
        seen.add(remote.id);
        list.push(remote);
      }
    }
    return list.sort((a, b) => b.addedAt - a.addedAt);
  }, [library.playlists]);

  const savedTracks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? savedRemote.filter((remote) =>
          [remote.title, remote.artist, remote.album].some((value) =>
            value.toLowerCase().includes(needle),
          ),
        )
      : savedRemote;
    return matches.map(remoteAsTrack);
  }, [savedRemote, query]);

  const libraryAlbums = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return albums;
    return albums.filter((album) =>
      [album.name, album.artist].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [albums, query]);

  const libraryArtists = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return artists;
    return artists.filter((artist) => artist.name.toLowerCase().includes(needle));
  }, [artists, query]);

  const reorderTarget = reordering
    ? (library.playlists.find((entry) => entry.id === reordering) ?? null)
    : null;
  const mergeTarget = mergeSource
    ? (library.playlists.find((entry) => entry.id === mergeSource) ?? null)
    : null;

  const tracksForView =
    view === "saved"
      ? savedTracks
      : view.startsWith("playlist:")
        ? (playlist?.tracks ?? [])
        : songs;
  const playableTracks = tracksForView.filter((track) => !track.remote);
  const totalDuration = tracksForView.reduce((sum, track) => sum + track.durationMs, 0);

  const heading =
    servicePage
      ? servicePage.name
      : view === "settings"
      ? "Settings"
      : view === "spotify"
        ? "Spotify"
        : view === "liked"
          ? "Liked songs"
          : view === "saved"
            ? "Saved songs"
            : view === "services"
              ? "Services"
              : view === "albums"
                ? "Albums"
          : view === "artists"
            ? "Artists"
            : playlist
              ? playlist.name
              : "All songs";

  const subtitle =
    servicePage
      ? `${servicePage.capability} · ${servicePage.note}`
      : view === "settings"
      ? "Modules for personalisation, streaming services, versions and backups"
      : view === "spotify"
        ? spotify.status?.connected
          ? `Remote control${spotify.status.name ? ` · ${spotify.status.name}` : ""}`
          : "Connect your account to mirror playback and control it"
        : view === "liked"
          ? spotify.status?.connected
            ? `${spotify.library.liked.length} liked songs · save any of them into a Verse playlist`
            : "Connect Spotify to load the songs you have liked"
          : view === "saved"
            ? `${savedTracks.length} songs saved from services · playback opens the service or plays its preview`
            : view === "services"
          ? `${SERVICES.length} services · ${pinnedServices.length} pinned · embeds, previews and hand-off`
          : view === "albums"
            ? `${libraryAlbums.length} albums`
          : view === "artists"
            ? `${libraryArtists.length} artists`
            : playlist
              ? `${tracksForView.length} songs · ${formatDuration(totalDuration)}${
                  playlist.remoteTracks.length > 0
                    ? " · from several services"
                    : " · drag a row, or focus it and press Alt+↑/↓"
                }`
              : `${tracksForView.length} tracks · ${formatDuration(totalDuration)}`;

  const playRemote = useCallback(
    (track: Track) => {
      const remote = track.remote;
      if (!remote) return;
      if (remote.previewUrl) {
        player.playQueue([track], 0);
      } else if (remote.uri && spotify.status?.connected) {
        void spotify.playUri(remote.uri);
      } else {
        void openExternal(remote.url);
      }
    },
    [player, spotify],
  );

  const playAll = () => {
    if (playableTracks.length > 0) player.playQueue(playableTracks, 0);
  };

  const shuffleAll = () => {
    if (playableTracks.length === 0) return;
    const shuffled = [...playableTracks].sort(() => Math.random() - 0.5);
    player.playQueue(shuffled, 0);
  };

  return (
    <div className="app-shell">
      <div className="art-tint" aria-hidden />

      {arrival && (
        <div className="arrival-banner" data-kind={arrival.kind} role="status">
          <span>{arrival.text}</span>
          <button className="btn-icon" aria-label="Dismiss" onClick={() => setArrival(null)}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      {updateInfo && (
        <div
          className="arrival-banner"
          data-kind={updateError ? "error" : "ok"}
          role="status"
          style={arrival ? { top: 62 } : undefined}
        >
          <span title={updateInfo.notes || undefined}>
            {updateError
              ? `Update failed: ${updateError}`
              : updating
                ? updateProgress === null
                  ? `Downloading Verse ${updateInfo.latest} — Verse restarts when it is ready.`
                  : updateProgress >= 1
                    ? `Installing Verse ${updateInfo.latest} — Verse reopens in a moment.`
                    : `Downloading Verse ${updateInfo.latest} — ${Math.round(updateProgress * 100)}%. Verse restarts when it is ready.`
                : `Verse ${updateInfo.latest} is available — you are on ${updateInfo.current}.`}
          </span>
          <button
            className="btn btn-primary"
            disabled={updating}
            onClick={() => {
              setUpdating(true);
              setUpdateError(null);
              setUpdateProgress(0);
              void api.installUpdate().catch((error) => {
                setUpdateError(String(error));
                setUpdating(false);
                setUpdateProgress(null);
              });
            }}
          >
            {updating ? "Updating…" : "Update now"}
          </button>
          <button
            className="btn-icon"
            aria-label="Dismiss update"
            onClick={() => setUpdateInfo(null)}
          >
            <CloseIcon size={13} />
          </button>
          {updating && (
            <span
              className="update-progress"
              role="progressbar"
              aria-label="Update download"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((updateProgress ?? 0) * 100)}
            >
              <span style={{ width: `${Math.round((updateProgress ?? 0) * 100)}%` }} />
            </span>
          )}
        </div>
      )}

      {library.demo && <div className="demo-badge">Preview library</div>}

      {appearance.focus && (
        <button
          className="focus-exit"
          onClick={() => setAppearance((prev) => ({ ...prev, focus: false, sidebar: "full" }))}
        >
          Exit focus
        </button>
      )}

      {appearance.sidebar === "hidden" && !appearance.focus && (
        <button
          className="sidebar-restore"
          title="Show sidebar"
          onClick={() => setAppearance((prev) => ({ ...prev, sidebar: "full" }))}
        >
          Show sidebar
        </button>
      )}

      <Sidebar
        view={view}
        folders={library.folders}
        playlists={library.playlists}
        playlistFolders={playlistFolders}
        scanning={library.scanning}
        trackCount={library.tracks.length}
        likedCount={spotify.library.liked.length}
        savedCount={savedRemote.length}
        pinned={pinnedServices}
        onReorderPins={reorderPins}
        onToggleSidebar={() =>
          setAppearance((prev) => ({
            ...prev,
            sidebar: prev.sidebar === "hidden" ? "full" : "hidden",
          }))
        }
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenService={openServicePage}
        onNavigate={(next) => {
          setView(next);
          setQuery("");
        }}
        onOpenPlaylist={(id) => setView(`playlist:${id}`)}
        onAddFolder={() => void (isAndroid() ? library.scanDeviceMusic() : library.addFolder())}
        onRemoveFolder={(path) => void library.removeFolder(path)}
        onCreatePlaylist={() => setCreating("")}
        onCreatePlaylistFolder={() => setFolderCreating("")}
        onRenamePlaylistFolder={renamePlaylistFolder}
        onDeletePlaylistFolder={deletePlaylistFolder}
        onMovePlaylistToFolder={movePlaylistToFolder}
      />

      <main className="main">
        <div className="main-scroll">
          <div className="page-head">
            <div>
              <h1
                className="page-title"
                id={view === "settings" ? "settings-title" : undefined}
                tabIndex={view === "settings" ? -1 : undefined}
              >
                {heading}
              </h1>
              <div className="page-sub">{subtitle}</div>
            </div>

            {view !== "settings" && view !== "services" && view !== "liked" && !servicePageId && (
            <div className="row-actions">
              {playlist && (
                <div className="playlist-tools" role="group" aria-label="Playlist actions">
                  <button
                    className="btn btn-quiet"
                    aria-label={`Duplicate ${playlist.name}`}
                    onClick={() => void duplicatePlaylist(playlist)}
                  >
                    Duplicate
                  </button>
                  <button
                    className="btn btn-quiet"
                    aria-label={`Merge ${playlist.name} into another playlist`}
                    onClick={() => setMergeSource(playlist.id)}
                  >
                    Merge into…
                  </button>
                  <button
                    className="btn btn-quiet"
                    aria-label={`Copy play link for ${playlist.name}`}
                    onClick={() => copyPlaylistLink(playlist)}
                  >
                    Copy link
                  </button>
                  <button
                    className="btn btn-quiet"
                    aria-label={`Delete ${playlist.name}`}
                    onClick={() => void deletePlaylistNow(playlist)}
                  >
                    Delete
                  </button>
                </div>
              )}
              <div className="field">
                <SearchIcon />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, artist, album"
                  spellCheck={false}
                />
              </div>
              {view !== "albums" && view !== "artists" && view !== "spotify" && view !== "services" && view !== "saved" && (
                <>
                  <select
                    className="sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as Sort)}
                  >
                    <option value="recent">Recently added</option>
                    <option value="title">Title</option>
                    <option value="artist">Artist</option>
                    <option value="duration">Longest</option>
                  </select>
                  <button className="btn btn-primary" onClick={playAll} disabled={playableTracks.length === 0}>
                    <PlayIcon size={15} />
                    Play all
                  </button>
                  <button className="btn" onClick={shuffleAll} disabled={playableTracks.length === 0}>
                    <ShuffleIcon size={15} />
                    Shuffle
                  </button>
                </>
              )}
            </div>
            )}
          </div>

          {view === "settings" ? (
            <SettingsView
              appearance={appearance}
              onDone={() => {
                setView("services");
                setQuery("");
              }}
              onChange={(patch) => setAppearance((prev) => ({ ...prev, ...patch }))}
              tracks={library.tracks.length}
              albums={albums.length}
              artists={artists.length}
              folders={library.folders.length}
              pinned={pinnedServices}
              onTogglePin={togglePin}
              savedLooks={savedLooks}
              onSaveLook={addLook}
              onDeleteLook={deleteLook}
              onApplyLook={applyLook}
              onExportBundle={exportBundleText}
              onPlanBundle={planBundle}
              onApplyBundle={applyBundle}
              onReset={() => setAppearance(appearanceOf(DEFAULT_PREFS))}
            />
          ) : view === "services" || servicePageId ? (
            <ServicesView
              mode={servicePageId ? "page" : "directory"}
              spotify={spotify}
              playlists={library.playlists}
              onAddRemote={library.addRemoteToPlaylist}
              onCreatePlaylist={createPlaylistWithTrack}
              serviceId={servicePageId ?? serviceId}
              onSelectService={(id) => {
                setServiceId(id);
                if (servicePageId) setView(`service:${id}`);
              }}
              onOpenService={openServicePage}
              onBack={() => setView("services")}
              pinned={pinnedServices}
              onTogglePin={togglePin}
              onReorderPins={reorderPins}
              recent={recentServices}
              onTouchService={touchService}
              onClearRecent={clearRecentServices}
              searchRequest={searchRequest}
              onArtwork={handleArtwork}
            />
          ) : view === "spotify" ? (
            <SpotifyView
              spotify={spotify}
              playlists={library.playlists}
              onAddRemote={library.addRemoteToPlaylist}
              onCreatePlaylist={createPlaylistWithTrack}
            />
          ) : view === "liked" ? (
            <SpotifyView
              section="liked"
              spotify={spotify}
              playlists={library.playlists}
              onAddRemote={library.addRemoteToPlaylist}
              onCreatePlaylist={createPlaylistWithTrack}
            />
          ) : view === "saved" ? (
            <TrackTable
              tracks={savedTracks}
              currentId={player.current?.id ?? null}
              playlists={library.playlists}
              onPlay={playRemote}
              onAddToPlaylist={(playlistId, trackId) =>
                void library.addToPlaylist(playlistId, trackId)
              }
              emptyMessage="Songs saved from any service land here. Use the arrow on a song to save it."
            />
          ) : library.loading ? (
            <div className="panel">
              <div className="empty-state">Reading your library…</div>
            </div>
          ) : library.tracks.length === 0 ? (
            <div className="panel">
              <div className="empty-state">
                <div className="empty-icon">
                  <MusicIcon size={22} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 620, color: "var(--text)" }}>
                  Your library is empty
                </div>
                <div style={{ maxWidth: 400, fontSize: 13.5 }}>
                  Add a folder of local audio — MP3, FLAC, M4A, WAV, OGG. Verse reads the tags and
                  cover art, and finds synced lyrics while you listen.
                </div>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 6 }}
                  onClick={() => void (isAndroid() ? library.scanDeviceMusic() : library.addFolder())}
                >
                  {isAndroid() ? "Scan device music" : "Add a music folder"}
                </button>
              </div>
            </div>
          ) : view === "albums" ? (
            <div className="album-grid">
              {libraryAlbums.map((album) => (
                <button
                  key={album.key}
                  className="album-card"
                  onClick={() => {
                    setView("songs");
                    setSort("recent");
                    setQuery(album.name);
                  }}
                >
                  {album.coverPath ? (
                    <img className="cover" src={assetUrl(album.coverPath)} alt="" />
                  ) : (
                    <div className="cover" />
                  )}
                  <div className="album-name">{album.name}</div>
                  <div className="album-meta">
                    {album.artist} · {album.tracks.length}
                  </div>
                </button>
              ))}
            </div>
          ) : view === "artists" ? (
            <div className="panel">
              {libraryArtists.map((artist) => (
                <button
                  key={artist.name}
                  className="track-row"
                  style={{ gridTemplateColumns: "1fr 90px", width: "100%", textAlign: "left" }}
                  onClick={() => {
                    setView("songs");
                    setQuery(artist.name);
                  }}
                >
                  <span className="track-title">{artist.name}</span>
                  <span className="track-dur">{artist.tracks.length} tracks</span>
                </button>
              ))}
            </div>
          ) : (
            <TrackTable
              tracks={tracksForView}
              currentId={player.current?.id ?? null}
              playlists={library.playlists}
              onPlay={(track) => {
                if (track.remote) {
                  playRemote(track);
                  return;
                }
                const index = tracksForView.findIndex((entry) => entry.id === track.id);
                player.playQueue(tracksForView, index < 0 ? 0 : index);
              }}
              onAddToPlaylist={(playlistId, trackId) =>
                void library.addToPlaylist(playlistId, trackId)
              }
              onRemove={
                playlist
                  ? (track) =>
                      void (track.remote
                        ? library.removeRemoteFromPlaylist(playlist.id, track.remote.id)
                        : library.removeFromPlaylist(playlist.id, track.id))
                  : undefined
              }
              onReorderTrack={
                playlist && playlist.remoteTracks.length === 0
                  ? (fromId, beforeId) =>
                      void library.reorderPlaylist(
                        playlist.id,
                        moveBefore(playlist.trackIds, fromId, beforeId),
                      )
                  : undefined
              }
              emptyMessage={
                playlist
                  ? "This playlist is empty. Use the arrow on any song, from any service."
                  : "No tracks match."
              }
            />
          )}
        </div>
      </main>

      <PlayerBar player={player} onExpand={() => setNowPlayingOpen(true)} />

      {nowPlayingOpen && (
        <NowPlaying player={player} onClose={() => setNowPlayingOpen(false)} />
      )}

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {playlistUndo && (
        <div className="undo-banner" role="status" aria-label="Playlist undo">
          <span className="undo-text">{playlistUndo.label}</span>
          <button className="btn btn-primary" onClick={() => void undoPlaylistChange()}>
            Undo
          </button>
          <button
            className="btn-icon"
            aria-label="Dismiss undo"
            onClick={() => {
              clearPlaylistUndo();
              setPlaylistUndo(null);
            }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      {library.notice && (
        <div
          className="chip"
          style={{
            position: "fixed",
            left: 24,
            bottom: 96,
            zIndex: 70,
            padding: "9px 14px",
            background: "#1a1a1f",
            fontSize: 12.5,
            color: "var(--text)",
          }}
        >
          {library.notice}
        </div>
      )}

      {renaming && (
        <div className="modal-scrim" onClick={() => setRenaming(null)}>
          <div
            className="modal"
            style={{ width: "min(420px, 92vw)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 640, marginBottom: 4 }}>Rename playlist</div>
            <div style={{ color: "var(--text-dim)", fontSize: 12.5, marginBottom: 14 }}>
              The new name shows in the sidebar, the page title and ⌘K immediately.
            </div>
            <div className="field" style={{ minWidth: 0 }}>
              <input
                autoFocus
                value={renaming.name}
                maxLength={60}
                onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && renaming.name.trim()) {
                    void library.renamePlaylist(renaming.id, renaming.name.trim());
                    setRenaming(null);
                  }
                }}
                aria-label="Playlist name"
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!renaming.name.trim()}
                onClick={() => {
                  void library.renamePlaylist(renaming.id, renaming.name.trim());
                  setRenaming(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {reorderTarget && (
        <div className="modal-scrim" onClick={() => setReordering(null)}>
          <div
            className="modal reorder-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label={`Reorder ${reorderTarget.name}`}
          >
            <div className="reorder-head">
              <div>
                <div style={{ fontSize: 16, fontWeight: 640 }}>Reorder · {reorderTarget.name}</div>
                <div style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: 3 }}>
                  Moves save immediately and survive a restart.
                </div>
              </div>
              <button className="btn-icon" aria-label="Close" onClick={() => setReordering(null)}>
                <CloseIcon size={15} />
              </button>
            </div>
            <div className="reorder-list">
              {reorderTarget.trackIds.map((trackId, index) => {
                const entry = library.tracks.find((track) => track.id === trackId);
                const title = entry?.title ?? "Missing track";
                return (
                  <div className="reorder-row" key={trackId}>
                    <span className="reorder-index">{index + 1}</span>
                    <span className="reorder-title">{title}</span>
                    <span className="reorder-artist">{entry?.artist ?? ""}</span>
                    <button
                      className="btn-icon"
                      aria-label={`Move ${title} up`}
                      disabled={index === 0}
                      onClick={() =>
                        void library.reorderPlaylist(
                          reorderTarget.id,
                          moveItem(reorderTarget.trackIds, index, index - 1),
                        )
                      }
                    >
                      ↑
                    </button>
                    <button
                      className="btn-icon"
                      aria-label={`Move ${title} down`}
                      disabled={index === reorderTarget.trackIds.length - 1}
                      onClick={() =>
                        void library.reorderPlaylist(
                          reorderTarget.id,
                          moveItem(reorderTarget.trackIds, index, index + 1),
                        )
                      }
                    >
                      ↓
                    </button>
                  </div>
                );
              })}
              {reorderTarget.trackIds.length === 0 && (
                <div className="service-note">This playlist is empty.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {mergeTarget && (
        <div className="modal-scrim" onClick={() => setMergeSource(null)}>
          <div
            className="modal"
            style={{ width: "min(440px, 92vw)" }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label={`Merge ${mergeTarget.name}`}
          >
            <div style={{ fontSize: 16, fontWeight: 640, marginBottom: 4 }}>
              Merge “{mergeTarget.name}” into…
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12.5, marginBottom: 14 }}>
              The target keeps its order and gains only tracks it does not have. This playlist
              is removed afterwards. Undo restores both.
            </div>
            <div className="merge-list">
              {library.playlists
                .filter((entry) => entry.id !== mergeTarget.id)
                .map((entry) => (
                  <button
                    key={entry.id}
                    className="menu-item"
                    onClick={() => void mergePlaylistInto(mergeTarget, entry)}
                  >
                    {entry.name}
                    <span className="merge-count">{entry.trackIds.length} tracks</span>
                  </button>
                ))}
              {library.playlists.length <= 1 && (
                <div className="service-note">Create another playlist first.</div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn" onClick={() => setMergeSource(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {creating !== null && (
        <div className="modal-scrim" onClick={() => setCreating(null)}>
          <div
            className="modal"
            style={{ width: "min(420px, 92vw)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 640, marginBottom: 4 }}>New playlist</div>
            <div style={{ color: "var(--text-dim)", fontSize: 12.5, marginBottom: 14 }}>
              Give it a name — you can add tracks from any song row.
            </div>
            <div className="field" style={{ minWidth: 0 }}>
              <input
                autoFocus
                value={creating}
                onChange={(event) => setCreating(event.target.value)}
                placeholder="Late night"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && creating.trim()) {
                    void library.createPlaylist(creating.trim());
                    setCreating(null);
                  }
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setCreating(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (creating.trim()) void library.createPlaylist(creating.trim());
                  setCreating(null);
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {folderCreating !== null && (
        <div className="modal-scrim" onClick={() => setFolderCreating(null)}>
          <div
            className="modal"
            style={{ width: "min(420px, 92vw)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 640, marginBottom: 4 }}>New playlist folder</div>
            <div style={{ color: "var(--text-dim)", fontSize: 12.5, marginBottom: 14 }}>
              Give the folder a name, then drag playlists from the sidebar onto it.
            </div>
            <div className="field" style={{ minWidth: 0 }}>
              <input
                autoFocus
                value={folderCreating}
                onChange={(event) => setFolderCreating(event.target.value)}
                placeholder="Road trip"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && folderCreating.trim()) {
                    createPlaylistFolder(folderCreating);
                    setFolderCreating(null);
                  }
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setFolderCreating(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (folderCreating.trim()) createPlaylistFolder(folderCreating);
                  setFolderCreating(null);
                }}
              >
                Create folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
