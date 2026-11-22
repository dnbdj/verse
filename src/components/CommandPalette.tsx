import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "./icons";

export type Command = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  commands: Command[];
  onClose: () => void;
};

/**
 * One keystroke (⌘K / Ctrl+K) to everything: views, playlists, services, tracks,
 * themes and gradients. Results rank prefix matches above substring matches.
 */
export function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const frame = requestAnimationFrame(() => input.current?.focus());
    const timer = window.setTimeout(() => input.current?.focus(), 40);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      const order = ["Go", "Albums", "Artists", "Playlists", "Play", "Services", "Pins"];
      const rank = (group: string) => {
        const index = order.indexOf(group);
        return index < 0 ? order.length : index;
      };
      // Stable sort: keeps each group's own order, but lifts the library above services.
      return [...commands].sort((a, b) => rank(a.group) - rank(b.group));
    }
    const scored: { command: Command; score: number }[] = [];
    for (const command of commands) {
      const label = command.label.toLowerCase();
      const haystack = `${label} ${command.hint ?? ""} ${command.group}`.toLowerCase();
      if (!haystack.includes(needle)) continue;
      scored.push({
        command,
        score: label.startsWith(needle) ? 0 : label.includes(needle) ? 1 : 2,
      });
    }
    return scored.sort((a, b) => a.score - b.score).map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const active = Math.min(index, Math.max(0, results.length - 1));
  const visible = results.slice(0, 40);

  const run = (command: Command | undefined) => {
    if (!command) return;
    command.run();
    onClose();
  };

  return (
    <div className="modal-scrim palette-scrim" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-search">
          <SearchIcon size={16} />
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex(Math.min(visible.length - 1, active + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex(Math.max(0, active - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(results[active]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Jump to a song, album, service or setting…"
            spellCheck={false}
            aria-label="Search commands"
          />
          <span className="palette-kbd">Esc</span>
        </div>

        <div className="palette-list">
          {visible.map((command, position) => (
            <button
              key={command.id}
              className="palette-row"
              data-active={position === active}
              onMouseEnter={() => setIndex(position)}
              onClick={() => run(command)}
            >
              <span className="palette-group">{command.group}</span>
              <span className="palette-label">{command.label}</span>
              {command.hint && <span className="palette-hint">{command.hint}</span>}
            </button>
          ))}
          {visible.length === 0 && (
            <div className="palette-empty">Nothing matches “{query.trim()}”.</div>
          )}
        </div>

        <div className="palette-foot">
          <span>↑↓ move</span>
          <span>⏎ run</span>
          <span>Esc close</span>
          <span className="palette-count">{results.length} results</span>
        </div>
      </div>
    </div>
  );
}
