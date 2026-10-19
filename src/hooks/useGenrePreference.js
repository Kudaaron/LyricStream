import { useState, useCallback } from "react";

const GENRE_KEY = "ls_favorite_genre";
const AUTOPLAY_KEY = "ls_autoplay_enabled";

export function useGenrePreference() {
  const [favoriteGenre, setFavoriteGenreState] = useState(() => {
    try {
      return localStorage.getItem(GENRE_KEY) || "";
    } catch {
      return "";
    }
  });

  const [autoplayEnabled, setAutoplayEnabledState] = useState(() => {
    try {
      return localStorage.getItem(AUTOPLAY_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setFavoriteGenre = useCallback((genre) => {
    setFavoriteGenreState(genre);
    try {
      localStorage.setItem(GENRE_KEY, genre);
    } catch {}
  }, []);

  const setAutoplayEnabled = useCallback((enabled) => {
    setAutoplayEnabledState(enabled);
    try {
      localStorage.setItem(AUTOPLAY_KEY, String(enabled));
    } catch {}
  }, []);

  return {
    favoriteGenre,
    setFavoriteGenre,
    autoplayEnabled,
    setAutoplayEnabled,
  };
}
