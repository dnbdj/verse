import type { Prefs } from "./prefs";

export type ThemeId = "aurora" | "velvet" | "graphite" | "mist";
export type AccentId = "blue" | "violet" | "pink" | "orange" | "green" | "graphite" | "custom";
export type GlassLevel = "clear" | "frosted" | "solid";
export type Density = "cozy" | "compact";
export type SidebarMode = "full" | "hidden";

/** A three-stop linear gradient painted behind the glass. */
export type Gradient = {
  from: string;
  via: string | null;
  to: string;
  angle: number;
};

/** The part of the preferences that paints the window. */
export type Appearance = {
  theme: ThemeId;
  accent: AccentId;
  glass: GlassLevel;
  gradient: Gradient | null;
  /** Set when the accent is a hand-picked colour rather than a preset. */
  accentHex: string | null;
  blur: number;
  glow: number;
  motion: boolean;
  density: Density;
  artTint: boolean;
  /** How strongly sampled cover colour glows on the sidebar and player bar (0–100). */
  artGlow: number;
  sidebar: SidebarMode;
  focus: boolean;
};

/** A look the user kept, so their own palettes sit next to the built-in presets. */
export type SavedLook = {
  id: string;
  name: string;
  appearance: Appearance;
};

export const BLUR_RANGE = { min: 8, max: 72 } as const;
export const GLOW_RANGE = { min: 30, max: 100 } as const;
export const ART_GLOW_RANGE = { min: 0, max: 100 } as const;

/** The percentage opacity a glow intensity paints; the guard sees the same colour. */
export function artGlowPercent(intensity: number): number {
  if (!Number.isFinite(intensity)) return 44;
  return Math.round(Math.min(ART_GLOW_RANGE.max, Math.max(ART_GLOW_RANGE.min, intensity)) * 0.8);
}

export type ThemeMeta = {
  id: ThemeId;
  name: string;
  note: string;
  scheme: "dark" | "light";
  /** Gradient shown on the theme card, so the palette is recognisable before applying it. */
  preview: string;
};

export const THEMES: ThemeMeta[] = [
  {
    id: "aurora",
    name: "Aurora",
    note: "Blue and violet glass over deep space",
    scheme: "dark",
    preview:
      "linear-gradient(145deg, #0a84ff 0%, #5e5ce6 42%, #bf5af2 68%, #ff375f 100%)",
  },
  {
    id: "velvet",
    name: "Velvet",
    note: "Plum, rose and a whisper of honey",
    scheme: "dark",
    preview:
      "linear-gradient(145deg, #bf5af2 0%, #ff2d78 46%, #ff9f0a 82%, #6e5cff 100%)",
  },
  {
    id: "graphite",
    name: "Graphite",
    note: "Neutral studio grey, colour left to the artwork",
    scheme: "dark",
    preview:
      "linear-gradient(145deg, #5b5b63 0%, #2c2c31 45%, #8e8e93 78%, #1b1b1f 100%)",
  },
  {
    id: "mist",
    name: "Mist",
    note: "Daylight glass for bright rooms",
    scheme: "light",
    preview:
      "linear-gradient(145deg, #f7f8fc 0%, #dfe7f6 40%, #efdff0 72%, #fdf1e3 100%)",
  },
];

export const ACCENTS: { id: Exclude<AccentId, "custom">; name: string; color: string }[] = [
  { id: "blue", name: "Blue", color: "#0a84ff" },
  { id: "violet", name: "Violet", color: "#bf5af2" },
  { id: "pink", name: "Pink", color: "#ff375f" },
  { id: "orange", name: "Orange", color: "#ff9f0a" },
  { id: "green", name: "Green", color: "#30d158" },
  { id: "graphite", name: "Graphite", color: "#8e8e93" },
];

export const GLASS_LEVELS: { id: GlassLevel; name: string; note: string }[] = [
  { id: "clear", name: "Clear", note: "Most of the desktop shows through" },
  { id: "frosted", name: "Frosted", note: "Balanced blur and colour" },
  { id: "solid", name: "Solid", note: "Nearly opaque, easiest to read" },
];

export const GRADIENT_PRESETS: {
  id: string;
  name: string;
  gradient: Gradient;
  accent: Exclude<AccentId, "custom">;
}[] = [
  {
    id: "dusk",
    name: "Dusk",
    gradient: { from: "#24104a", via: "#4b3dff", to: "#0a84ff", angle: 155 },
    accent: "blue",
  },
  {
    id: "sunset",
    name: "Sunset",
    gradient: { from: "#3b0d2a", via: "#ff375f", to: "#ff9f0a", angle: 125 },
    accent: "pink",
  },
  {
    id: "nebula",
    name: "Nebula",
    gradient: { from: "#120a2e", via: "#bf5af2", to: "#ff2d78", angle: 210 },
    accent: "violet",
  },
  {
    id: "mint",
    name: "Mint",
    gradient: { from: "#062b22", via: "#30d158", to: "#0a84ff", angle: 145 },
    accent: "green",
  },
  {
    id: "ember",
    name: "Ember",
    gradient: { from: "#2a1004", via: "#ff9f0a", to: "#ff375f", angle: 300 },
    accent: "orange",
  },
  {
    id: "ocean",
    name: "Ocean",
    gradient: { from: "#04202e", via: "#00cfff", to: "#0a84ff", angle: 190 },
    accent: "blue",
  },
  {
    id: "graphite",
    name: "Graphite",
    gradient: { from: "#0b0b0d", via: "#2c2c31", to: "#4a4a52", angle: 170 },
    accent: "graphite",
  },
  {
    id: "rose",
    name: "Rosewater",
    gradient: { from: "#2b0d18", via: "#ff5fa2", to: "#7a5cff", angle: 110 },
    accent: "pink",
  },
];

