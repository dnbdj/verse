import { describe, expect, it } from "vitest";
import {
  albumDeepLinkFor,
  deepLinkFor,
  parseDeepLink,
  playDeepLinkFor,
  playlistDeepLinkFor,
} from "./deepLink";
import { SHARE_PREFIX, encodeLook, lookLink, type Look } from "./share";

const LOOK: Look = {
  theme: "mist",
  accent: "custom",
  accentHex: "#ff5fa2",
  glass: "solid",
  gradient: { from: "#04202e", via: null, to: "#0a84ff", angle: 190 },
  blur: 34,
  glow: 70,
  motion: true,
  density: "cozy",
};

const CODE = encodeLook(LOOK);

describe("desktop look deep links", () => {
  it("applies the look from the fragment form", () => {
    const arrival = parseDeepLink(deepLinkFor(CODE));
    expect(arrival.kind).toBe("look");
    if (arrival.kind !== "look") return;
    expect(arrival.look).toEqual(LOOK);
    expect(arrival.code).toBe(CODE);
  });

  it("accepts the code in a query or a path", () => {
    expect(parseDeepLink(`verse://look?code=${CODE}`).kind).toBe("look");
    expect(parseDeepLink(`verse://look/${CODE}`).kind).toBe("look");
  });

  it("still reads a normal web share link", () => {
    expect(parseDeepLink(lookLink(CODE, "http://localhost:5183/")).kind).toBe("look");
  });

  it("reports a damaged code with the same validation message", () => {
    const damaged = parseDeepLink("verse://look#look=VRS1.!!!");
    expect(damaged.kind).toBe("error");
    if (damaged.kind !== "error") return;
    expect(damaged.error).toContain("damaged");

    const foreign = parseDeepLink(`verse://look/${SHARE_PREFIX}not-base64`);
    expect(foreign.kind).toBe("error");
  });

  it("reports a desktop link with no code", () => {
    const empty = parseDeepLink("verse://look");
    expect(empty.kind).toBe("error");
    if (empty.kind !== "error") return;
    expect(empty.error).toContain("no look code");
  });
});

describe("desktop play deep links", () => {
  it("reads a track id from a query", () => {
    expect(parseDeepLink("verse://play?track=9f1c2ab3-4d5e")).toEqual({
      kind: "play",
      target: { kind: "track", id: "9f1c2ab3-4d5e" },
    });
    expect(parseDeepLink(playDeepLinkFor("demo-track-1"))).toEqual({
      kind: "play",
      target: { kind: "track", id: "demo-track-1" },
    });
  });

  it("accepts a path id too", () => {
    expect(parseDeepLink("verse://play/demo-track-2")).toEqual({
      kind: "play",
      target: { kind: "track", id: "demo-track-2" },
    });
  });

  it("reads playlist links", () => {
    expect(parseDeepLink(playlistDeepLinkFor("demo-playlist-1"))).toEqual({
      kind: "play",
      target: { kind: "playlist", id: "demo-playlist-1" },
    });
    expect(parseDeepLink("verse://play?list=demo-playlist-2")).toEqual({
      kind: "play",
      target: { kind: "playlist", id: "demo-playlist-2" },
    });
  });

  it("reads album links with spaces and a pipe", () => {
    expect(parseDeepLink(albumDeepLinkFor("Mira Vale|Soft Focus"))).toEqual({
      kind: "play",
      target: { kind: "album", key: "Mira Vale|Soft Focus" },
    });
    expect(parseDeepLink("verse://play?album=Harbour%20Lights%7CNight%20Drive")).toEqual({
      kind: "play",
      target: { kind: "album", key: "Harbour Lights|Night Drive" },
    });
  });

  it("rejects missing or malformed targets with a readable reason", () => {
    const missing = parseDeepLink("verse://play");
    expect(missing.kind).toBe("error");
    if (missing.kind !== "error") return;
    expect(missing.error).toContain("nothing to play");

    const track = parseDeepLink("verse://play?track=../../etc/passwd");
    expect(track.kind).toBe("error");
    if (track.kind === "error") expect(track.error).toContain("track id");

    const playlist = parseDeepLink("verse://play?playlist=not%20an%20id");
    expect(playlist.kind).toBe("error");
    if (playlist.kind === "error") expect(playlist.error).toContain("playlist id");

    const album = parseDeepLink("verse://play?album=NoPipe");
    expect(album.kind).toBe("error");
    if (album.kind === "error") expect(album.error).toContain("album");
  });

  it("does not treat a look link as a play request", () => {
    expect(parseDeepLink(deepLinkFor(CODE)).kind).toBe("look");
  });
});

describe("unrecognised links", () => {
  it("ignores other hosts, other schemes and plain text", () => {
    expect(parseDeepLink("verse://settings")).toEqual({ kind: "none" });
    expect(parseDeepLink("https://example.com/listen")).toEqual({ kind: "none" });
    expect(parseDeepLink("not a url")).toEqual({ kind: "none" });
    expect(parseDeepLink("")).toEqual({ kind: "none" });
  });
});
