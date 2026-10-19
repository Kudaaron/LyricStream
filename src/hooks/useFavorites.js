import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ls_favorites';

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return raw.map((item) =>
      typeof item === 'string'
        ? { title: item, artist: '', duration: 0, lyrics: [] }
        : item
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
  const [favorites, setFavorites] = useState(load);

  // Accepts a full song object (caches everything, including
  // youtubeVideoId/youtubeTitle so replays use real YouTube playback
  // instead of falling back to iTunes preview) or a plain title string
  // (used for removal).
  const toggle = useCallback((songOrTitle) => {
    const title = typeof songOrTitle === 'string' ? songOrTitle : songOrTitle.title;

    setFavorites((prev) => {
      const exists = prev.some((f) => f.title === title);
      let next;

      if (exists) {
        next = prev.filter((f) => f.title !== title);
      } else {
        const entry =
          typeof songOrTitle === 'string'
            ? { title, artist: '', duration: 0, lyrics: [] }
            : {
                title: songOrTitle.title,
                artist: songOrTitle.artist || '',
                duration: songOrTitle.duration || 0,
                lyrics: songOrTitle.lyrics || [],
                genre: songOrTitle.genre || '',
                year: songOrTitle.year || '',
                spotify: songOrTitle.spotify || null,
                youtubeVideoId: songOrTitle.youtubeVideoId || null,
                youtubeTitle: songOrTitle.youtubeTitle || '',
              };
        next = [...prev, entry];
      }

      persist(next);
      return next;
    });
  }, []);

  const isFav = useCallback(
    (title) => favorites.some((f) => f.title === title),
    [favorites]
  );

  return { favorites, toggle, isFav };
}