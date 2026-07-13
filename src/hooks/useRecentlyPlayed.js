import { useState, useCallback } from "react";

const STORAGE_KEY = "ls_recently_played";
const MAX_ENTRIES = 20;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persist(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function useRecentlyPlayed() {
  const [recentlyPlayed, setRecentlyPlayed] = useState(load);

  // Adds (or, if already present, moves to the front of) a song. Keeps
  // the whole song object — title, artist, duration, lyrics — so
  // replaying from this list is instant and never needs a re-fetch.
  const add = useCallback((song) => {
    if (!song?.title) return;
    setRecentlyPlayed((prev) => {
      const withoutDupe = prev.filter((s) => s.title !== song.title);
      const entry = {
        title: song.title,
        artist: song.artist || "",
        duration: song.duration || 0,
        lyrics: song.lyrics || [],
        genre: song.genre || "",
        year: song.year || "",
        spotify: song.spotify || null,
      };
      const next = [entry, ...withoutDupe].slice(0, MAX_ENTRIES);
      persist(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecentlyPlayed([]);
    persist([]);
  }, []);

  return { recentlyPlayed, add, clear };
}
