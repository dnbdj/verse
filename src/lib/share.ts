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
  type ThemeId,
} from "./theme";

export const SHARE_PREFIX = "VRS1.";
/** The hash parameter a shared look travels in: `#look=VRS1.…`. */
export const LOOK_HASH_PARAM = "look";

/** The portable half of a look — layout choices like focus mode stay local. */
export type Look = Pick<
  Appearance,
  | "theme"
  | "accent"
  | "glass"
  | "gradient"
  | "accentHex"
  | "blur"
  | "glow"
  | "motion"
  | "density"
>;

export type LookResult = { ok: true; look: Look } | { ok: false; error: string };

const HEX = /^#[0-9a-f]{6}$/i;
const ACCENT_IDS: AccentId[] = ["auto", ...ACCENTS.map((accent) => accent.id), "custom"];
const GLASS_IDS = GLASS_LEVELS.map((level) => level.id);
const DENSITIES = ["cozy", "compact"];

const toUrlSafe = (raw: string): string =>
  btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromUrlSafe = (code: string): string =>
  atob(code.replace(/-/g, "+").replace(/_/g, "/"));

/**
 * A look is twelve short fields, base64url-encoded, so one line pastes into chat
 * or a note and comes back as the exact same palette.
 */
export function encodeLook(appearance: Look): string {
  const gradient = appearance.gradient;
  const fields = [
    appearance.theme,
    appearance.accent,
    appearance.accentHex ?? "",
    appearance.glass,
    gradient?.from ?? "",
    gradient?.via ?? "",
    gradient?.to ?? "",
    String(gradient ? Math.round(gradient.angle) : 0),
    String(Math.round(appearance.blur)),
    String(Math.round(appearance.glow)),
    appearance.motion ? "1" : "0",
    appearance.density,
  ];
  return SHARE_PREFIX + toUrlSafe(fields.join("|"));
}

const fail = (error: string): LookResult => ({ ok: false, error });

export function decodeLook(code: string): LookResult {
  const trimmed = code.trim();
  if (!trimmed) return fail("Paste a Verse look code first.");
  if (!trimmed.startsWith(SHARE_PREFIX)) {
    return fail("That is not a Verse look code — they start with VRS1.");
  }

  let raw: string;
  try {
    raw = fromUrlSafe(trimmed.slice(SHARE_PREFIX.length));
  } catch {
    return fail("That code is damaged — copy it again from Verse.");
  }

  const fields = raw.split("|");
  if (fields.length !== 12) {
    return fail("That code is incomplete or from another version of Verse.");
  }

  const [theme, accent, accentHexRaw, glass, from, via, to, angleRaw, blurRaw, glowRaw, motionRaw, density] =
    fields;

  if (!THEMES.some((entry) => entry.id === theme)) return fail("That code names a theme Verse does not have.");
  if (!ACCENT_IDS.includes(accent as AccentId)) return fail("That code names an accent Verse does not have.");
  if (!GLASS_IDS.includes(glass as GlassLevel)) return fail("That code has an unknown transparency level.");
  if (!DENSITIES.includes(density as Density)) return fail("That code has an unknown layout density.");

  const accentHex = accentHexRaw.trim();
  if (accentHex && !HEX.test(accentHex)) return fail("The custom accent in that code is not a colour.");

  let gradient: Gradient | null = null;
  if (from || via || to) {
    if (!HEX.test(from) || !HEX.test(to)) {
      return fail("The gradient in that code has an invalid colour.");
    }
    if (via && !HEX.test(via)) return fail("The gradient's mid stop in that code is not a colour.");
    const angle = Number(angleRaw);
    if (!Number.isFinite(angle) || angle < 0 || angle > 360) {
      return fail("The gradient angle in that code is out of range.");
    }
    gradient = { from: from.toLowerCase(), via: via ? via.toLowerCase() : null, to: to.toLowerCase(), angle };
  }

  const blur = Number(blurRaw);
  if (!Number.isFinite(blur) || blur < BLUR_RANGE.min || blur > BLUR_RANGE.max) {
    return fail(`Blur in that code is outside ${BLUR_RANGE.min}–${BLUR_RANGE.max}px.`);
  }
  const glow = Number(glowRaw);
  if (!Number.isFinite(glow) || glow < GLOW_RANGE.min || glow > GLOW_RANGE.max) {
    return fail(`Bloom in that code is outside ${GLOW_RANGE.min}–${GLOW_RANGE.max}%.`);
  }
  if (motionRaw !== "0" && motionRaw !== "1") return fail("That code has an invalid motion setting.");

  return {
    ok: true,
    look: {
      theme: theme as ThemeId,
      accent: accent as AccentId,
      accentHex: accentHex ? accentHex.toLowerCase() : null,
      glass: glass as GlassLevel,
      gradient,
      blur: Math.round(blur),
      glow: Math.round(glow),
      motion: motionRaw === "1",
      density: density as Density,
    },
  };
}

/** Builds the shareable arrival URL for a look code. */
export function lookLink(code: string, origin: string): string {
  const url = new URL(origin);
  url.hash = `${LOOK_HASH_PARAM}=${code}`;
  return url.toString();
}

export type Arrival =
  | { kind: "none" }
  | { kind: "look"; look: Look; code: string }
  | { kind: "error"; error: string };

/**
 * Reads a look out of a URL hash. A payload that fails validation becomes an error
 * arrival, never a partial look, so the current appearance stays untouched.
 */
export function readLookFromUrl(href: string): Arrival {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "none" };
  }

  const hash = url.hash.replace(/^#/, "");
  if (!hash) return { kind: "none" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(hash);
  } catch {
    return { kind: "none" };
  }

  const code = params.get(LOOK_HASH_PARAM);
  if (!code) return { kind: "none" };

  const result = decodeLook(code);
  if (!result.ok) return { kind: "error", error: result.error };
  return { kind: "look", look: result.look, code: code.trim() };
}

/** A small built-in pack, so a new install has something good to try. */
export const STARTER_LOOKS: { id: string; name: string; note: string; look: Look }[] = [
  {
    id: "midnight",
    name: "Midnight",
    note: "Velvet base, nebula gradient, violet accent",
    look: {
      theme: "velvet",
      accent: "violet",
      accentHex: null,
      glass: "frosted",
      gradient: { from: "#120a2e", via: "#bf5af2", to: "#ff2d78", angle: 210 },
      blur: 46,
      glow: 88,
      motion: true,
      density: "cozy",
    },
  },
  {
    id: "daylight",
    name: "Daylight",
    note: "Mist in the morning, soft blue, no gradient",
    look: {
      theme: "mist",
      accent: "blue",
      accentHex: null,
      glass: "solid",
      gradient: null,
      blur: 24,
      glow: 62,
      motion: true,
      density: "cozy",
    },
  },
  {
    id: "ember",
    name: "Ember room",
    note: "Aurora base, warm sunset wash, compact rows",
    look: {
      theme: "aurora",
      accent: "orange",
      accentHex: null,
      glass: "clear",
      gradient: { from: "#2a1004", via: "#ff9f0a", to: "#ff375f", angle: 300 },
      blur: 34,
      glow: 96,
      motion: true,
      density: "compact",
    },
  },
  {
    id: "studio",
    name: "Studio mono",
    note: "Graphite, calm grey gradient, motion off",
    look: {
      theme: "graphite",
      accent: "graphite",
      accentHex: null,
      glass: "frosted",
      gradient: { from: "#0b0b0d", via: "#2c2c31", to: "#4a4a52", angle: 170 },
      blur: 52,
      glow: 54,
      motion: false,
      density: "cozy",
    },
  },
];
