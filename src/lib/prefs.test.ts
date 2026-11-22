import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  loadPrefs,
  savePrefs,
  validatePlaylistFolders,
  type PrefStore,
} from "./prefs";

const memoryStore = (): PrefStore => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

describe("validatePlaylistFolders", () => {
  it("keeps valid folders and trims names", () => {
    expect(
      validatePlaylistFolders([
        { id: " f1 ", name: "  Road trip  ", playlistIds: ["a", "b"] },
      ]),
    ).toEqual([{ id: "f1", name: "Road trip", playlistIds: ["a", "b"] }]);
  });

  it("puts each playlist in one folder only", () => {
    expect(
      validatePlaylistFolders([
        { id: "f1", name: "One", playlistIds: ["a", "a"] },
        { id: "f2", name: "Two", playlistIds: ["a", "b"] },
      ]),
    ).toEqual([
      { id: "f1", name: "One", playlistIds: ["a"] },
      { id: "f2", name: "Two", playlistIds: ["b"] },
    ]);
  });

  it("drops malformed and duplicate folders", () => {
    expect(
      validatePlaylistFolders([
        null,
        { id: "", name: "Nameless id", playlistIds: [] },
        { id: "f1", name: "   ", playlistIds: [] },
        { id: "f1", name: "First", playlistIds: [3, null] },
        { id: "f1", name: "Duplicate", playlistIds: [] },
      ]),
    ).toEqual([{ id: "f1", name: "First", playlistIds: [] }]);
  });

  it("falls back to no folders when the value is not a list", () => {
    expect(validatePlaylistFolders(undefined)).toEqual([]);
    expect(validatePlaylistFolders("f1")).toEqual([]);
  });
});

describe("playlist folder prefs", () => {
  it("survives a save and load", () => {
    const store = memoryStore();
    savePrefs(
      { playlistFolders: [{ id: "f1", name: "Road trip", playlistIds: ["a"] }] },
      store,
    );
    expect(loadPrefs(store).playlistFolders).toEqual([
      { id: "f1", name: "Road trip", playlistIds: ["a"] },
    ]);
  });
});

describe("stored appearance", () => {
  it("falls back to a sane theme when the stored palette is malformed", () => {
    const store = memoryStore();
    store.setItem(
      "verse.prefs",
      JSON.stringify({
        theme: "ultraviolet",
        accent: "neon",
        accentHex: "nope",
        gradient: { from: "#zzzzzz", to: "#123", angle: 9999 },
        blur: "wide",
        glow: "lots",
        glass: "mirror",
        density: "huge",
        motion: "yes",
        pinned: ["notaservice", "deezer"],
        recent: null,
        savedLooks: "none",
      }),
    );

    const prefs = loadPrefs(store);
    expect(prefs.theme).toBe(DEFAULT_PREFS.theme);
    expect(prefs.accent).toBe(DEFAULT_PREFS.accent);
    expect(prefs.accentHex).toBeNull();
    expect(prefs.gradient).toBeNull();
    expect(prefs.blur).toBe(DEFAULT_PREFS.blur);
    expect(prefs.glow).toBe(DEFAULT_PREFS.glow);
    expect(prefs.glass).toBe(DEFAULT_PREFS.glass);
    expect(prefs.density).toBe(DEFAULT_PREFS.density);
    expect(prefs.pinned).toEqual(["deezer"]);
    expect(prefs.savedLooks).toEqual([]);
  });

  it("keeps a valid theme and gradient while filling missing keys", () => {
    const store = memoryStore();
    store.setItem(
      "verse.prefs",
      JSON.stringify({
        theme: "mist",
        gradient: { from: "#111111", to: "#eeeeee", angle: 90 },
      }),
    );

    const prefs = loadPrefs(store);
    expect(prefs.theme).toBe("mist");
    expect(prefs.accent).toBe(DEFAULT_PREFS.accent);
    expect(prefs.gradient).toEqual({
      from: "#111111",
      via: null,
      to: "#eeeeee",
      angle: 90,
    });
    expect(prefs.playlistFolders).toEqual([]);
  });

  it("round-trips a custom accent and three-stop gradient", () => {
    const store = memoryStore();
    savePrefs(
      {
        theme: "graphite",
        accent: "custom",
        accentHex: "#ff5fa2",
        gradient: { from: "#04202e", via: "#00cfff", to: "#ff5fa2", angle: 215 },
      },
      store,
    );

    const prefs = loadPrefs(store);
    expect(prefs.theme).toBe("graphite");
    expect(prefs.accent).toBe("custom");
    expect(prefs.accentHex).toBe("#ff5fa2");
    expect(prefs.gradient).toEqual({
      from: "#04202e",
      via: "#00cfff",
      to: "#ff5fa2",
      angle: 215,
    });
  });
});
