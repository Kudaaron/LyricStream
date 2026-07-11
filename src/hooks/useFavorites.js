import { useState, useCallback } from "react";

const STORAGE_KEY = "ls_favorites";

// Old versions of this app stored favorites as an array of plain title
// strings. This migrates any old entries found in localStorage into the
// new object shape so nobody's saved favourites disappear.
function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((item) =>
      typeof item === "string"
        ? { title: item, artist: "", duration: 0, lyrics: [] }
        : item,
    );
  } catch {
    return [];
  }
}

function persist(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(loadFavorites);

  // Accepts either:
  //  - a full song object (title, artist, duration, lyrics, ...) — caches
  //    the whole thing so playing it back later never needs a re-fetch
  //  - a plain title string — used when removing a favourite, where only
  //    the title is needed to find and drop the matching entry
  const toggle = useCallback((songOrTitle) => {
    const title =
      typeof songOrTitle === "string" ? songOrTitle : songOrTitle.title;

    setFavorites((prev) => {
      const exists = prev.some((f) => f.title === title);
      let next;

      if (exists) {
        next = prev.filter((f) => f.title !== title);
      } else {
        const entry =
          typeof songOrTitle === "string"
            ? { title, artist: "", duration: 0, lyrics: [] }
            : {
                title: songOrTitle.title,
                artist: songOrTitle.artist || "",
                duration: songOrTitle.duration || 0,
                lyrics: songOrTitle.lyrics || [],
                genre: songOrTitle.genre || "",
                year: songOrTitle.year || "",
                spotify: songOrTitle.spotify || null,
              };
        next = [...prev, entry];
      }

      persist(next);
      return next;
    });
  }, []);

  const isFav = useCallback(
    (title) => favorites.some((f) => f.title === title),
    [favorites],
  );

  return { favorites, toggle, isFav };
}
