import { describe, expect, it } from "vitest";
import { moveBefore, moveById, moveItem, moveToIndex } from "./order";

describe("moveItem", () => {
  it("moves an item down and up", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns a fresh list and ignores no-op or out-of-range moves", () => {
    const source = ["a", "b"];
    expect(moveItem(source, 1, 1)).toEqual(source);
    expect(moveItem(source, 1, 1)).not.toBe(source);
    expect(moveItem(source, -1, 1)).toEqual(source);
    expect(moveItem(source, 0, 9)).toEqual(source);
  });

  it("keeps every item exactly once", () => {
    const next = moveItem(["a", "b", "c", "d"], 1, 3);
    expect([...next].sort()).toEqual(["a", "b", "c", "d"]);
    expect(next).toEqual(["a", "c", "d", "b"]);
  });
});

describe("moveById", () => {
  it("moves a track in front of another stored id", () => {
    expect(moveById(["t1", "t2", "t3"], "t3", "t1")).toEqual(["t3", "t1", "t2"]);
    expect(moveById(["t1", "t2", "t3"], "t1", "t3")).toEqual(["t2", "t3", "t1"]);
  });

  it("ignores ids that are not stored and keeps the list intact", () => {
    const source = ["t1", "t2"];
    expect(moveById(source, "missing", "t2")).toEqual(source);
    expect(moveById(source, "t1", "missing")).toEqual(source);
    expect(moveById(source, "t1", "missing")).not.toBe(source);
  });

  it("round-trips a drag so the stored order matches the dropped row", () => {
    const before = ["a", "b", "c", "d"];
    const dragged = moveById(before, "d", "b");
    expect(dragged).toEqual(["a", "d", "b", "c"]);
    // Dropping onto a later row inserts after it, matching the pin shelf's drag.
    expect(moveById(dragged, "d", "c")).toEqual(["a", "b", "c", "d"]);
    expect(moveById(["a", "b", "c", "d"], "d", "a")).toEqual(["d", "a", "b", "c"]);
  });
});

describe("moveToIndex", () => {
  it("inserts at a gap before a row", () => {
    expect(moveToIndex(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveToIndex(["a", "b", "c"], 0, 1)).toEqual(["a", "b", "c"]);
  });

  it("inserts at the end with list.length", () => {
    expect(moveToIndex(["a", "b", "c"], 0, 3)).toEqual(["b", "c", "a"]);
    expect(moveToIndex(["a", "b", "c"], 2, 3)).toEqual(["a", "b", "c"]);
  });

  it("accounts for the removed slot when moving down", () => {
    expect(moveToIndex(["a", "b", "c", "d"], 1, 3)).toEqual(["a", "c", "b", "d"]);
    expect(moveToIndex(["a", "b", "c", "d"], 1, 4)).toEqual(["a", "c", "d", "b"]);
  });

  it("clamps out-of-range gaps and ignores a bad source", () => {
    expect(moveToIndex(["a", "b"], 0, 99)).toEqual(["b", "a"]);
    expect(moveToIndex(["a", "b"], 0, -5)).toEqual(["a", "b"]);
    expect(moveToIndex(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("moveBefore", () => {
  it("lands in the same order as the gap-based form", () => {
    expect(moveBefore(["a", "b", "c"], "c", "a")).toEqual(moveToIndex(["a", "b", "c"], 2, 0));
    expect(moveBefore(["a", "b", "c"], "a", null)).toEqual(moveToIndex(["a", "b", "c"], 0, 3));
  });

  it("is a no-op for the row itself, missing ids or a missing target", () => {
    expect(moveBefore(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(moveBefore(["a", "b"], "zz", "a")).toEqual(["a", "b"]);
    expect(moveBefore(["a", "b"], "a", "zz")).toEqual(["a", "b"]);
  });
});
