import { describe, expect, it } from "vitest";
import { buildBundle, type VerseBundle } from "./bundle";
import { ALL_SECTIONS, applyImportSections, planImport, type ImportState } from "./importPlan";
import { DEFAULT_PREFS } from "./prefs";
import { appearanceOf, type Appearance, type SavedLook } from "./theme";
import type { Track } from "./types";

const BASE: Appearance = {
  ...appearanceOf(DEFAULT_PREFS),
  theme: "graphite",
  accent: "custom",
  accentHex: "#ff5fa2",
  artGlow: 70,
  motion: false,
};

const INCOMING: Appearance = {
  ...BASE,
  theme: "mist",
  accent: "blue",
  accentHex: null,
  artGlow: 25,
  motion: true,
};

const track = (id: string, title: string, album = "Soft Focus"): Track => ({
  id,
  path: `/m/${id}.mp3`,
  title,
  artist: "Mira Vale",
  album,
  albumArtist: "Mira Vale",
  durationMs: 1000,
  trackNo: 1,
  discNo: 1,
  year: null,
  genre: null,
  coverPath: null,
  size: 0,
  addedAt: 1,
  lastPlayedAt: null,
  playCount: 0,
});

const TRACKS = [track("t1", "First"), track("t2", "Second"), track("t3", "Third"), track("t4", "Fourth", "Night Drive")];

const LOOK_A: SavedLook = { id: "look-a", name: "Mine", appearance: BASE };
const LOOK_B: SavedLook = { id: "look-b", name: "Theirs", appearance: INCOMING };

const CURRENT: ImportState = {
  playlists: [
    { id: "p1", name: "Warm up", trackIds: ["t2", "t3"] },
    { id: "p2", name: "Private", trackIds: ["t4"] },
  ],
  looks: [LOOK_A],
  pinned: ["deezer", "spotify"],
  prefs: BASE,
};

const BUNDLE: VerseBundle = buildBundle(
  {
    looks: [LOOK_A, LOOK_B],
    pinned: ["bandcamp", "deezer"],
    prefs: INCOMING,
    playlists: [
      {
        name: "Warm up",
        tracks: [
          { id: "t1", title: "First", artist: "Mira Vale" },
          { id: "t2", title: "Second", artist: "Mira Vale" },
          { id: "ghost", title: "Gone", artist: "Nobody" },
        ],
      },
      { name: "New list", tracks: [{ id: "t4", title: "Fourth", artist: "Mira Vale" }] },
    ],
  },
  new Date("2026-11-22T10:00:00Z"),
);

describe("replace preview", () => {
  const plan = planImport(BUNDLE, false, CURRENT, TRACKS, "replace");

  it("shows per-playlist new/kept/removed track counts", () => {
    expect(plan.playlistDiffs).toEqual([
      { name: "Warm up", status: "updated", added: 1, removed: 1, kept: 1 },
      { name: "New list", status: "new", added: 1, removed: 0, kept: 0 },
      { name: "Private", status: "removed", added: 0, removed: 1, kept: 0 },
    ]);
  });

  it("lists the individual tracks that would change and skips unknown ones", () => {
    expect(plan.trackChanges.map((change) => `${change.action}:${change.id}`)).toEqual([
      "added:t1",
      "removed:t3",
      "added:t4",
      "removed:t4",
    ]);
    expect(plan.skippedTracks).toBe(1);
    expect(plan.playlists.deleteIds).toEqual(["p1", "p2"]);
    expect(plan.playlists.create.map((entry) => entry.trackIds)).toEqual([["t1", "t2"], ["t4"]]);
  });

  it("diffs looks, pins and appearance", () => {
    expect(plan.looks.added.map((look) => look.id)).toEqual(["look-b"]);
    expect(plan.looks.kept).toBe(1);
    expect(plan.looks.removed).toEqual([]);
    expect(plan.pins).toEqual({ added: ["bandcamp"], kept: ["deezer"], removed: ["spotify"] });
    expect(plan.appearance.changes.map((change) => change.label)).toContain("Theme");
    expect(plan.appearance.changes.map((change) => change.label)).toContain("Artwork glow");
  });
});

