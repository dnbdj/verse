import { useMemo, useState } from "react";
import { useLibrary } from "./hooks/useLibrary";
import { useShortcuts } from "./hooks/useShortcuts";
import { usePlayer } from "./hooks/usePlayer";
import { useSpotify } from "./hooks/useSpotify";
import { isAndroid } from "./lib/platform";
import { assetUrl } from "./lib/api";
import { formatDuration } from "./lib/format";
import type { Track } from "./lib/types";
import { PlayerBar } from "./components/PlayerBar";
import { Sidebar } from "./components/Sidebar";
import { NowPlaying } from "./components/NowPlaying";
import { SpotifyView } from "./components/SpotifyView";
import { TrackTable } from "./components/TrackTable";
import { MusicIcon, PlayIcon, SearchIcon, ShuffleIcon } from "./components/icons";

type Sort = "recent" | "title" | "artist" | "duration";

type AlbumGroup = {
  key: string;
  name: string;
  artist: string;
  coverPath: string | null;
  tracks: Track[];
};

const albumKey = (track: Track) => `${track.albumArtist || track.artist}|${track.album}`;

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

  const [view, setView] = useState("songs");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  useShortcuts({
    player,
    overlayOpen: nowPlayingOpen,
    onToggleOverlay: () => setNowPlayingOpen((open) => !open),
    onCloseOverlay: () => setNowPlayingOpen(false),
  });

  const albums = useMemo(() => {
    const map = new Map<string, AlbumGroup>();
    for (const track of library.tracks) {
      const key = albumKey(track);
      const existing = map.get(key);
      if (existing) {
        existing.tracks.push(track);
        if (!existing.coverPath && track.coverPath) existing.coverPath = track.coverPath;
        continue;
      }
      map.set(key, {
        key,
        name: track.album || "Unknown album",
        artist: track.albumArtist || track.artist || "Unknown artist",
        coverPath: track.coverPath,
        tracks: [track],
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
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

  const playlist = useMemo(() => {
    if (!view.startsWith("playlist:")) return null;
    const id = view.slice("playlist:".length);
    const found = library.playlists.find((entry) => entry.id === id) ?? null;
    if (!found) return null;
    const tracks = found.trackIds
      .map((trackId) => library.tracks.find((track) => track.id === trackId))
      .filter((track): track is Track => Boolean(track));
    return { ...found, tracks };
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

  const tracksForView = view.startsWith("playlist:") ? (playlist?.tracks ?? []) : songs;
  const totalDuration = tracksForView.reduce((sum, track) => sum + track.durationMs, 0);

  const heading =
    view === "spotify"
      ? "Spotify"
      : view === "albums"
        ? "Albums"
        : view === "artists"
          ? "Artists"
          : playlist
            ? playlist.name
            : "Songs";

  const subtitle =
    view === "spotify"
      ? spotify.status?.connected
        ? `Remote control${spotify.status.name ? ` · ${spotify.status.name}` : ""}`
        : "Connect your account to mirror playback and control it"
      : view === "albums"
        ? `${libraryAlbums.length} albums`
        : view === "artists"
          ? `${libraryArtists.length} artists`
          : `${tracksForView.length} tracks · ${formatDuration(totalDuration)}`;

  const playAll = () => {
    if (tracksForView.length > 0) player.playQueue(tracksForView, 0);
  };

  const shuffleAll = () => {
    if (tracksForView.length === 0) return;
    const shuffled = [...tracksForView].sort(() => Math.random() - 0.5);
    player.playQueue(shuffled, 0);
  };

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        trackCount={library.tracks.length}
        albumCount={albums.length}
        artistCount={artists.length}
        folders={library.folders}
        playlists={library.playlists}
        scanning={library.scanning}
        spotifyConnected={spotify.status?.connected ?? false}
        onNavigate={(next) => {
          setView(next);
          setQuery("");
        }}
        onOpenPlaylist={(id) => setView(`playlist:${id}`)}
        onAddFolder={() => void (isAndroid() ? library.scanDeviceMusic() : library.addFolder())}
        onRemoveFolder={(path) => void library.removeFolder(path)}
        onCreatePlaylist={() => setCreating("")}
      />

      <main className="main">
        <div className="main-scroll">
          <div className="page-head">
            <div>
              <h1 className="page-title">{heading}</h1>
              <div className="page-sub">{subtitle}</div>
            </div>

            <div className="row-actions">
              <div className="field">
                <SearchIcon />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, artist, album"
                  spellCheck={false}
                />
              </div>
              {view !== "albums" && view !== "artists" && view !== "spotify" && (
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
                  <button className="btn btn-primary" onClick={playAll} disabled={tracksForView.length === 0}>
                    <PlayIcon size={15} />
                    Play all
                  </button>
                  <button className="btn" onClick={shuffleAll} disabled={tracksForView.length === 0}>
                    <ShuffleIcon size={15} />
                    Shuffle
                  </button>
                </>
              )}
            </div>
          </div>

          {view === "spotify" ? (
            <SpotifyView spotify={spotify} />
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
                const index = tracksForView.findIndex((entry) => entry.id === track.id);
                player.playQueue(tracksForView, index < 0 ? 0 : index);
              }}
              onAddToPlaylist={(playlistId, trackId) =>
                void library.addToPlaylist(playlistId, trackId)
              }
              onRemove={
                playlist
                  ? (track) => void library.removeFromPlaylist(playlist.id, track.id)
                  : undefined
              }
              emptyMessage={
                playlist ? "This playlist is empty. Add tracks from Songs." : "No tracks match."
              }
            />
          )}
        </div>
      </main>

      <PlayerBar player={player} onExpand={() => setNowPlayingOpen(true)} />

      {nowPlayingOpen && (
        <NowPlaying player={player} onClose={() => setNowPlayingOpen(false)} />
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
    </div>
  );
}
