import { useEffect, useState } from "react";

export const NEUTRAL_TINT = "#8e8e93";

const hex = (value: number): string => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");

const hueOf = (r: number, g: number, b: number): number => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
};

/**
 * Picks a vivid accent out of decoded RGBA pixels, weighted towards saturated
 * mid-tones so a black-and-white sleeve or a white logo does not tint the app grey.
 * Returns null when the image has nothing worth using.
 */
export function dominantAccent(data: Uint8ClampedArray | null): string | null {
  if (!data || data.length < 16) return null;

  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, count: 0, r: 0, g: 0, b: 0 }));

  for (let index = 0; index + 3 < data.length; index += 4 * 6) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = data[index + 3];
    if (alpha < 150) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 510;
    if (lightness < 0.1 || lightness > 0.94) continue;

    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation < 0.16) continue;

    const bucket = buckets[Math.floor(hueOf(r, g, b) / 30) % 12];
    const weight = saturation * saturation;
    bucket.weight += weight;
    bucket.count += 1;
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
  }

  let best = buckets[0];
  for (const bucket of buckets) {
    if (bucket.weight > best.weight) best = bucket;
  }
  if (best.count < 6 || best.weight <= 0.02) return null;

  return `#${hex(best.r / best.weight)}${hex(best.g / best.weight)}${hex(best.b / best.weight)}`;
}

/** The value the UI actually paints: a sampled colour, or the neutral fallback. */
export function tintOrDefault(data: Uint8ClampedArray | null): string {
  return dominantAccent(data) ?? NEUTRAL_TINT;
}

/**
 * Tints the glass from the playing cover and returns the sampled colour (null when
 * disabled, missing, or unreadable). The caller uses that colour for the accent too.
 */
export function useArtworkTint(
  sourceUrl: string | null | undefined,
  enabled: boolean,
  strength = 0.55,
): string | null {
  const wash = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 0.55));
  const [tint, setTint] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      setTint(null);
      root.style.setProperty("--art-tint", NEUTRAL_TINT);
      root.style.setProperty("--art-tint-strength", "0");
    };

    if (!enabled || !sourceUrl) {
      clear();
      return;
    }

    let alive = true;
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      if (!alive) return;
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          clear();
          return;
        }
        context.drawImage(image, 0, 0, size, size);
        const sampled = dominantAccent(context.getImageData(0, 0, size, size).data);
        if (!sampled) {
          clear();
          return;
        }
        setTint(sampled);
        root.style.setProperty("--art-tint", sampled);
        root.style.setProperty("--art-tint-strength", String(wash));
      } catch {
        // Tainted canvas (cross-origin artwork) or a decode failure: stay neutral.
        clear();
      }
    };
    image.onerror = clear;
    image.src = sourceUrl;

    return () => {
      alive = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [sourceUrl, enabled, wash]);

  return enabled ? tint : null;
}
