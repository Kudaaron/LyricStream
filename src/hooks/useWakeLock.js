import { useEffect } from "react";

export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return undefined;

    let lock = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener?.("release", () => {
          lock = null;
        });
      } catch {
        // Denied (battery saver, insecure context, …): nothing else to do.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !lock && !cancelled) {
        acquire();
      }
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      try {
        lock?.release();
      } catch {
        // ignore
      }
      lock = null;
    };
  }, [active]);
}
