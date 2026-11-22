import { describe, expect, it } from "vitest";
import { albumGroups, albumKeyOf, cleanAlbumKey, findAlbum } from "./albums";
import type { Track } from "./types";

const track = (id: string, title: string, album: string, artist: string, trackNo: number | null): Track => ({
  id,
  path: `/m/${id}.mp3`,
  title,
  artist,
  album,
  albumArtist: artist,
  durationMs: 1000,
  trackNo,
  discNo: 1,
  year: null,
  genre: null,
  coverPath: null,
  size: 0,
  addedAt: 1,
  lastPlayedAt: null,
  playCount: 0,
});

const TRACKS = [
  track("b", "Second", "Soft Focus", "Mira Vale", 2),
  track("a", "First", "Soft Focus", "Mira Vale", 1),
  track("c", "Other", "Night Drive", "Harbour Lights", null),
];

describe("album grouping", () => {
  it("keys albums by album artist and name", () => {
    expect(albumKeyOf(TRACKS[0])).toBe("Mira Vale|Soft Focus");
  });

  it("preserves first-seen album order and sorts tracks", () => {
    const groups = albumGroups(TRACKS);
    expect(groups.map((group) => group.key)).toEqual([
      "Mira Vale|Soft Focus",
      "Harbour Lights|Night Drive",
    ]);
    expect(groups[0].tracks.map((entry) => entry.title)).toEqual(["First", "Second"]);
    expect(groups[0].name).toBe("Soft Focus");
  });

  it("finds albums exactly and case-insensitively", () => {
    expect(findAlbum(TRACKS, "Mira Vale|Soft Focus")?.tracks).toHaveLength(2);
    expect(findAlbum(TRACKS, "mira vale|soft focus")?.name).toBe("Soft Focus");
    expect(findAlbum(TRACKS, "Nobody|Nothing")).toBeNull();
  });
});

describe("cleanAlbumKey", () => {
  it("accepts keys with spaces and one pipe", () => {
    expect(cleanAlbumKey("  Mira Vale|Soft Focus ")).toBe("Mira Vale|Soft Focus");
  });

  it("rejects empty, pipeless, overlong and control-character keys", () => {
    expect(cleanAlbumKey("")).toBeNull();
    expect(cleanAlbumKey("NoPipe")).toBeNull();
    expect(cleanAlbumKey(`A|${"b".repeat(300)}`)).toBeNull();
    expect(cleanAlbumKey("A|\u0007B")).toBeNull();
    expect(cleanAlbumKey(null)).toBeNull();
  });
});
