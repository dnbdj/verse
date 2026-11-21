import type { RepeatMode } from "../hooks/usePlayer";

export type Prefs = {
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
};

const KEY = "verse.prefs";

const DEFAULTS: Prefs = { volume: 0.85, shuffle: false, repeat: "off" };

const isRepeat = (value: unknown): value is RepeatMode =>
  value === "off" || value === "all" || value === "one";

/** Player settings survive a restart; anything unreadable falls back to the defaults. */
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const volume =
      typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
        ? Math.min(1, Math.max(0, parsed.volume))
        : DEFAULTS.volume;
    return {
      volume,
      shuffle: parsed.shuffle === true,
      repeat: isRepeat(parsed.repeat) ? parsed.repeat : DEFAULTS.repeat,
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable or full; losing the setting is not worth an error.
  }
}
