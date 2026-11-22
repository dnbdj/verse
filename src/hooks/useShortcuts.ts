import { useEffect, useRef } from "react";
import type { Player } from "./usePlayer";

type Options = {
  player: Player;
  overlayOpen: boolean;
  onToggleOverlay: () => void;
  onCloseOverlay: () => void;
  /** Alt+1…9 opens the same pinned service shown at that position in the sidebar. */
  onQuickLaunch: (index: number) => void;
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

/** Transport shortcuts plus Alt+1…9 quick launch for the sidebar's pinned services. */
export function useShortcuts({
  player,
  overlayOpen,
  onToggleOverlay,
  onCloseOverlay,
  onQuickLaunch,
}: Options) {
  const lastVolume = useRef(0.85);
  // The player object is rebuilt on every tick, so keep it in a ref and subscribe once.
  const live = useRef({ player, overlayOpen, onToggleOverlay, onCloseOverlay, onQuickLaunch });
  live.current = { player, overlayOpen, onToggleOverlay, onCloseOverlay, onQuickLaunch };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const {
        player: current,
        overlayOpen: open,
        onToggleOverlay: toggle,
        onCloseOverlay: close,
        onQuickLaunch: quickLaunch,
      } = live.current;

      if (event.metaKey) return;

      if (event.altKey) {
        const digit = /^Digit([1-9])$/.exec(event.code);
        if (
          digit &&
          !event.ctrlKey &&
          !isTyping(event.target) &&
          !isTyping(document.activeElement)
        ) {
          event.preventDefault();
          quickLaunch(Number(digit[1]) - 1);
        }
        return;
      }

      if (event.key === "Escape" && open) {
        close();
        return;
      }

      // Never steal keys from the search field, rename box or a dialog input.
      if (isTyping(event.target) || isTyping(document.activeElement)) return;

      const { position, duration, volume } = current;
      const clamp = (value: number) =>
        duration > 0 ? Math.min(duration, Math.max(0, value)) : Math.max(0, value);

      switch (event.key) {
        case " ":
          event.preventDefault();
          current.toggle();
          break;
        case "k":
        case "K":
          // Ctrl/⌘K belongs to the command palette.
          if (event.ctrlKey) return;
          event.preventDefault();
          current.toggle();
          break;
        case "ArrowRight":
          event.preventDefault();
          if (event.ctrlKey) current.changeVolume(Math.min(1, volume + 0.05));
          else if (event.shiftKey) current.next();
          else current.seek(clamp(position + 5000));
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (event.ctrlKey) current.changeVolume(Math.max(0, volume - 0.05));
          else if (event.shiftKey) current.previous();
          else current.seek(clamp(position - 5000));
          break;
        case "ArrowUp":
          event.preventDefault();
          current.changeVolume(Math.min(1, volume + 0.05));
          break;
        case "ArrowDown":
          event.preventDefault();
          current.changeVolume(Math.max(0, volume - 0.05));
          break;
        case "m":
        case "M":
          event.preventDefault();
          if (volume > 0) {
            lastVolume.current = volume;
            current.changeVolume(0);
          } else {
            current.changeVolume(lastVolume.current || 0.85);
          }
          break;
        case "s":
        case "S":
          current.toggleShuffle();
          break;
        case "r":
        case "R":
          current.cycleRepeat();
          break;
        case "l":
        case "L":
          event.preventDefault();
          toggle();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
