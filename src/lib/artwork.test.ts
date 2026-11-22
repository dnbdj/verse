import { describe, expect, it } from "vitest";
import { NEUTRAL_TINT, dominantAccent, tintOrDefault } from "./artwork";

/** Builds RGBA pixels for one flat colour, repeated `count` times. */
function pixels(r: number, g: number, b: number, count = 64, alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let index = 0; index < count; index += 1) {
    data[index * 4] = r;
    data[index * 4 + 1] = g;
    data[index * 4 + 2] = b;
    data[index * 4 + 3] = alpha;
  }
  return data;
}

describe("dominantAccent", () => {
  it("returns a vivid colour for saturated artwork", () => {
    const tint = dominantAccent(pixels(230, 40, 90));
    expect(tint).toMatch(/^#[0-9a-f]{6}$/);
    const red = Number.parseInt(tint!.slice(1, 3), 16);
    const blue = Number.parseInt(tint!.slice(5, 7), 16);
    expect(red).toBeGreaterThan(blue);
  });

  it("ignores greyscale and near-white sleeves", () => {
    expect(dominantAccent(pixels(120, 120, 120))).toBeNull();
    expect(dominantAccent(pixels(250, 250, 250))).toBeNull();
  });

  it("ignores fully transparent pixels and empty buffers", () => {
    expect(dominantAccent(pixels(230, 40, 90, 64, 0))).toBeNull();
    expect(dominantAccent(new Uint8ClampedArray(0))).toBeNull();
    expect(dominantAccent(null)).toBeNull();
  });

  it("is stable for the same input", () => {
    const data = pixels(30, 140, 220);
    expect(dominantAccent(data)).toBe(dominantAccent(data));
  });
});

describe("tintOrDefault", () => {
  it("uses the neutral grey whenever sampling has nothing to offer", () => {
    expect(tintOrDefault(null)).toBe(NEUTRAL_TINT);
    expect(tintOrDefault(pixels(10, 10, 10))).toBe(NEUTRAL_TINT);
    expect(tintOrDefault(new Uint8ClampedArray(0))).toBe(NEUTRAL_TINT);
  });

  it("returns the sampled tint when there is one", () => {
    const sampled = tintOrDefault(pixels(230, 40, 90));
    expect(sampled).not.toBe(NEUTRAL_TINT);
    expect(sampled).toMatch(/^#[0-9a-f]{6}$/);
  });
});
