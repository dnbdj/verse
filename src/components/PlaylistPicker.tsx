import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { Playlist } from "../lib/types";
import { CheckIcon, ChevronIcon, PlusIcon } from "./icons";

type Props = {
  /** Every Verse playlist, local songs and remote saves alike. */
  playlists: Playlist[];
  /** Add the song to an existing playlist. Throwing keeps the menu open with the error. */
  onPick: (playlistId: string) => Promise<void> | void;
  /** Create a playlist and put this song in it in one step. */
  onCreate: (name: string) => Promise<void> | void;
  label?: string;
};

const countOf = (playlist: Playlist) =>
  playlist.trackIds.length + (playlist.remoteTracks?.length ?? 0);

/**
 * A compact arrow-and-menu for saving any song, from any service, into one of the
 * listener's Verse playlists. The menu is portalled so a scrolling panel can never
 * clip it, and it closes on Escape or a click anywhere else.
 */
export function PlaylistPicker({
  playlists,
  onPick,
  onCreate,
  label = "Add to a playlist",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef(0);
  const menuId = useId();

  const close = () => {
    setOpen(false);
    setError(null);
    setName("");
  };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 388)),
        left: Math.max(8, Math.min(rect.right - 258, window.innerWidth - 266)),
      });
    };
    place();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || menu.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        trigger.current?.focus();
      }
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const finish = (label: string) => {
    close();
    setToast(`Added to ${label}`);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const pick = async (playlist: Playlist) => {
    setPending(playlist.id);
    setError(null);
    try {
      await onPick(playlist.id);
      finish(playlist.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(null);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setPending("__new__");
    setError(null);
    try {
      await onCreate(clean);
      finish(clean);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(null);
    }
  };

  const menuNode =
    open &&
    createPortal(
      <div
        ref={menu}
        id={menuId}
        className="playlist-menu"
        role="dialog"
        aria-label="Add to a Verse playlist"
        style={{ top: position.top, left: position.left } as CSSProperties}
      >
        <div className="playlist-menu-head">
          <span>Add to a Verse playlist</span>
          <span className="playlist-menu-count">{playlists.length}</span>
        </div>

        <div className="playlist-menu-list">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className="playlist-menu-item"
              disabled={pending !== null}
              onClick={() => void pick(playlist)}
            >
              <span className="playlist-menu-art" aria-hidden />
              <span className="playlist-menu-text">
                <span className="playlist-menu-name">{playlist.name}</span>
                <span className="playlist-menu-meta">
                  {countOf(playlist)} {countOf(playlist) === 1 ? "song" : "songs"}
                </span>
              </span>
              {pending === playlist.id ? (
                <span className="playlist-menu-spinner" aria-label="Adding" />
              ) : (
                <PlusIcon size={13} />
              )}
            </button>
          ))}
          {playlists.length === 0 && (
            <div className="playlist-menu-empty">
              One playlist can hold local songs, Deezer previews and Spotify saves together.
            </div>
          )}
        </div>

        <form className="playlist-menu-new" onSubmit={(event) => void create(event)}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New playlist name"
            maxLength={60}
            aria-label="New playlist name"
            spellCheck={false}
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!name.trim() || pending !== null}
            title="Create playlist and add this song"
          >
            {pending === "__new__" ? <span className="playlist-menu-spinner" /> : <PlusIcon size={13} />}
            {pending === "__new__" ? "Creating…" : "New"}
          </button>
        </form>

        {error && <div className="playlist-menu-error">{error}</div>}
      </div>,
      document.body,
    );

  return (
    <span className="playlist-picker">
      <button
        ref={trigger}
        className="btn-icon playlist-picker-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={label}
        onClick={() => {
          setOpen((value) => !value);
          setError(null);
        }}
      >
        <ChevronIcon size={13} dir="down" />
      </button>
      {menuNode}
      {toast &&
        createPortal(
          <div className="playlist-picker-toast" role="status">
            <CheckIcon size={12} />
            {toast}
          </div>,
          document.body,
        )}
    </span>
  );
}
