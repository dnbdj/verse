import { describe, expect, it } from "vitest";
import {
  BLUR_RANGE,
  GRADIENT_PRESETS,
  accentTokens,
  appearanceOf,
  artGlowPercent,
  gradientCss,
  guardAccent,
  hexToRgb,
  randomGradient,
  readableInk,
  relativeLuminance,
  sameGradient,
} from "./theme";

describe("gradientCss", () => {
  it("renders a two-stop gradient with the angle", () => {
    expect(
      gradientCss({ from: "#000000", via: null, to: "#ffffff", angle: 90 }),
    ).toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
  });

  it("inserts the mid stop at the halfway point", () => {
    expect(
      gradientCss({ from: "#111111", via: "#222222", to: "#333333", angle: 180 }),
    ).toBe("linear-gradient(180deg, #111111 0%, #222222 50%, #333333 100%)");
  });
});

describe("randomGradient", () => {
  it("produces valid hex stops inside the angle range", () => {
    for (let run = 0; run < 25; run += 1) {
      const gradient = randomGradient();
      expect(hexToRgb(gradient.from)).not.toBeNull();
      expect(hexToRgb(gradient.to)).not.toBeNull();
      if (gradient.via) expect(hexToRgb(gradient.via)).not.toBeNull();
      expect(gradient.angle).toBeGreaterThanOrEqual(0);
      expect(gradient.angle).toBeLessThanOrEqual(360);
    }
  });
});

describe("readableInk", () => {
  it("keeps dark text on bright accents and white on dark ones", () => {
    expect(readableInk("#30d158")).toBe("#101013");
    expect(readableInk("#0a84ff")).toBe("#ffffff");
    expect(readableInk("#ffffff")).toBe("#101013");
  });

  it("falls back to white for junk input", () => {
    expect(readableInk("not-a-colour")).toBe("#ffffff");
  });
});

describe("guardAccent", () => {
  it("lifts a very dark sample into a readable band on dark glass", () => {
    const guarded = guardAccent("#120a2e", "dark");
    expect(guarded).toMatch(/^#[0-9a-f]{6}$/);
    expect(relativeLuminance(guarded)).toBeGreaterThanOrEqual(0.235);
    expect(relativeLuminance(guarded)).toBeLessThanOrEqual(0.61);
  });

  it("deepens a very bright sample for light themes", () => {
    const guarded = guardAccent("#ffe066", "light");
    expect(relativeLuminance(guarded)).toBeLessThanOrEqual(0.35);
    expect(relativeLuminance(guarded)).toBeGreaterThan(0.02);
  });

  it("keeps an in-band colour untouched and always returns a hex", () => {
    expect(guardAccent("#8e8e93", "dark")).toBe("#8e8e93");
    expect(guardAccent("nonsense", "light")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps button ink readable on both schemes", () => {
    const dark = guardAccent("#ffe066", "dark");
    const light = guardAccent("#ffe066", "light");
    expect(["#ffffff", "#101013"]).toContain(readableInk(dark));
    expect(["#ffffff", "#101013"]).toContain(readableInk(light));
  });
});

describe("accentTokens", () => {
  const base = appearanceOf({
    volume: 0.8,
    shuffle: false,
    repeat: "off",
    theme: "mist",
    accent: "blue",
    glass: "frosted",
    gradient: null,
    accentHex: null,
    blur: 40,
    glow: 80,
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
  });

  it("returns no tokens for a preset accent when nothing is tinting", () => {
    expect(accentTokens(base, null)).toBeNull();
  });

  it("keeps the user's custom accent exactly when artwork is off", () => {
    const tokens = accentTokens({ ...base, accent: "custom", accentHex: "#ff5fa2" }, null);
    expect(tokens).not.toBeNull();
    expect(tokens?.accent).toBe("#ff5fa2");
    expect(tokens?.glow).toBe("transparent");
  });

  it("guards a sampled cover colour and makes it glow", () => {
    const tokens = accentTokens({ ...base, theme: "graphite" }, "#ffe066");
    expect(tokens).not.toBeNull();
    if (!tokens) return;
    expect(tokens.accent).not.toBe("#ffe066");
    expect(relativeLuminance(tokens.accent)).toBeLessThanOrEqual(0.61);
    expect(tokens.glow).toContain(tokens.accent);
    expect(tokens.soft).toContain(tokens.accent);
    expect(["#ffffff", "#101013"]).toContain(tokens.ink);
  });

  it("uses the light-theme band for the glow as well", () => {
    const tokens = accentTokens({ ...base, theme: "mist" }, "#ffe066");
    expect(tokens).not.toBeNull();
    if (!tokens) return;
    expect(relativeLuminance(tokens.accent)).toBeLessThanOrEqual(0.34);
    expect(tokens.glow).toContain(tokens.accent);
  });

  it("scales the glow with the intensity and clamps out-of-range values", () => {
    expect(artGlowPercent(55)).toBe(44);
    expect(artGlowPercent(0)).toBe(0);
    expect(artGlowPercent(-20)).toBe(0);
    expect(artGlowPercent(150)).toBe(80);
    expect(artGlowPercent(Number.NaN)).toBe(44);

    const low = accentTokens({ ...base, artGlow: 0 }, "#8e8e93");
    const high = accentTokens({ ...base, artGlow: 100 }, "#8e8e93");
    expect(low?.glow).toContain("0%");
    expect(high?.glow).toContain("80%");
    expect(high?.accent).toBe(low?.accent);
  });

  it("paints no glow at all when artwork tinting is off", () => {
    const tokens = accentTokens(
      { ...base, accent: "custom", accentHex: "#ff5fa2", artGlow: 100 },
      null,
    );
    expect(tokens?.glow).toBe("transparent");
    expect(tokens?.accent).toBe("#ff5fa2");
  });
});

describe("presets", () => {
  it("are uniquely named, valid and inside the blur range default", () => {
    const ids = GRADIENT_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of GRADIENT_PRESETS) {
      expect(hexToRgb(preset.gradient.from)).not.toBeNull();
      expect(hexToRgb(preset.gradient.to)).not.toBeNull();
    }
    expect(BLUR_RANGE.min).toBeLessThan(BLUR_RANGE.max);
  });

  it("compares gradients by every stop", () => {
    const base = { from: "#111111", via: null, to: "#222222", angle: 45 };
    expect(sameGradient(base, { ...base })).toBe(true);
    expect(sameGradient(base, { ...base, angle: 90 })).toBe(false);
    expect(sameGradient(base, { ...base, via: "#333333" })).toBe(false);
  });
});
