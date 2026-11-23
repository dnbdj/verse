import type { RepeatMode } from "../hooks/usePlayer";
import { SERVICES, type ServiceId } from "./services";
import type { PlaylistFolder } from "./types";
import {
  ACCENTS,
  BLUR_RANGE,
  GLASS_LEVELS,
  GLOW_RANGE,
  THEMES,
  type AccentId,
  type Appearance,
  type Density,
  type GlassLevel,
  type Gradient,
  type SavedLook,
  type SidebarMode,
  type ThemeId,
} from "./theme";

export type Prefs = {
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  theme: ThemeId;
  accent: AccentId;
  glass: GlassLevel;
  gradient: Gradient | null;
  accentHex: string | null;
  blur: number;
  glow: number;
  motion: boolean;
  density: Density;
  artTint: boolean;
  /** Intensity of the cover-colour glow on the chrome, 0–100. */
  artGlow: number;
  sidebar: SidebarMode;
  focus: boolean;
  /** Pinned services, in the order they were pinned. */
  pinned: ServiceId[];
  /** Last used services, newest first. */
  recent: ServiceId[];
  savedLooks: SavedLook[];
  /** Local playlist groups shown in the sidebar's Folders section. */
  playlistFolders: PlaylistFolder[];
};

/** The slice of Storage the preference code needs, so tests can use a stub. */
export type PrefStore = Pick<Storage, "getItem" | "setItem">;

const KEY = "verse.prefs";

export const DEFAULT_PREFS: Prefs = {
  volume: 0.85,
  shuffle: false,
  repeat: "off",
  theme: "aurora",
  accent: "auto",
  glass: "frosted",
  gradient: null,
  accentHex: null,
  blur: 42,
  glow: 85,
  motion: true,
  density: "cozy",
  artTint: true,
  artGlow: 55,
  sidebar: "full",
  focus: false,
  pinned: [],
  recent: [],
  savedLooks: [],
  playlistFolders: [],
};

const isRepeat = (value: unknown): value is RepeatMode =>
  value === "off" || value === "all" || value === "one";

const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

const THEME_IDS = THEMES.map((theme) => theme.id);
const ACCENT_IDS: AccentId[] = ["auto", ...ACCENTS.map((accent) => accent.id), "custom"];
const GLASS_IDS = GLASS_LEVELS.map((level) => level.id);
const SERVICE_IDS = SERVICES.map((service) => service.id);

const HEX = /^#[0-9a-f]{6}$/i;

const cleanHex = (value: unknown): string | null =>
  typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : null;

function cleanGradient(value: unknown): Gradient | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Gradient>;
  const from = cleanHex(raw.from);
  const to = cleanHex(raw.to);
  if (!from || !to) return null;
  return {
    from,
    via: cleanHex(raw.via),
    to,
    angle: Math.round(clamp(raw.angle, 0, 360, 160)),
  };
}

function cleanServices(value: unknown): ServiceId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ServiceId>();
  for (const entry of value) {
    const id = SERVICE_IDS.find((candidate) => candidate === entry);
    if (id) seen.add(id);
  }
  return [...seen];
}

/** Validates a stored/saved appearance; anything malformed is dropped, not half-applied. */
export function validateAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Appearance>;
  const accent = pick(ACCENT_IDS, raw.accent, DEFAULT_PREFS.accent);
  const accentHex = cleanHex(raw.accentHex);
  if (accent === "custom" && !accentHex) return null;
  return {
    theme: pick(THEME_IDS, raw.theme, DEFAULT_PREFS.theme),
    accent,
    glass: pick(GLASS_IDS, raw.glass, DEFAULT_PREFS.glass),
    gradient: cleanGradient(raw.gradient),
    accentHex,
    blur: Math.round(clamp(raw.blur, BLUR_RANGE.min, BLUR_RANGE.max, DEFAULT_PREFS.blur)),
    glow: Math.round(clamp(raw.glow, GLOW_RANGE.min, GLOW_RANGE.max, DEFAULT_PREFS.glow)),
    motion: raw.motion !== false,
    density: raw.density === "compact" ? "compact" : "cozy",
    artTint: raw.artTint !== false,
    artGlow: Math.round(clamp(raw.artGlow, 0, 100, DEFAULT_PREFS.artGlow)),
    sidebar: raw.sidebar === "hidden" ? "hidden" : "full",
    focus: raw.focus === true,
  };
}

