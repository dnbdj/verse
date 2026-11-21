import { describe, expect, it } from "vitest";
import { lineIndexAt, lineProgress, parseLrc, wordProgress } from "./lrc";

const PLAIN = `[ar:Arctic Monkeys]
[ti:505]
[offset:250]
[00:12.40]I'm going back to 505
[00:18.10]If it's a seven hour flight
[00:23.55]Or a forty-five minute drive
`;

describe("parseLrc", () => {
  it("reads metadata, offset and timed lines", () => {
    const parsed = parseLrc(PLAIN);
    expect(parsed.meta.ar).toBe("Arctic Monkeys");
    expect(parsed.meta.ti).toBe("505");
    expect(parsed.offsetMs).toBe(250);
    expect(parsed.synced).toBe(true);
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[0]).toMatchObject({ t: 12400, text: "I'm going back to 505" });
    expect(parsed.lines[2].t).toBe(23550);
    expect(parsed.hasWordTiming).toBe(false);
  });

  it("expands multiple timestamps on one line", () => {
    const parsed = parseLrc("[00:10.00][00:20.00]Chorus\n[00:30.00]Verse");
    expect(parsed.lines.map((l) => l.t)).toEqual([10000, 20000, 30000]);
    expect(parsed.lines[1].text).toBe("Chorus");
  });

  it("parses enhanced word timings", () => {
    const parsed = parseLrc("[00:05.00]<00:05.00>Blinding <00:05.60>lights");
    expect(parsed.hasWordTiming).toBe(true);
    expect(parsed.lines[0].words).toEqual([
      { text: "Blinding ", t: 5000 },
      { text: "lights", t: 5600 },
    ]);
    expect(parsed.lines[0].text).toBe("Blinding lights");
  });

  it("sorts out-of-order timestamps and skips untimed lines", () => {
    const parsed = parseLrc("[00:30.00]later\n[00:10.00]earlier\nno stamp here");
    expect(parsed.lines.map((l) => l.text)).toEqual(["earlier", "later"]);
  });

  it("handles negative offsets and empty input", () => {
    expect(parseLrc("[offset:-500]\n[00:01.00]x").offsetMs).toBe(-500);
    expect(parseLrc("").lines).toHaveLength(0);
    expect(parseLrc("[ar:only meta]").synced).toBe(false);
  });

  it("accepts three-digit milliseconds", () => {
    expect(parseLrc("[01:02.345]ms").lines[0].t).toBe(62345);
  });
});

describe("timing helpers", () => {
  const parsed = parseLrc(PLAIN);

  it("finds the active line", () => {
    expect(lineIndexAt(parsed.lines, 0)).toBe(-1);
    expect(lineIndexAt(parsed.lines, 12400)).toBe(0);
    expect(lineIndexAt(parsed.lines, 18100)).toBe(1);
    expect(lineIndexAt(parsed.lines, 999999)).toBe(2);
  });

  it("computes line progress between boundaries", () => {
    expect(lineProgress(parsed.lines, 0, 12400)).toBe(0);
    expect(lineProgress(parsed.lines, 0, 15250)).toBeCloseTo(0.5, 2);
    expect(lineProgress(parsed.lines, 0, 99999)).toBe(1);
  });

  it("computes word progress", () => {
    const words = [
      { text: "a ", t: 1000 },
      { text: "b", t: 2000 },
    ];
    expect(wordProgress(words, 500)).toBe(0);
    expect(wordProgress(words, 1500)).toBeCloseTo(0.25, 2);
    expect(wordProgress(words, 5000)).toBe(1);
  });
});
