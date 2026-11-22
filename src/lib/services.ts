/**
 * The streaming services that are not Spotify.
 *
 * Spotify gets real remote control through the Rust OAuth bridge. Everything else
 * lives here, and each service is honest about what it can do:
 *
 *   embed   — the service's own player runs inside Verse (YouTube, SoundCloud)
 *   preview — a public preview feed plays in-app, full tracks stay in the app (Deezer)
 *   handoff — no public player, so Verse opens the track in the service itself
 */

export type ServiceId =
  | "spotify"
  | "ytmusic"
  | "soundcloud"
  | "deezer"
  | "amazon"
  | "tidal"
  | "apple"
  | "bandcamp";

export type ServicePlayback = "remote" | "embed" | "preview" | "handoff";

export type MusicService = {
  id: ServiceId;
  name: string;
  /** Monogram drawn on the tile — no remote logo requests, no broken images. */
  mark: string;
  color: string;
  playback: ServicePlayback;
  capability: string;
  note: string;
  home: string;
  search: (query: string) => string;
};

const q = encodeURIComponent;

export const SERVICES: MusicService[] = [
  {
    id: "spotify",
    name: "Spotify",
    mark: "SP",
    color: "#1db954",
    playback: "remote",
    capability: "Remote control · queue on any device",
    note: "Connect once in the Spotify tab; pasted Spotify links play on whichever device is active.",
    home: "https://open.spotify.com",
    search: (query) => `https://open.spotify.com/search/${q(query)}`,
  },
  {
    id: "ytmusic",
    name: "YouTube Music",
    mark: "YT",
    color: "#ff0033",
    playback: "embed",
    capability: "Plays inside Verse · official embed",
    note: "Search opens YouTube Music. A pasted video or playlist link plays in Verse through the official embed.",
    home: "https://music.youtube.com",
    search: (query) => `https://music.youtube.com/search?q=${q(query)}`,
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    mark: "SC",
    color: "#ff5500",
    playback: "embed",
    capability: "Plays inside Verse · widget player",
    note: "Paste any track, set or profile link and SoundCloud's own widget takes over inside Verse.",
    home: "https://soundcloud.com",
    search: (query) => `https://soundcloud.com/search?q=${q(query)}`,
  },
  {
    id: "deezer",
    name: "Deezer",
    mark: "DZ",
    color: "#a238ff",
    playback: "preview",
    capability: "Live search · 30-second previews",
    note: "Deezer's public catalogue is searchable here. Previews stream in Verse; full playback needs Deezer's own app.",
    home: "https://www.deezer.com",
    search: (query) => `https://www.deezer.com/search/${q(query)}`,
  },
  {
    id: "amazon",
    name: "Amazon Music",
    mark: "AM",
    color: "#25d1da",
    playback: "handoff",
    capability: "Hands the track to Amazon Music",
    note: "Amazon publishes no public player, so Verse opens the search or track in the desktop app or browser.",
    home: "https://music.amazon.com",
    search: (query) => `https://music.amazon.com/search/${q(query)}`,
  },
  {
    id: "tidal",
    name: "TIDAL",
    mark: "TD",
    color: "#00cfff",
    playback: "handoff",
    capability: "Hands the track to TIDAL",
    note: "Opens the TIDAL web player, which can take over playback from there.",
    home: "https://listen.tidal.com",
    search: (query) => `https://listen.tidal.com/search?q=${q(query)}`,
  },
  {
    id: "apple",
    name: "Apple Music",
    mark: "AM",
    color: "#fa2d48",
    playback: "handoff",
    capability: "Hands the track to Apple Music",
    note: "Opens Apple Music — the installed app when the system has one, the web player otherwise.",
    home: "https://music.apple.com",
    search: (query) => `https://music.apple.com/search?term=${q(query)}`,
  },
  {
    id: "bandcamp",
    name: "Bandcamp",
    mark: "BC",
    color: "#1da0c3",
    playback: "handoff",
    capability: "Hands the track to Bandcamp",
    note: "Opens the release page, where the artist's own player and purchase options live.",
    home: "https://bandcamp.com",
    search: (query) => `https://bandcamp.com/search?q=${q(query)}`,
  },
];

