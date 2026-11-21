export type LyricWord = { text: string; t: number };

export type LyricLine = {
  t: number;
  text: string;
  words?: LyricWord[];
};

export type ParsedLyrics = {
  lines: LyricLine[];
  offsetMs: number;
  hasWordTiming: boolean;
  synced: boolean;
  meta: Record<string, string>;
};

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_STAMP = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const META = /^\[([a-zA-Z]+):(.*)\]$/;

function toMs(min: string, sec: string, frac?: string): number {
  let ms = 0;
  if (frac && frac.length > 0) {
    ms = Number(frac.padEnd(3, "0").slice(0, 3));
  }
  return (Number(min) * 60 + Number(sec)) * 1000 + ms;
}

/** Parse plain and enhanced (word-timed) LRC into timed lines. */
export function parseLrc(raw: string): ParsedLyrics {
  const meta: Record<string, string> = {};
  const lines: LyricLine[] = [];
  let offsetMs = 0;

  if (!raw) {
    return { lines, offsetMs, hasWordTiming: false, synced: false, meta };
  }

  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const metaMatch = line.match(META);
    if (metaMatch && !/\d{1,3}:\d{1,2}/.test(metaMatch[1] + ":" + metaMatch[2])) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
      continue;
    }

    const stamps: number[] = [];
    STAMP.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STAMP.exec(line)) !== null) {
      stamps.push(toMs(match[1], match[2], match[3]));
    }

    const body = line.replace(STAMP, "").trim();
    if (stamps.length === 0) continue;
    if (!body) continue;

    // Enhanced LRC puts a stamp before the syllable it starts.
    const words: LyricWord[] = [];
    WORD_STAMP.lastIndex = 0;
    let wordMatch: RegExpExecArray | null;
    let cursor = 0;
    let pending: number | null = null;
    while ((wordMatch = WORD_STAMP.exec(body)) !== null) {
      const text = body.slice(cursor, wordMatch.index);
      if (text) words.push({ text, t: pending ?? stamps[0] });
      pending = toMs(wordMatch[1], wordMatch[2], wordMatch[3]);
      cursor = wordMatch.index + wordMatch[0].length;
    }
    const tail = body.slice(cursor);
    if (tail && words.length > 0) words.push({ text: tail, t: pending ?? stamps[0] });

    const plainText = body.replace(WORD_STAMP, "").trim();

    for (const stamp of stamps) {
      lines.push({
        t: stamp,
        text: plainText,
        words: words.length > 0 ? words : undefined,
      });
    }
  }

  const offsetTag = meta["offset"];
  if (offsetTag) {
    const parsed = Number(offsetTag);
    if (Number.isFinite(parsed)) offsetMs = parsed;
  }

  lines.sort((a, b) => a.t - b.t);

  return {
    lines,
    offsetMs,
    hasWordTiming: lines.some((line) => (line.words?.length ?? 0) > 0),
    synced: lines.length > 0,
    meta,
  };
}

/** Index of the line being sung at `timeMs`, or -1 before the first line. */
export function lineIndexAt(lines: LyricLine[], timeMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= timeMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** 0..1 progress through a line, ending when the next line starts. */
export function lineProgress(lines: LyricLine[], index: number, timeMs: number): number {
  if (index < 0 || index >= lines.length) return 0;
  const start = lines[index].t;
  const next = lines[index + 1];
  const end = next ? next.t : start + 4000;
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (timeMs - start) / (end - start)));
}

/** 0..1 progress across a line's words when word timings exist. */
export function wordProgress(words: LyricWord[], timeMs: number): number {
  if (words.length === 0) return 0;
  if (timeMs < words[0].t) return 0;
  let sung = 0;
  for (let i = 0; i < words.length; i++) {
    const start = words[i].t;
    const end = words[i + 1]?.t ?? start + 400;
    if (timeMs >= end) {
      sung += 1;
    } else if (timeMs >= start) {
      sung += end > start ? (timeMs - start) / (end - start) : 1;
    }
  }
  return Math.min(1, sung / words.length);
}
