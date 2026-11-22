import { describe, expect, it } from "vitest";
import { parseMusicLink } from "./services";

describe("parseMusicLink", () => {
  it("turns a YouTube Music watch link into an embeddable video", () => {
    const target = parseMusicLink("https://music.youtube.com/watch?v=abc123&list=PL9");
    expect(target?.service).toBe("ytmusic");
    expect(target?.embedUrl).toContain("/embed/abc123");
    expect(target?.webUrl).toBe("https://music.youtube.com/watch?v=abc123&list=PL9");
  });

  it("handles short youtu.be links and playlist-only links", () => {
    expect(parseMusicLink("youtu.be/abc123")?.embedUrl).toContain("/embed/abc123");
    expect(parseMusicLink("https://www.youtube.com/playlist?list=PL9")?.embedUrl).toContain(
      "/embed/videoseries?list=PL9",
    );
  });

  it("wraps a SoundCloud track in the widget player", () => {
    const target = parseMusicLink("https://soundcloud.com/artist/some-track");
    expect(target?.service).toBe("soundcloud");
    expect(target?.embedKind).toBe("audio");
    expect(target?.embedUrl).toContain(
      encodeURIComponent("https://soundcloud.com/artist/some-track"),
    );
  });

  it("reads Deezer albums and ignores locale prefixes", () => {
    const target = parseMusicLink("https://www.deezer.com/us/album/123456");
    expect(target).toMatchObject({ service: "deezer", resource: "album", id: "123456" });
  });

  it("keeps a Spotify link playable through the remote", () => {
    const target = parseMusicLink("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=xyz");
    expect(target?.uri).toBe("spotify:track:4uLU6hMCjMI75M1A2tKUQC");
    expect(parseMusicLink("spotify:album:abc")?.uri).toBe("spotify:album:abc");
  });

  it("recognises hand-off services and rejects unknown hosts", () => {
    expect(parseMusicLink("https://music.amazon.com/albums/B01")?.service).toBe("amazon");
    expect(parseMusicLink("https://listen.tidal.com/album/123")?.service).toBe("tidal");
    expect(parseMusicLink("https://music.apple.com/us/album/x/123")?.service).toBe("apple");
    expect(parseMusicLink("https://artist.bandcamp.com/album/x")?.service).toBe("bandcamp");
    expect(parseMusicLink("https://example.com/song")).toBeNull();
    expect(parseMusicLink("   ")).toBeNull();
  });
});
