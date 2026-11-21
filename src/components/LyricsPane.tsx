import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { lineProgress, type LyricLine } from "../lib/lrc";

type Props = {
  lines: LyricLine[];
  active: number;
  timeMs: number;
  plain: string | null;
  loading: boolean;
  source: string;
  onSeek: (ms: number) => void;
};

export function LyricsPane({ lines, active, timeMs, plain, loading, source, onSeek }: Props) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const element = active >= 0 ? lineRefs.current[active] : null;
    if (!element) {
      inner.style.transform = "translateY(0px)";
      return;
    }
    const target = inner.clientHeight * 0.34 - element.offsetTop;
    inner.style.transform = `translateY(${target}px)`;
  }, [active, lines.length]);

  if (loading) {
    return (
      <div className="lyrics-pane">
        <div className="lyrics-empty">Looking for lyrics…</div>
      </div>
    );
  }

  // Untimed lyrics still deserve the pane: readable size, one line per row, scrollable.
  if (lines.length === 0 && plain) {
    const plainLines = plain
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line, index, all) => line.trim() !== "" || all[index - 1]?.trim() !== "");
    return (
      <div className="lyrics-pane">
        <div className="lyrics-plain">
          <div className="lyrics-plain-label">Lyrics · not timed</div>
          {plainLines.map((line, index) =>
            line.trim() ? (
              <p key={`${index}-${line.slice(0, 12)}`}>{line}</p>
            ) : (
              <div key={`gap-${index}`} className="lyrics-plain-gap" />
            ),
          )}
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="lyrics-pane">
        <div className="lyrics-empty">
          No lyrics for this track yet.
          <br />
          They come from LRCLIB first, then a sidecar .lrc, then you can paste your own.
          {source === "none" ? "" : ` (source: ${source})`}
        </div>
      </div>
    );
  }

  return (
    <div className="lyrics-pane">
      <div className="lyrics-scroll" ref={innerRef}>
        {lines.map((line, index) => {
          const isActive = index === active;
          const progress = lineProgress(lines, index, timeMs);
          return (
            <button
              key={`${line.t}-${index}`}
              ref={(node) => {
                lineRefs.current[index] = node;
              }}
              className="lyric-line"
              data-active={isActive}
              data-past={index < active}
              onClick={() => onSeek(line.t)}
              title="Jump to this line"
            >
              {line.words && line.words.length > 0 ? (
                line.words.map((word, wordIndex) => {
                  const end = line.words?.[wordIndex + 1]?.t ?? word.t + 380;
                  const wordProgress =
                    timeMs <= word.t
                      ? 0
                      : timeMs >= end
                        ? 1
                        : (timeMs - word.t) / Math.max(1, end - word.t);
                  return (
                    <span
                      key={`${word.t}-${wordIndex}`}
                      className="lyric-fill lyric-word"
                      style={{ "--p": `${wordProgress * 100}%` } as CSSProperties}
                    >
                      {word.text}
                    </span>
                  );
                })
              ) : (
                <span
                  className="lyric-fill"
                  style={{ "--p": `${progress * 100}%` } as CSSProperties}
                >
                  {line.text}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
