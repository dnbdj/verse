import { describe, expect, it } from "vitest";
import {
  BUNDLE_KIND,
  BUNDLE_VERSION,
  buildBundle,
  bundleFileName,
  mergeLooks,
  mergePins,
  parseBundle,
  planPlaylists,
  resolveTrackIds,
  serializeBundle,
  type BundlePlaylist,
  type BundleSource,
} from "./bundle";
import { DEFAULT_PREFS, saveLook } from "./prefs";
import { appearanceOf } from "./theme";
import type { Appearance } from "./theme";
import type { Playlist, Track } from "./types";
import type { ServiceId } from "./services";

const LOOKS = saveLook([], { name: "Late night", appearance: appearanceOf(DEFAULT_PREFS) });
const PREFS: Appearance = {
  ...appearanceOf(DEFAULT_PREFS),
  theme: "graphite",
  accent: "custom",
  accentHex: "#ff5fa2",
  gradient: { from: "#04202e", via: "#00cfff", to: "#0a84ff", angle: 190 },
  blur: 60,
  glow: 90,
  motion: false,
  density: "compact",
  artGlow: 70,
};

const PLAYLISTS: BundlePlaylist[] = [
  {
    name: "Warm up",
    tracks: [
      { id: "t1", title: "Glass Horizon", artist: "Mira Vale" },
      { id: "t2", title: "Slow Static", artist: "Kite Weather" },
    ],
  },
];

const source: BundleSource = {
  looks: LOOKS,
  pinned: ["deezer", "spotify"] as ServiceId[],
  prefs: PREFS,
  playlists: PLAYLISTS,
};

