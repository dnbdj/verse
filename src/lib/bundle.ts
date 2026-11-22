import { SERVICES, type ServiceId } from "./services";
import { validateAppearance, validateLooks } from "./prefs";
import type { Appearance, SavedLook } from "./theme";
import type { Playlist, Track } from "./types";

/**
 * A single JSON file that carries the settings a person would miss on a new machine:
 * saved looks, pinned services in order, appearance preferences and their playlists
 * (names plus ordered track references). The music files themselves are not included.
 *
 * v2 adds playlists and an integrity checksum. v1 files still import; their playlist
 * field is simply treated as absent rather than an error.
 */
export const BUNDLE_KIND = "verse.bundle";
export const BUNDLE_VERSION = 2;
export const LEGACY_VERSION = 1;

export type BundleTrack = { id: string; title: string; artist: string };

export type BundlePlaylist = { name: string; tracks: BundleTrack[] };

export type VerseBundle = {
  kind: typeof BUNDLE_KIND;
  version: number;
  exportedAt: string;
  prefs: Appearance;
  pinned: ServiceId[];
  looks: SavedLook[];
  playlists: BundlePlaylist[];
  /** FNV-1a of the canonical payload; present from v2 on. */
  checksum?: string;
};

export type BundleSource = {
  looks: SavedLook[];
  pinned: ServiceId[];
  prefs: Appearance;
  playlists: BundlePlaylist[];
};

export type BundleResult =
  | { ok: true; bundle: VerseBundle; legacy: boolean }
  | { ok: false; error: string };

export type ImportMode = "replace" | "merge";

export type PlaylistPlan = {
  /** Playlists that replace mode removes before writing the bundle's own. */
  deleteIds: string[];
  create: { name: string; trackIds: string[] }[];
  append: { playlistId: string; trackIds: string[] }[];
};

const SERVICE_IDS = SERVICES.map((service) => service.id);
const MAX_PLAYLISTS = 100;
const MAX_TRACKS_PER_PLAYLIST = 500;

function cleanServices(value: unknown): ServiceId[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<ServiceId>();
  for (const entry of value) {
    const id = SERVICE_IDS.find((candidate) => candidate === entry);
    if (id) seen.add(id);
  }
  return [...seen];
}

/** Key-order-independent JSON, so a checksum survives re-saving the file prettier. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a, 64-bit, as 16 hex characters. Integrity, not cryptography. */
export function checksumOf(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function payloadOf(bundle: Omit<VerseBundle, "checksum">) {
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: bundle.exportedAt,
    prefs: bundle.prefs,
    pinned: bundle.pinned,
    looks: bundle.looks,
    playlists: bundle.playlists,
  };
}

export function bundleChecksum(bundle: Omit<VerseBundle, "checksum">): string {
  return checksumOf(stableStringify(payloadOf(bundle)));
}

export function buildBundle(source: BundleSource, now: Date = new Date()): VerseBundle {
  const base = {
    kind: BUNDLE_KIND as typeof BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: now.toISOString(),
    prefs: { ...source.prefs },
    pinned: [...source.pinned],
    looks: source.looks.map((look) => ({ ...look, appearance: { ...look.appearance } })),
    playlists: source.playlists.map((playlist) => ({
      name: playlist.name,
      tracks: playlist.tracks.map((track) => ({ ...track })),
    })),
  };
  return { ...base, checksum: bundleChecksum(base) };
}

export function serializeBundle(source: BundleSource, now: Date = new Date()): string {
  return `${JSON.stringify(buildBundle(source, now), null, 2)}\n`;
}

export function bundleFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `verse-${stamp}.json`;
}

function cleanPlaylists(value: unknown): BundlePlaylist[] | null {
  if (!Array.isArray(value) || value.length > MAX_PLAYLISTS) return null;
  const names = new Set<string>();
  const playlists: BundlePlaylist[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const raw = entry as Partial<BundlePlaylist>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
    if (!name) return null;
    const key = name.toLowerCase();
    if (names.has(key)) return null;
    names.add(key);

    if (!Array.isArray(raw.tracks) || raw.tracks.length > MAX_TRACKS_PER_PLAYLIST) return null;
    const tracks: BundleTrack[] = [];
    for (const track of raw.tracks) {
      if (!track || typeof track !== "object") return null;
      const ref = track as Partial<BundleTrack>;
      const id = typeof ref.id === "string" ? ref.id.trim().slice(0, 128) : "";
      if (!id) return null;
      tracks.push({
        id,
        title: typeof ref.title === "string" ? ref.title.slice(0, 200) : "",
        artist: typeof ref.artist === "string" ? ref.artist.slice(0, 200) : "",
      });
    }
    playlists.push({ name, tracks });
  }
  return playlists;
}

/**
 * Strict on purpose: a bundle is all-or-nothing. A damaged look, a playlist with no
 * name, or a checksum that no longer matches rejects the whole file, so an import can
 * never leave half-restored settings behind.
 */
