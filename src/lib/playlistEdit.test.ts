import { describe, expect, it } from "vitest";
import {
  cleanSnapshot,
  duplicateName,
  mergeTrackIds,
  snapshotPlaylists,
  viewAfterRestore,
} from "./playlistEdit";
import type { Playlist } from "./types";

const PLAYLISTS: Playlist[] = [
  { id: "p1", name: "Late ferry", trackIds: ["t1", "t2"] },
  { id: "p2", name: "Ferry lights", trackIds: ["t3"] },
];

describe("duplicateName", () => {
  it("adds a copy suffix and keeps it unique", () => {
    expect(duplicateName(["Late ferry"], "Late ferry")).toBe("Late ferry copy");
    expect(duplicateName(["Late ferry", "Late ferry copy"], "Late ferry")).toBe(
      "Late ferry copy 2",
    );
    expect(duplicateName(["LATE FERRY COPY"], "late ferry")).toBe("late ferry copy 2");
  });

  it("never returns an empty name", () => {
    expect(duplicateName([], "  ")).toBe("Playlist copy");
  });
});

describe("mergeTrackIds", () => {
  it("keeps target order and appends unseen source tracks", () => {
    expect(mergeTrackIds(["a", "b"], ["b", "c", "a", "d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("never mutates either input", () => {
    const target = ["a"];
    const source = ["b"];
    mergeTrackIds(target, source);
    expect(target).toEqual(["a"]);
    expect(source).toEqual(["b"]);
  });
});

describe("undo snapshots", () => {
  it("deep-copies the playlists so later edits cannot leak in", () => {
    const snapshot = snapshotPlaylists("delete", "Late ferry", "playlist:p1", PLAYLISTS, 42);
    PLAYLISTS[0].trackIds.push("t9");
    expect(snapshot.playlists[0].trackIds).toEqual(["t1", "t2"]);
    expect(snapshot.at).toBe(42);
  });

  it("accepts its own serialized form and rejects damaged shapes", () => {
    const snapshot = snapshotPlaylists("merge", "Late ferry", "playlist:p1", PLAYLISTS);
    expect(cleanSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);

    expect(cleanSnapshot(null)).toBeNull();
    expect(cleanSnapshot({ action: "explode" })).toBeNull();
    expect(cleanSnapshot({ ...snapshot, playlists: [{ id: 1 }] })).toBeNull();
    expect(cleanSnapshot({ ...snapshot, at: "now" })).toBeNull();
    expect(cleanSnapshot({ ...snapshot, playlists: undefined })).toBeNull();
  });

  it("maps an old active playlist id back to its recreated id", () => {
    expect(viewAfterRestore("playlist:p1", new Map([["p1", "new-1"]]))).toBe("playlist:new-1");
    expect(viewAfterRestore("playlist:p1", new Map())).toBe("songs");
    expect(viewAfterRestore("songs", new Map([["p1", "new-1"]]))).toBe("songs");
  });
});
