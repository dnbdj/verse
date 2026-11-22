import { CloseIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
};

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Transport",
    rows: [
      ["Space / K", "Play or pause"],
      ["← / →", "Seek 5 seconds"],
      ["↑ / ↓", "Volume up / down"],
      ["M", "Mute"],
      ["S", "Shuffle"],
      ["R", "Cycle repeat"],
      ["L", "Now playing"],
    ],
  },
  {
    title: "Everywhere",
    rows: [
      ["⌘K / Ctrl K", "Search and commands"],
      ["?", "This sheet"],
      ["Esc", "Close the top panel"],
    ],
  },
  {
    title: "Playlists",
    rows: [
      ["Drag", "Reorder tracks in the playlist view"],
      ["Alt + ↑ / ↓", "Move the focused playlist row"],
      ["⌘K → Rename", "Rename a playlist in place"],
    ],
  },
  {
    title: "Services",
    rows: [
      ["Alt + 1…9", "Launch a pinned service"],
      ["Pin", "Keeps a service on top and in the sidebar"],
      ["Paste", "Reads a share link from the clipboard"],
      ["← / →", "Previous / next Deezer preview"],
    ],
  },
];

/** `?` opens this; Esc or a click on the scrim closes it. */
export function ShortcutsOverlay({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-scrim shortcuts-scrim" onClick={onClose}>
      <div
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shortcuts-head">
          <div>
            <div className="shortcuts-title">Keyboard shortcuts</div>
            <div className="shortcuts-sub">
              Local playback responds everywhere except while you are typing in a field.
            </div>
          </div>
          <button className="btn-icon" title="Close" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="shortcuts-grid">
          {GROUPS.map((group) => (
            <section key={group.title} className="shortcuts-group">
              <div className="shortcuts-group-title">{group.title}</div>
              {group.rows.map(([keys, action]) => (
                <div className="shortcut-row" key={`${group.title}-${keys}-${action}`}>
                  <kbd>{keys}</kbd>
                  <span>{action}</span>
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="shortcuts-foot">
          Press <kbd>?</kbd> again or <kbd>Esc</kbd> to dismiss.
        </div>
      </div>
    </div>
  );
}