export function parseBundle(text: string): BundleResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Choose a Verse bundle file to import." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "That file is not valid JSON — pick a bundle exported by Verse." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "That JSON is not a Verse bundle." };
  }

  const raw = parsed as Partial<VerseBundle>;
  if (raw.kind !== BUNDLE_KIND) {
    return { ok: false, error: "That JSON is not a Verse bundle (no “verse.bundle” marker)." };
  }

  const version = raw.version;
  if (version !== BUNDLE_VERSION && version !== LEGACY_VERSION) {
    return {
      ok: false,
      error: `That bundle is version ${String(version)}; this build reads versions ${LEGACY_VERSION} and ${BUNDLE_VERSION}.`,
    };
  }

  const prefs = validateAppearance(raw.prefs);
  if (!prefs) {
    return { ok: false, error: "The appearance in that bundle is incomplete or damaged." };
  }

  if (!Array.isArray(raw.looks)) {
    return { ok: false, error: "The saved looks in that bundle are missing." };
  }
  const looks = validateLooks(raw.looks);
  if (looks.length !== raw.looks.length) {
    return {
      ok: false,
      error: "That bundle contains a damaged saved look — nothing was imported.",
    };
  }

  const pinned = cleanServices(raw.pinned);
  if (!pinned) {
    return { ok: false, error: "The pinned services in that bundle are not a list." };
  }

  const exportedAt = typeof raw.exportedAt === "string" ? raw.exportedAt : "";

  // v1 has no playlists and no checksum: importing it must keep working unchanged.
  if (version === LEGACY_VERSION) {
    return {
      ok: true,
      legacy: true,
      bundle: {
        kind: BUNDLE_KIND,
        version: LEGACY_VERSION,
        exportedAt,
        prefs,
        pinned,
        looks,
        playlists: [],
      },
    };
  }

  const playlists = cleanPlaylists(raw.playlists);
  if (!playlists) {
    return {
      ok: false,
      error:
        "The playlists in that bundle are missing or damaged (each needs a name and track ids).",
    };
  }

  const normalized = {
    kind: BUNDLE_KIND as typeof BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt,
    prefs,
    pinned,
    looks,
    playlists,
  };

  if (typeof raw.checksum !== "string" || !raw.checksum.trim()) {
    return { ok: false, error: "That bundle has no checksum, so it cannot be verified." };
  }
  if (raw.checksum.trim().toLowerCase() !== bundleChecksum(normalized)) {
    return {
      ok: false,
      error:
        "That bundle is damaged — its checksum does not match its contents. Nothing was imported.",
    };
  }

  return {
    ok: true,
    legacy: false,
    bundle: { ...normalized, checksum: raw.checksum.trim().toLowerCase() },
  };
}

/** Matches a bundle's track references to the local library, by id first, then tags. */
export function resolveTrackIds(refs: BundleTrack[], tracks: Track[]): string[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const byTags = new Map<string, string>();
  for (const track of tracks) {
    const key = `${track.title.trim().toLowerCase()}|${(track.artist || "").trim().toLowerCase()}`;
    if (key !== "|" && !byTags.has(key)) byTags.set(key, track.id);
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const ref of refs) {
    const match =
      byId.get(ref.id) ??
      (ref.title
        ? tracks.find(
            (track) =>
              track.title.trim().toLowerCase() === ref.title.trim().toLowerCase() &&
              (track.artist || "").trim().toLowerCase() === ref.artist.trim().toLowerCase(),
          )
        : undefined);
    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);
    ids.push(match.id);
  }
  return ids;
}

/**
 * Decides what an import does to the existing playlists.
 *
 * replace: every current playlist goes and the file's playlists are recreated in order.
 * merge: playlists are matched by name (case-insensitive); missing tracks are appended in
 * the file's order, new playlists are created, and playlists the file does not mention
 * are left alone.
 */
export function planPlaylists(
  current: Playlist[],
  incoming: BundlePlaylist[],
  tracks: Track[],
  mode: ImportMode,
): PlaylistPlan {
  if (mode === "replace") {
    return {
      deleteIds: current.map((playlist) => playlist.id),
      create: incoming.map((playlist) => ({
        name: playlist.name,
        trackIds: resolveTrackIds(playlist.tracks, tracks),
      })),
      append: [],
    };
  }

  const byName = new Map(current.map((playlist) => [playlist.name.trim().toLowerCase(), playlist]));
  const create: PlaylistPlan["create"] = [];
  const append: PlaylistPlan["append"] = [];

  for (const playlist of incoming) {
    const resolved = resolveTrackIds(playlist.tracks, tracks);
    const existing = byName.get(playlist.name.trim().toLowerCase());
    if (!existing) {
      create.push({ name: playlist.name, trackIds: resolved });
      continue;
    }
    const known = new Set(existing.trackIds);
    const missing = resolved.filter((id) => !known.has(id));
    if (missing.length > 0) append.push({ playlistId: existing.id, trackIds: missing });
  }

  return { deleteIds: [], create, append };
}

/** Merge keeps the current looks (and their order) and adds files' looks with new ids. */
export function mergeLooks(current: SavedLook[], incoming: SavedLook[]): SavedLook[] {
  const seen = new Set(current.map((look) => look.id));
  const added = incoming.filter((look) => !seen.has(look.id));
  return [...current, ...added].slice(0, 24);
}

/** Merge keeps the current pin order and appends services it does not already have. */
export function mergePins(current: ServiceId[], incoming: ServiceId[]): ServiceId[] {
  return [...current, ...incoming.filter((id) => !current.includes(id))];
}