export const serviceById = (id: ServiceId): MusicService =>
  SERVICES.find((service) => service.id === id) ?? SERVICES[0];

/** Opens a link in the system browser / installed app, with a plain-browser fallback. */
export async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type LinkResource = "track" | "album" | "playlist" | "artist" | "video" | "unknown";

export type LinkTarget = {
  service: ServiceId;
  resource: LinkResource;
  /** Deezer id, YouTube video id, and so on — whatever the service keys on. */
  id: string;
  /** Set when Verse can play it itself. */
  embedUrl?: string;
  embedKind?: "video" | "audio";
  /** Spotify URI, ready for the remote control. */
  uri?: string;
  webUrl: string;
};

const YOUTUBE_HOSTS = new Set(["youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be"]);

const bare = (host: string) => host.replace(/^(www|m|listen)\./, "");

/**
 * Reads any service's share link into something Verse can act on.
 * Accepts full URLs, scheme-less URLs and `spotify:track:…` URIs.
 */
export function parseMusicLink(raw: string): LinkTarget | null {
  const input = raw.trim();
  if (!input) return null;

  if (input.startsWith("spotify:")) {
    const [, resource = "", id = ""] = input.split(":");
    if (!id) return null;
    return {
      service: "spotify",
      resource: (resource || "unknown") as LinkResource,
      id,
      uri: input,
      webUrl: `https://open.spotify.com/${resource}/${id}`,
    };
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = bare(url.hostname.toLowerCase());
  const path = url.pathname.replace(/\/+$/, "");

  if (YOUTUBE_HOSTS.has(host)) {
    if (host === "youtu.be") {
      const id = path.slice(1);
      return id
        ? {
            service: "ytmusic",
            resource: "video",
            id,
            embedUrl: `https://www.youtube-nocookie.com/embed/${q(id)}?autoplay=1&rel=0`,
            embedKind: "video",
            webUrl: `https://music.youtube.com/watch?v=${q(id)}`,
          }
        : null;
    }
    const video = url.searchParams.get("v");
    const playlist = url.searchParams.get("list");
    if (video) {
      return {
        service: "ytmusic",
        resource: "video",
        id: video,
        embedUrl: `https://www.youtube-nocookie.com/embed/${q(video)}?autoplay=1&rel=0`,
        embedKind: "video",
        webUrl: `https://music.youtube.com/watch?v=${q(video)}${playlist ? `&list=${q(playlist)}` : ""}`,
      };
    }
    if (playlist) {
      return {
        service: "ytmusic",
        resource: "playlist",
        id: playlist,
        embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${q(playlist)}&autoplay=1`,
        embedKind: "video",
        webUrl: `https://music.youtube.com/playlist?list=${q(playlist)}`,
      };
    }
    return null;
  }

  if (host === "soundcloud.com" || host === "on.soundcloud.com") {
    const canonical = `https://soundcloud.com${url.pathname}`;
    return {
      service: "soundcloud",
      resource: path.split("/").filter(Boolean).length >= 2 ? "track" : "unknown",
      id: path,
      embedUrl: `https://w.soundcloud.com/player/?url=${q(canonical)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`,
      embedKind: "audio",
      webUrl: canonical,
    };
  }

  if (host === "deezer.com" || host === "link.deezer.com") {
    const match = path.match(/\/(?:[a-z]{2}\/)?(track|album|playlist|artist)\/(\d+)/i);
    if (!match) return { service: "deezer", resource: "unknown", id: "", webUrl: url.toString() };
    const resource = match[1].toLowerCase() as LinkResource;
    return {
      service: "deezer",
      resource,
      id: match[2],
      webUrl: url.toString(),
    };
  }

  if (host === "open.spotify.com") {
    const match = path.match(/\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (!match) return null;
    const resource = match[1].toLowerCase() as LinkResource;
    return {
      service: "spotify",
      resource,
      id: match[2],
      uri: `spotify:${resource}:${match[2]}`,
      webUrl: `https://open.spotify.com/${resource}/${match[2]}`,
    };
  }

  if (host.endsWith("music.amazon.com") || host === "music.amazon.com") {
    return { service: "amazon", resource: "unknown", id: path, webUrl: url.toString() };
  }
  if (host === "tidal.com") {
    return { service: "tidal", resource: "unknown", id: path, webUrl: url.toString() };
  }
  if (host === "music.apple.com") {
    return { service: "apple", resource: "unknown", id: path, webUrl: url.toString() };
  }
  if (host === "bandcamp.com" || host.endsWith(".bandcamp.com")) {
    return { service: "bandcamp", resource: "unknown", id: path, webUrl: url.toString() };
  }

  return null;
}

export type DeezerTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  durationMs: number;
  /** Public 30-second MP3; null when Deezer exposes no preview. */
  preview: string | null;
  url: string;
};

type RawTrack = {
  id?: number | string;
  title?: string;
  duration?: number;
  preview?: string;
  link?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_medium?: string; cover?: string };
};