describe("merge preview", () => {
  const plan = planImport(BUNDLE, false, CURRENT, TRACKS, "merge");

  it("only adds missing tracks and leaves unmentioned playlists alone", () => {
    expect(plan.playlistDiffs).toEqual([
      { name: "Warm up", status: "updated", added: 1, removed: 0, kept: 1 },
      { name: "New list", status: "new", added: 1, removed: 0, kept: 0 },
    ]);
    expect(plan.playlists).toEqual({
      deleteIds: [],
      create: [{ name: "New list", trackIds: ["t4"] }],
      append: [{ playlistId: "p1", trackIds: ["t1"] }],
    });
  });

  it("keeps the current appearance and pin order", () => {
    expect(plan.appearance.changes).toEqual([]);
    expect(plan.pins).toEqual({ added: ["bandcamp"], kept: ["deezer", "spotify"], removed: [] });
    expect(plan.looks.added.map((look) => look.id)).toEqual(["look-b"]);
  });
});

describe("legacy preview", () => {
  it("has no playlist work at all", () => {
    const plan = planImport({ ...BUNDLE, playlists: [] }, true, CURRENT, TRACKS, "replace");
    expect(plan.playlists).toEqual({ deleteIds: [], create: [], append: [] });
    expect(plan.playlistDiffs).toEqual([]);
    expect(plan.trackChanges).toEqual([]);
    expect(plan.appearance.replace).toBe(true);
  });
});

describe("section toggles", () => {
  const plan = planImport(BUNDLE, false, CURRENT, TRACKS, "replace");

  it("only changes the sections that are enabled", () => {
    const { next, applied } = applyImportSections(plan, BUNDLE, CURRENT, {
      ...ALL_SECTIONS,
      looks: false,
      pins: false,
      appearance: false,
    });
    expect(applied).toEqual({ playlists: true, looks: false, pins: false, appearance: false });
    expect(next.looks).toEqual(CURRENT.looks);
    expect(next.pinned).toEqual(CURRENT.pinned);
    expect(next.prefs).toEqual(CURRENT.prefs);
  });

  it("applies each enabled section with replace semantics", () => {
    const { next } = applyImportSections(plan, BUNDLE, CURRENT, ALL_SECTIONS);
    expect(next.looks.map((look) => look.id)).toEqual(["look-a", "look-b"]);
    expect(next.pinned).toEqual(["bandcamp", "deezer"]);
    expect(next.prefs.theme).toBe("mist");
    expect(next.prefs.artGlow).toBe(25);
  });

  it("merges looks and pins when merge mode is chosen", () => {
    const merge = planImport(BUNDLE, false, CURRENT, TRACKS, "merge");
    const { next } = applyImportSections(merge, BUNDLE, CURRENT, ALL_SECTIONS);
    expect(next.looks.map((look) => look.id)).toEqual(["look-a", "look-b"]);
    expect(next.pinned).toEqual(["deezer", "spotify", "bandcamp"]);
    expect(next.prefs).toEqual(CURRENT.prefs);
  });

  it("cannot enable playlists for a legacy bundle", () => {
    const legacy = planImport({ ...BUNDLE, playlists: [] }, true, CURRENT, TRACKS, "replace");
    const { applied, next } = applyImportSections(legacy, { ...BUNDLE, playlists: [] }, CURRENT, ALL_SECTIONS);
    expect(applied.playlists).toBe(false);
    expect(next.playlists).toEqual(CURRENT.playlists);
  });

  it("nothing enabled leaves the whole state untouched", () => {
    const { next, applied } = applyImportSections(plan, BUNDLE, CURRENT, {
      playlists: false,
      looks: false,
      pins: false,
      appearance: false,
    });
    expect(applied).toEqual({ playlists: false, looks: false, pins: false, appearance: false });
    expect(next.looks).toEqual(CURRENT.looks);
    expect(next.pinned).toEqual(CURRENT.pinned);
    expect(next.prefs).toEqual(CURRENT.prefs);
  });
});
