import { useState, useCallback } from 'react';

export function useFavorites() {
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ls_favorites') || '[]'); } catch { return []; }
  });

  const save = (next) => {
    setFavorites(next);
    try { localStorage.setItem('ls_favorites', JSON.stringify(next)); } catch {}
  };

  const toggle = useCallback((title) => {
    setFavorites(prev => {
      const next = prev.includes(title)
        ? prev.filter(t => t !== title)
        : [...prev, title];
      try { localStorage.setItem('ls_favorites', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const isFav = useCallback((title) => favorites.includes(title), [favorites]);

  return { favorites, toggle, isFav };
}