export function validateLooks(value: unknown): SavedLook[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const looks: SavedLook[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<SavedLook>;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    const name = raw.name.trim().slice(0, 40);
    const appearance = validateAppearance(raw.appearance);
    if (!name || !appearance || seen.has(raw.id)) continue;
    seen.add(raw.id);
    looks.push({ id: raw.id.slice(0, 60), name, appearance });
  }
  return looks.slice(0, 24);
}

/**
 * Reads playlist folders defensively: names are trimmed, ids are unique, and a
 * playlist can live in at most one folder. Unknown entries are dropped.
 */
export function validatePlaylistFolders(value: unknown): PlaylistFolder[] {
  if (!Array.isArray(value)) return [];
  const seenFolders = new Set<string>();
  const seenPlaylists = new Set<string>();
  const folders: PlaylistFolder[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<PlaylistFolder>;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    const id = raw.id.trim().slice(0, 80);
    const name = raw.name.trim().slice(0, 40);
    if (!id || !name || seenFolders.has(id)) continue;
    seenFolders.add(id);
    const playlistIds: string[] = [];
    if (Array.isArray(raw.playlistIds)) {
      for (const candidate of raw.playlistIds) {
        if (typeof candidate !== "string") continue;
        const playlistId = candidate.trim();
        if (!playlistId || seenPlaylists.has(playlistId)) continue;
        seenPlaylists.add(playlistId);
        playlistIds.push(playlistId);
      }
    }
    folders.push({ id, name, playlistIds });
  }
  return folders.slice(0, 30);
}

/** Player, appearance and layout settings survive a restart; unreadable data falls back. */
export function loadPrefs(store: PrefStore = localStorage): Prefs {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;

    const accent = pick(ACCENT_IDS, parsed.accent, DEFAULT_PREFS.accent);
    const accentHex = cleanHex(parsed.accentHex);

    return {
      volume: clamp(parsed.volume, 0, 1, DEFAULT_PREFS.volume),
      shuffle: parsed.shuffle === true,
      repeat: isRepeat(parsed.repeat) ? parsed.repeat : DEFAULT_PREFS.repeat,
      theme: pick(THEME_IDS, parsed.theme, DEFAULT_PREFS.theme),
      accent: accent === "custom" && !accentHex ? DEFAULT_PREFS.accent : accent,
      glass: pick(GLASS_IDS, parsed.glass, DEFAULT_PREFS.glass),
      gradient: cleanGradient(parsed.gradient),
      accentHex,
      blur: Math.round(clamp(parsed.blur, BLUR_RANGE.min, BLUR_RANGE.max, DEFAULT_PREFS.blur)),
      glow: Math.round(clamp(parsed.glow, GLOW_RANGE.min, GLOW_RANGE.max, DEFAULT_PREFS.glow)),
      motion: parsed.motion !== false,
      density: parsed.density === "compact" ? "compact" : "cozy",
      artTint: parsed.artTint !== false,
      artGlow: Math.round(clamp(parsed.artGlow, 0, 100, DEFAULT_PREFS.artGlow)),
      sidebar: parsed.sidebar === "hidden" ? "hidden" : "full",
      focus: parsed.focus === true,
      pinned: Object.prototype.hasOwnProperty.call(parsed, "pinned")
        ? cleanServices(parsed.pinned)
        : DEFAULT_PREFS.pinned,
      recent: cleanServices(parsed.recent),
      savedLooks: validateLooks(parsed.savedLooks),
      playlistFolders: Object.prototype.hasOwnProperty.call(parsed, "playlistFolders")
        ? validatePlaylistFolders(parsed.playlistFolders)
        : DEFAULT_PREFS.playlistFolders,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Writes only the keys handed in. Player and Settings each own a slice of the same
 * record, so a full overwrite from one would erase the other's choices.
 */
export function savePrefs(patch: Partial<Prefs>, store: PrefStore = localStorage): void {
  try {
    store.setItem(KEY, JSON.stringify({ ...loadPrefs(store), ...patch }));
  } catch {
    // Storage can be unavailable or full; losing the setting is not worth an error.
  }
}

export function saveLook(prefs: SavedLook[], look: { name: string; appearance: Appearance }): SavedLook[] {
  const name = look.name.trim().slice(0, 40) || "Untitled look";
  const entry: SavedLook = {
    id: `look-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    appearance: { ...look.appearance },
  };
  return [entry, ...prefs].slice(0, 24);
}