type RawEnvelope = RawTrack & {
  data?: RawTrack[];
  tracks?: { data?: RawTrack[] };
  error?: { message?: string; type?: string };
};

const mapTrack = (raw: RawTrack): DeezerTrack => ({
  id: String(raw.id ?? ""),
  title: raw.title ?? "Untitled",
  artist: raw.artist?.name ?? "",
  album: raw.album?.title ?? "",
  cover: raw.album?.cover_medium ?? raw.album?.cover ?? null,
  durationMs: (raw.duration ?? 0) * 1000,
  preview: raw.preview ?? null,
  url: raw.link ?? "",
});

let jsonpSeq = 0;

/**
 * Deezer's API sends no CORS headers, so the webview cannot `fetch` it directly.
 * JSONP is the documented way around that, and it needs no key or backend.
 */
function jsonp<T>(endpoint: string, timeoutMs = 9000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const name = `__verseJsonp${jsonpSeq++}`;
    const script = document.createElement("script");
    const scope = window as unknown as Record<string, unknown>;
    let settled = false;
    let timer = 0;

    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.remove();
      delete scope[name];
      run();
    };

    timer = window.setTimeout(
      () => finish(() => reject(new Error("Deezer did not answer — check the connection."))),
      timeoutMs,
    );
    scope[name] = (payload: T) => finish(() => resolve(payload));

    script.async = true;
    script.onerror = () => finish(() => reject(new Error("Deezer is unreachable.")));
    script.src = `${endpoint}${endpoint.includes("?") ? "&" : "?"}output=jsonp&callback=${name}`;
    document.head.appendChild(script);
  });
}

export async function deezerSearch(query: string, limit = 24): Promise<DeezerTrack[]> {
  const payload = await jsonp<RawEnvelope>(
    `https://api.deezer.com/search?q=${q(query)}&limit=${limit}`,
  );
  if (payload.error?.message) throw new Error(payload.error.message);
  return (payload.data ?? []).map(mapTrack);
}

/** Resolves a Deezer track, album or playlist link into playable previews. */
export async function deezerResolve(
  resource: LinkResource,
  id: string,
): Promise<DeezerTrack[]> {
  const kind = resource === "artist" ? "artist" : resource === "playlist" ? "playlist" : resource === "album" ? "album" : "track";
  const payload = await jsonp<RawEnvelope>(`https://api.deezer.com/${kind}/${q(id)}`);
  if (payload.error?.message) throw new Error(payload.error.message);
  const rows = kind === "track" ? [payload as RawTrack] : (payload.tracks?.data ?? []);
  return rows.map(mapTrack);
}