const HUES = [
  "#24104a",
  "#0a84ff",
  "#ff375f",
  "#ff9f0a",
  "#30d158",
  "#00cfff",
  "#bf5af2",
  "#ff5fa2",
  "#5e5ce6",
  "#2b0d18",
  "#062b22",
  "#04202e",
];

export const gradientCss = (gradient: Gradient): string =>
  `linear-gradient(${Math.round(gradient.angle)}deg, ${gradient.from} 0%, ${
    gradient.via ? `${gradient.via} 50%, ` : ""
  }${gradient.to} 100%)`;

/** A pleasant-enough random three-stop gradient, for the surprise button. */
export function randomGradient(): Gradient {
  const pick = () => HUES[Math.floor(Math.random() * HUES.length)];
  return {
    from: pick(),
    via: Math.random() > 0.35 ? pick() : null,
    to: pick(),
    angle: Math.round(Math.random() * 24) * 15,
  };
}

export const sameGradient = (a: Gradient, b: Gradient): boolean =>
  a.from === b.from && a.via === b.via && a.to === b.to && a.angle === b.angle;

export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Picks readable label ink for a custom accent button. */
export function readableInk(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#101013" : "#ffffff";
}

const linearChannel = (value: number): number => {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(linearChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const channelHex = (value: number): string =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");

const mixHex = (from: string, to: string, amount: number): string => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  if (!a || !b) return from;
  return `#${channelHex(a[0] + (b[0] - a[0]) * amount)}${channelHex(
    a[1] + (b[1] - a[1]) * amount,
  )}${channelHex(a[2] + (b[2] - a[2]) * amount)}`;
};

/**
 * Keeps a sampled colour usable as an accent. On dark themes it is lifted until it
 * reads against near-black glass; on light themes it is deepened until it reads on
 * white. Mid-tone accents also keep white/dark button labels legible via readableInk.
 */
export function guardAccent(hex: string, scheme: "dark" | "light"): string {
  if (!hexToRgb(hex)) return scheme === "dark" ? "#0a84ff" : "#0a6dff";

  const minimum = scheme === "dark" ? 0.24 : 0.04;
  const maximum = scheme === "dark" ? 0.6 : 0.34;
  let value = hex.toLowerCase();
  let luminance = relativeLuminance(value);

  for (let step = 0; step < 14 && luminance < minimum; step += 1) {
    value = mixHex(value, "#ffffff", 0.14);
    luminance = relativeLuminance(value);
  }
  for (let step = 0; step < 28 && luminance > maximum; step += 1) {
    value = mixHex(value, "#000000", 0.14);
    luminance = relativeLuminance(value);
  }
  return value;
}

/** The colours painted for an accent. Kept pure so the guard and glow are testable. */
export type AccentTokens = {
  accent: string;
  soft: string;
  ink: string;
  /** A translucent copy of the accent while cover art is tinting; transparent otherwise. */
  glow: string;
};

/**
 * Resolves the painted accent: a sampled cover colour (guarded for the theme) wins
 * while artwork tinting is on, otherwise the user's own choice is used untouched.
 */
export function accentTokens(
  appearance: Appearance,
  artAccent: string | null,
): AccentTokens | null {
  const base = artAccent
    ? guardAccent(artAccent, themeMeta(appearance.theme).scheme)
    : appearance.accentHex;
  if (!base) return null;
  return {
    accent: base,
    soft: `color-mix(in srgb, ${base} 26%, transparent)`,
    ink: readableInk(base),
    glow: artAccent
      ? `color-mix(in srgb, ${base} ${artGlowPercent(appearance.artGlow)}%, transparent)`
      : "transparent",
  };
}

export const appearanceOf = (prefs: Prefs): Appearance => ({
  theme: prefs.theme,
  accent: prefs.accent,
  glass: prefs.glass,
  gradient: prefs.gradient,
  accentHex: prefs.accentHex,
  blur: prefs.blur,
  glow: prefs.glow,
  motion: prefs.motion,
  density: prefs.density,
  artTint: prefs.artTint,
  artGlow: prefs.artGlow,
  sidebar: prefs.sidebar,
  focus: prefs.focus,
});

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/**
 * Paints the window by swapping the token sets picked in Settings. Called before the
 * first render and again on every change, so there is never a half-themed frame.
 */
export function applyAppearance(appearance: Appearance, artAccent: string | null = null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const tokens = accentTokens(appearance, artAccent);

  root.dataset.theme = appearance.theme;
  root.dataset.accent = appearance.accent;
  root.dataset.glass = appearance.glass;
  root.dataset.motion = appearance.motion ? "on" : "off";
  root.dataset.density = appearance.density;
  root.dataset.wall = appearance.gradient ? "gradient" : "blobs";
  root.dataset.sidebar = appearance.sidebar;
  root.dataset.focus = appearance.focus ? "on" : "off";
  root.style.colorScheme = themeMeta(appearance.theme).scheme;

  root.style.setProperty("--glass-blur", `${appearance.blur}px`);
  root.style.setProperty("--blob-opacity", String(appearance.glow / 100));
  root.style.setProperty(
    "--wall-gradient",
    appearance.gradient ? gradientCss(appearance.gradient) : "transparent",
  );

  if (tokens) {
    root.style.setProperty("--accent", tokens.accent);
    root.style.setProperty("--accent-soft", tokens.soft);
    root.style.setProperty("--accent-ink", tokens.ink);
    root.style.setProperty("--art-glow", tokens.glow);
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-soft");
    root.style.removeProperty("--accent-ink");
    root.style.removeProperty("--art-glow");
  }
}
