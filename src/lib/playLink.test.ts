import { describe, expect, it } from "vitest";
import {
  cleanLocalId,
  invalidAlbumKeyError,
  playTarget,
  readPlayFromUrl,
} from "./playLink";

describe("cleanLocalId", () => {
  it("accepts uuid-style and demo ids", () => {
    expect(cleanLocalId("9f1c2ab3-4d5e-6789-abcd-ef0123456789")).toBe(
      "9f1c2ab3-4d5e-6789-abcd-ef0123456789",
    );
    expect(cleanLocalId("  demo-track-6  ")).toBe("demo-track-6");
  });

  it("rejects empty, overlong and path-like ids", () => {
    expect(cleanLocalId("")).toBeNull();
    expect(cleanLocalId("   ")).toBeNull();
    expect(cleanLocalId("../songs")).toBeNull();
    expect(cleanLocalId("has spaces")).toBeNull();
    expect(cleanLocalId("a".repeat(129))).toBeNull();
    expect(cleanLocalId(null)).toBeNull();
  });
});

describe("web play links", () => {
  it("reads #play= track ids", () => {
    expect(readPlayFromUrl("http://localhost:5183/#play=demo-track-1")).toEqual({
      kind: "play",
      target: { kind: "track", id: "demo-track-1" },
    });
  });

  it("reads #playlist= ids", () => {
    expect(readPlayFromUrl("http://localhost:5183/#playlist=demo-playlist-1")).toEqual({
      kind: "play",
      target: { kind: "playlist", id: "demo-playlist-1" },
    });
  });

  it("reads #album= keys with spaces and a pipe", () => {
    expect(
      readPlayFromUrl("http://localhost:5183/#album=Mira%20Vale%7CSoft%20Focus"),
    ).toEqual({
      kind: "play",
      target: { kind: "album", key: "Mira Vale|Soft Focus" },
    });
  });

  it("returns none for look links and pages without a play payload", () => {
    expect(readPlayFromUrl("http://localhost:5183/")).toEqual({ kind: "none" });
    expect(readPlayFromUrl("http://localhost:5183/#look=VRS1.x")).toEqual({ kind: "none" });
    expect(readPlayFromUrl("not a url")).toEqual({ kind: "none" });
  });

  it("reports malformed ids per kind without guessing one", () => {
    const track = readPlayFromUrl("http://x/#play=not%20an%20id");
    expect(track.kind).toBe("error");
    if (track.kind === "error") expect(track.error).toContain("track id");

    const playlist = readPlayFromUrl("http://x/#playlist=bad/id");
    expect(playlist.kind).toBe("error");
    if (playlist.kind === "error") expect(playlist.error).toContain("playlist id");

    const album = readPlayFromUrl("http://x/#album=NoPipeHere");
    expect(album.kind).toBe("error");
    if (album.kind === "error") expect(album.error).toContain("album");
  });

  it("prefers a track over a playlist over an album", () => {
    expect(
      readPlayFromUrl("http://x/#playlist=demo-playlist-1&album=A%7CB&play=demo-track-1"),
    ).toEqual({ kind: "play", target: { kind: "track", id: "demo-track-1" } });
    expect(
      readPlayFromUrl("http://x/#playlist=demo-playlist-1&album=A%7CB"),
    ).toEqual({ kind: "play", target: { kind: "playlist", id: "demo-playlist-1" } });
  });

  it("validates an album key even when another key is fine", () => {
    expect(playTarget({ kind: "album", key: "" })).toEqual({
      kind: "error",
      error: invalidAlbumKeyError(),
    });
    expect(playTarget({ kind: "album", key: "a".repeat(301) }).kind).toBe("error");
  });

  it("keeps ids with dots, underscores and dashes", () => {
    expect(readPlayFromUrl("http://x/#play=track_1.remix-a")).toEqual({
      kind: "play",
      target: { kind: "track", id: "track_1.remix-a" },
    });
  });
});
