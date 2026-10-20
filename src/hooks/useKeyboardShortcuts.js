import { useEffect, useRef } from "react";

// Desktop shortcuts. Ignored while typing in a field, when a modifier key is
// held, or when `enabled` is false (e.g. a modal is open).
//
//   Space / K  play-pause     ← / →  seek 5s       ↑ / ↓  volume
//   N  next    P  previous    M  mute              F  favourite
//   Q  queue   ?  show help
export function useKeyboardShortcuts(handlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target;
      const tag = target?.tagName;

      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      // Space/Enter on a focused button should activate that button only.
      if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;

      const h = ref.current;
      let handled = true;

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          h.togglePlay?.();
          break;
        case "ArrowLeft":
          h.seekBy?.(-5);
          break;
        case "ArrowRight":
          h.seekBy?.(5);
          break;
        case "ArrowUp":
          h.volumeBy?.(5);
          break;
        case "ArrowDown":
          h.volumeBy?.(-5);
          break;
        case "n":
        case "N":
          h.next?.();
          break;
        case "p":
        case "P":
          h.prev?.();
          break;
        case "m":
        case "M":
          h.mute?.();
          break;
        case "f":
        case "F":
          h.favourite?.();
          break;
        case "q":
        case "Q":
          h.queue?.();
          break;
        case "?":
          h.help?.();
          break;
        default:
          handled = false;
      }

      if (handled) e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
