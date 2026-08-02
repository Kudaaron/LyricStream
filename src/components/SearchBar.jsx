import { useState, useRef, useEffect, useCallback } from 'react';

const QUICK_TAGS = [
  'Blinding Lights', 'Shape of You', 'Bohemian Rhapsody',
  'Stay', 'Levitating', 'Watermelon Sugar',
];

// Debounce helper — waits `delay` ms after the last call before firing
function useDebounce(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function SearchBar({ onSearch, onArtistSearch }) {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState('song');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1); // keyboard nav
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null); // cancel in-flight requests

  // Fetch suggestions from LRCLIB as user types
  const fetchSuggestions = useCallback(async (val) => {
    if (!val || val.length < 2) {
      setSuggestions([]); setOpen(false); setLoadingSuggestions(false);
      return;
    }

    // Cancel any previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoadingSuggestions(true);

    try {
      const endpoint = `https://lrclib.net/api/search?q=${encodeURIComponent(val)}`;

      const res = await fetch(endpoint, { signal: abortRef.current.signal });
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('bad response');

      // Deduplicate by title+artist
      const seen = new Set();
      const remote = [];
      for (const r of data) {
        if (!r.trackName || !r.artistName) continue;
        const key = `${r.trackName.toLowerCase()}::${r.artistName.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        remote.push({
          label: `${r.trackName} — ${r.artistName}`,
          query: `${r.trackName} - ${r.artistName}`,
          title: r.trackName,
          artist: r.artistName,
          album: r.albumName || '',
          hasSynced: !!r.syncedLyrics,
        });
        if (remote.length >= 8) break;
      }

      setSuggestions(remote);
      setOpen(remote.length > 0);
      setActiveIdx(-1);
    } catch (err) {
      if (err.name === 'AbortError') return; // cancelled — ignore
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [searchMode]);

  const debouncedFetch = useDebounce(fetchSuggestions, 280);

  const handleInput = (val) => {
    setQuery(val);
    debouncedFetch(val);
  };

  const submit = (q) => {
    const v = (q ?? query).trim();
    if (!v) return;
    setQuery(v);
    setOpen(false);
    setActiveIdx(-1);
    if (abortRef.current) abortRef.current.abort();
    if (searchMode === 'artist') onArtistSearch(v);
    else onSearch(v);
  };

  const pickSuggestion = (s) => {
    if (searchMode === 'artist') {
      setQuery(s.artist);
      setOpen(false);
      onArtistSearch(s.artist);
    } else {
      submit(s.query);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Enter') submit();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        pickSuggestion(suggestions[activeIdx]);
      } else {
        submit();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset suggestions when mode changes
  useEffect(() => {
    setSuggestions([]); setOpen(false); setActiveIdx(-1);
  }, [searchMode]);

  return (
    <div>
      {/* Mode toggle */}
      <div className="search-mode-toggle">
        <button
          className={`search-mode-btn${searchMode === 'song' ? ' active' : ''}`}
          onClick={() => setSearchMode('song')}
        >
          <i className="ti ti-music" /> By song
        </button>
        <button
          className={`search-mode-btn${searchMode === 'artist' ? ' active' : ''}`}
          onClick={() => setSearchMode('artist')}
        >
          <i className="ti ti-microphone-2" /> By artist
        </button>
      </div>

      <div className="search-bar-wrap" ref={wrapRef}>
        <div className="search-bar">
          <i className={`ti ${searchMode === 'artist' ? 'ti-microphone-2' : 'ti-search'} search-icon`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={
              searchMode === 'artist'
                ? 'Artist name — e.g. "Ed Sheeran"'
                : 'Song title or "Song - Artist"…'
            }
            autoComplete="off"
            spellCheck="false"
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length && setOpen(true)}
          />

          {/* Clear button */}
          {query && (
            <button
              className="search-clear"
              onClick={() => { setQuery(''); setSuggestions([]); setOpen(false); inputRef.current?.focus(); }}
              title="Clear"
            >
              <i className="ti ti-x" />
            </button>
          )}

          {/* Loading dot while fetching suggestions */}
          {loadingSuggestions && <span className="search-loading-dot" />}

          <button className="btn-primary" onClick={() => submit()}>
            {searchMode === 'artist' ? 'Find songs' : 'Search'}
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {open && suggestions.length > 0 && (
          <div className="suggestions-dropdown">
            <div className="suggestion-group-label">
              <i className="ti ti-world" /> From LRCLIB
            </div>

            {suggestions.map((s, i) => (
              <div
                key={i}
                className={`suggestion-item${i === activeIdx ? ' suggestion-active' : ''}`}
                onMouseDown={() => pickSuggestion(s)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <div className="suggestion-icon">
                  <i className="ti ti-brand-spotify" />
                </div>
                <div className="suggestion-text">
                  <span className="suggestion-title">{s.title}</span>
                  <span className="suggestion-artist">{s.artist}</span>
                </div>
                {s.hasSynced && (
                  <span className="suggestion-synced-dot" title="Has synced lyrics" />
                )}
              </div>
            ))}

            <div className="suggestion-footer">
              <i className="ti ti-keyboard" /> ↑↓ navigate · Enter select · Esc close
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>
        {searchMode === 'artist'
          ? 'Browse all songs by an artist and pick one'
          : <>Suggestions from LRCLIB as you type</>}
      </div>

      {searchMode === 'song' && (
        <div className="quick-tags">
          {QUICK_TAGS.map(tag => (
            <span key={tag} className="tag" onClick={() => submit(tag)}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}