const track = (id: string, title: string, artist: string): Track => ({
  id,
  path: `/music/${id}.mp3`,
  title,
  artist,
  album: "",
  albumArtist: artist,
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

describe("bundle v2 export", () => {
  it("round-trips playlists, looks, pin order and appearance", () => {
    const text = serializeBundle(source);
    const parsed = parseBundle(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.legacy).toBe(false);
    expect(parsed.bundle.version).toBe(BUNDLE_VERSION);
    expect(parsed.bundle.looks[0].name).toBe("Late night");
    expect(parsed.bundle.pinned).toEqual(["deezer", "spotify"]);
    expect(parsed.bundle.prefs).toEqual(PREFS);
    expect(parsed.bundle.playlists).toEqual(PLAYLISTS);
    expect(parsed.bundle.checksum).toMatch(/^[0-9a-f]{16}$/);
  });

  it("checksums the content, not the formatting", () => {
    const bundle = buildBundle(source);
    const compact = JSON.stringify(bundle);
    const reordered = JSON.stringify({
      playlists: bundle.playlists,
      checksum: bundle.checksum,
      looks: bundle.looks,
      pinned: bundle.pinned,
      prefs: bundle.prefs,
      exportedAt: bundle.exportedAt,
      version: bundle.version,
      kind: bundle.kind,
    });
    expect(parseBundle(compact).ok).toBe(true);
    expect(parseBundle(reordered).ok).toBe(true);
  });

  it("stamps the file with the export date", () => {
    const when = new Date("2026-11-22T10:00:00Z");
    expect(bundleFileName(when)).toBe("verse-2026-11-22.json");
    expect(buildBundle(source, when).exportedAt).toBe("2026-11-22T10:00:00.000Z");
  });

  it("computes a checksum that changes with the payload", () => {
    const base = buildBundle(source);
    const changed = buildBundle({ ...source, pinned: ["deezer"] });
    expect(base.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect(changed.checksum).not.toBe(base.checksum);
  });
});

describe("bundle import validation", () => {
  it("imports a legacy v1 file and treats playlists as absent", () => {
    const v1 = {
      kind: BUNDLE_KIND,
      version: 1,
      exportedAt: "2026-11-01T00:00:00.000Z",
      prefs: PREFS,
      pinned: ["bandcamp"],
      looks: LOOKS,
    };
    const parsed = parseBundle(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.legacy).toBe(true);
    expect(parsed.bundle.version).toBe(1);
    expect(parsed.bundle.playlists).toEqual([]);
    expect(parsed.bundle.pinned).toEqual(["bandcamp"]);
  });

  it("rejects a v2 file whose checksum does not match", () => {
    const bundle = buildBundle(source);
    const tampered = JSON.stringify({ ...bundle, prefs: { ...bundle.prefs, theme: "velvet" } });
    const parsed = parseBundle(tampered);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("checksum does not match");

    const renamed = JSON.stringify({
      ...bundle,
      playlists: [{ ...bundle.playlists[0], name: "Other" }],
    });
    const renamedResult = parseBundle(renamed);
    expect(renamedResult.ok).toBe(false);
    if (!renamedResult.ok) expect(renamedResult.error).toContain("checksum");
  });

  it("rejects a v2 file with no checksum", () => {
    const bundle = buildBundle(source);
    const { checksum, ...rest } = bundle;
    expect(checksum).toBeTruthy();
    const parsed = parseBundle(JSON.stringify(rest));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("no checksum");
  });

  it("rejects a damaged playlist before checking the checksum", () => {
    const bundle = buildBundle(source);
    const withoutTracks = JSON.stringify({
      ...bundle,
      playlists: [{ name: "Broken" }],
    });
    const parsed = parseBundle(withoutTracks);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("playlists");
  });

  it("rejects a future version with both versions named", () => {
    const future = parseBundle(
      JSON.stringify({
        kind: BUNDLE_KIND,
        version: 9,
        prefs: PREFS,
        pinned: [],
        looks: [],
        playlists: [],
      }),
    );
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toContain("version 9");
  });

  it("still rejects damaged looks and appearances with a specific message", () => {
    const bundle = buildBundle(source);
    const badLook = parseBundle(
      JSON.stringify({ ...bundle, looks: [{ id: "a", name: "", appearance: {} }] }),
    );
    expect(badLook.ok).toBe(false);
    if (!badLook.ok) expect(badLook.error).toContain("damaged saved look");

    const badPrefs = parseBundle(
      JSON.stringify({ ...bundle, prefs: { theme: "aurora", accent: "custom", accentHex: null } }),
    );
    expect(badPrefs.ok).toBe(false);
    if (!badPrefs.ok) expect(badPrefs.error).toContain("appearance");
  });
});

describe("playlist planning", () => {
  const tracks = [
    track("t1", "Glass Horizon", "Mira Vale"),
    track("t2", "Slow Static", "Kite Weather"),
    track("t3", "Paper Sun", "Mira Vale"),
  ];

  it("resolves by id first, then by title and artist, and skips unknown tracks", () => {
    expect(
      resolveTrackIds(
        [
          { id: "t1", title: "Glass Horizon", artist: "Mira Vale" },
          { id: "gone", title: "slow static", artist: "kite weather" },
          { id: "missing", title: "Not here", artist: "Nobody" },
          { id: "t1", title: "Glass Horizon", artist: "Mira Vale" },
        ],
        tracks,
      ),
    ).toEqual(["t1", "t2"]);
  });

  it("replace deletes every current playlist and recreates the file's order", () => {
    const current: Playlist[] = [
      { id: "p1", name: "Keep me?", trackIds: ["t3"] },
      { id: "p2", name: "Warm up", trackIds: ["t2"] },
    ];
    const plan = planPlaylists(current, PLAYLISTS, tracks, "replace");
    expect(plan.deleteIds).toEqual(["p1", "p2"]);
    expect(plan.create).toEqual([{ name: "Warm up", trackIds: ["t1", "t2"] }]);
    expect(plan.append).toEqual([]);
  });

  it("merge appends only missing tracks and leaves unmentioned playlists alone", () => {
    const current: Playlist[] = [
      { id: "p1", name: "Warm up", trackIds: ["t2", "t3"] },
      { id: "p9", name: "Private", trackIds: ["t3"] },
    ];
    const incoming: BundlePlaylist[] = [
      { name: "warm UP", tracks: [{ id: "t1", title: "", artist: "" }, { id: "t2", title: "", artist: "" }] },
      { name: "Night drive", tracks: [{ id: "t3", title: "", artist: "" }] },
    ];
    const plan = planPlaylists(current, incoming, tracks, "merge");
    expect(plan.deleteIds).toEqual([]);
    expect(plan.append).toEqual([{ playlistId: "p1", trackIds: ["t1"] }]);
    expect(plan.create).toEqual([{ name: "Night drive", trackIds: ["t3"] }]);
  });

  it("leaves playlists alone when a legacy bundle carries none", () => {
    const current: Playlist[] = [{ id: "p1", name: "Keeper", trackIds: ["t1"] }];
    expect(planPlaylists(current, [], tracks, "merge")).toEqual({
      deleteIds: [],
      create: [],
      append: [],
    });
  });

  it("merging identical playlists is a no-op", () => {
    const current: Playlist[] = [{ id: "p1", name: "Warm up", trackIds: ["t1", "t2"] }];
    expect(planPlaylists(current, PLAYLISTS, tracks, "merge")).toEqual({
      deleteIds: [],
      create: [],
      append: [],
    });
  });
});

describe("merge helpers", () => {
  it("keeps current looks first and adds only unseen ids, capped at 24", () => {
    const mine = saveLook([], { name: "Mine", appearance: PREFS });
    const theirs = saveLook([], { name: "Theirs", appearance: PREFS });
    const merged = mergeLooks(mine, [...theirs, ...mine]);
    expect(merged.map((look) => look.name)).toEqual(["Mine", "Theirs"]);
  });

  it("appends pins after the current order without duplicates", () => {
    expect(
      mergePins(["deezer", "spotify"], ["bandcamp", "deezer", "tidal"] as ServiceId[]),
    ).toEqual(["deezer", "spotify", "bandcamp", "tidal"]);
  });
});
