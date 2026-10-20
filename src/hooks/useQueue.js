import { useState, useCallback, useRef } from "react";

const STORAGE_KEY = "ls_queue";
const MAX_ENTRIES = 30;

export const sameSong = (a, b) =>
  (a?.title || "").toLowerCase() === (b?.title || "").toLowerCase() &&
  (a?.artist || "").toLowerCase() === (b?.artist || "").toLowerCase();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((s) => s?.title) : [];
  } catch {
    return [];
  }
}

function persist(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full / unavailable
  }
}

// Keeps whatever we already know (lyrics, video id) so playing it later is
// instant; anything missing is resolved when the song's turn comes.
function toEntry(song) {
  return {
    title: song.title,
    artist: song.artist || "",
    duration: song.duration || 0,
    lyrics: song.lyrics || [],
    genre: song.genre || "",
    year: song.year || "",
    spotify: song.spotify || null,
    youtubeVideoId: song.youtubeVideoId || null,
    youtubeTitle: song.youtubeTitle || "",
  };
}

export function useQueue() {
  const [queue, setQueue] = useState(load);
  const ref = useRef(queue);

  const commit = useCallback((next) => {
    ref.current = next;
    setQueue(next);
    persist(next);
  }, []);

  // Returns "added" | "duplicate" | "full" | "invalid"
  const add = useCallback(
    (song) => {
      if (!song?.title) return "invalid";
      if (ref.current.some((s) => sameSong(s, song))) return "duplicate";
      if (ref.current.length >= MAX_ENTRIES) return "full";
      commit([...ref.current, toEntry(song)]);
      return "added";
    },
    [commit],
  );

  const removeAt = useCallback(
    (index) => commit(ref.current.filter((_, i) => i !== index)),
    [commit],
  );

  const clear = useCallback(() => commit([]), [commit]);

  // Removes and returns the first entry (or null).
  const shift = useCallback(() => {
    if (!ref.current.length) return null;
    const [first, ...rest] = ref.current;
    commit(rest);
    return first;
  }, [commit]);

  const size = useCallback(() => ref.current.length, []);

  return { queue, add, removeAt, clear, shift, size };
}
