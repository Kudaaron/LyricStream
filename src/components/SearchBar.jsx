import { useState, useRef, useEffect, useCallback } from 'react';
import { useAudioRecognition } from '../hooks/useAudioRecognition';
import { autocompleteLRCLib } from '../api/lrclib';

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

export default function SearchBar({
  onSearch,
  onArtistSearch,
  onYoutubeUrlSearch,
  onSongIdentified,
  onFocusChange,
  onBeforeSearch,
}) {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState('song');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1); // keyboard nav
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const latestReqId = useRef(0); // replaces AbortController — avoids the
  // CORS-blocked abort that caused 503 errors

  const {
    status: idStatus, error: idError, secondsLeft: idSecondsLeft,
    listen: idListen, stopEarly: idStopEarly, reset: idReset,
  } = useAudioRecognition();

  // Fetch suggestions from LRCLIB as user types — skipped entirely in
  // YouTube-URL mode. Goes through the health-breaker so a rate-limited
  // LRCLIB is never hit again.
  const fetchSuggestions = useCallback(async (val) => {
    if (searchMode === 'youtube' || !val || val.length < 2) {
      setSuggestions([]); setOpen(false); setLoadingSuggestions(false);
      return;
    }

    // Increment request ID; any earlier in-flight call that resolves
    // later will see its ID is stale and discard its result.
    const reqId = ++latestReqId.current;

    setLoadingSuggestions(true);

    try {
      // Uses the health-checked wrapper — never calls LRCLIB when it
      // is rate-limited or throwing 503s.
      const data = await autocompleteLRCLib(val);

      // Discard if a newer request already arrived
      if (reqId !== latestReqId.current) return;

      if (!Array.isArray(data) || !data.length) {
        setSuggestions([]); setOpen(false);
        return;
      }

      // Deduplicate by title+artist
      const seen = new Set();
      const remote = [];
      for (const r of data) {
        if (!r.title || !r.artist) continue;
        const key = `${r.title.toLowerCase()}::${r.artist.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        remote.push({
          label: `${r.title} — ${r.artist}`,
          query: `${r.title} - ${r.artist}`,
          title: r.title,
          artist: r.artist,
          album: r.album || '',
          hasSynced: !!r.hasSynced,
        });
        if (remote.length >= 8) break;
      }

      setSuggestions(remote);
      setOpen(remote.length > 0);
      setActiveIdx(-1);
    } catch {
      if (reqId !== latestReqId.current) return;
      setSuggestions([]);
      setOpen(false);
    } finally {
      if (reqId === latestReqId.current) setLoadingSuggestions(false);
    }
  }, [searchMode]);

  // 350 ms debounce — fast enough to feel live, slow enough to avoid
  // hitting LRCLIB on every keystroke.
  const debouncedFetch = useDebounce(fetchSuggestions, 350);

  const handleInput = (val) => {
    setQuery(val);
    debouncedFetch(val);
  };

  const submit = (q) => {
    const v = (q ?? query).trim();
    if (!v) return;
    setQuery(v);
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    latestReqId.current++; // discard any pending suggestion fetch
    onFocusChange?.(false);
    onBeforeSearch?.();

    if (searchMode === 'artist') onArtistSearch(v);
    else if (searchMode === 'youtube') onYoutubeUrlSearch(v);
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
        onFocusChange?.(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onFocusChange]);

  // Reset suggestions when mode changes
  useEffect(() => {
    setSuggestions([]); setOpen(false); setActiveIdx(-1);
  }, [searchMode]);

  const handleMicClick = () => {
    if (idStatus === 'listening') {
      idStopEarly();
      return;
    }
    if (idStatus === 'idle' || idStatus === 'error') {
      setOpen(false);
      latestReqId.current++; // discard any pending suggestion fetch
      idListen((result) => onSongIdentified?.(result));
    }
  };

  const idPanelOpen = idStatus !== 'idle';
  const placeholders = {
    song: 'Song title or "Song - Artist"\u2026',
    artist: 'Artist name \u2014 e.g. "Ed Sheeran"',
    youtube: 'Paste a YouTube video URL\u2026',
  };

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
        <button
          className={`search-mode-btn${searchMode === 'youtube' ? ' active' : ''}`}
          onClick={() => setSearchMode('youtube')}
        >
          <i className="ti ti-brand-youtube" /> YouTube link
        </button>
      </div>

      <div className="search-bar-wrap" ref={wrapRef}>
        <div className="search-bar">
          <i className={`ti ${searchMode === 'artist' ? 'ti-microphone-2' : searchMode === 'youtube' ? 'ti-brand-youtube' : 'ti-search'} search-icon`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={placeholders[searchMode]}
            autoComplete="off"
            spellCheck="false"
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              suggestions.length && searchMode !== 'youtube' && setOpen(true);
              onFocusChange?.(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />

          {/* Clear button */}
          {query && (
            <button
              className="search-clear"
              onClick={() => {
                latestReqId.current++;
                setQuery('');
                setSuggestions([]);
                setOpen(false);
                setActiveIdx(-1);
                inputRef.current?.focus();
              }}
              title="Clear"
            >
              <i className="ti ti-x" />
            </button>
          )}

          {loadingSuggestions && <span className="search-loading-dot" />}

          {searchMode !== 'youtube' && (
            <button
              className={`search-mic-btn ${idStatus === 'listening' ? 'listening' : ''} ${idStatus === 'verifying' || idStatus === 'processing' ? 'processing' : ''}`}
              onClick={handleMicClick}
              disabled={idStatus === 'verifying' || idStatus === 'processing'}
              title={idStatus === 'listening' ? 'Stop listening' : 'Identify a song playing nearby'}
              type="button"
            >
              {idStatus === 'listening' && (
                <>
                  <span className="search-mic-ring ring1" />
                  <span className="search-mic-ring ring2" />
                </>
              )}
              <i className={`ti ${idStatus === 'verifying' || idStatus === 'processing' ? 'ti-loader-2 spin' : 'ti-microphone'}`} />
            </button>
          )}

          <button className="btn-primary" onClick={() => submit()}>
            {searchMode === 'artist' ? 'Find songs' : searchMode === 'youtube' ? 'Fetch' : 'Search'}
          </button>
        </div>

        {idPanelOpen && (
          <div className="suggestions-dropdown id-status-panel">
            <div className="id-status-icon">
              <i className={`ti ${idStatus === 'error' ? 'ti-alert-triangle' : idStatus === 'verifying' ? 'ti-shield-check' : 'ti-microphone'}`} />
            </div>
            <p className="id-status-text">
              {idStatus === 'verifying' && "Verifying you\u2019re human\u2026"}
              {idStatus === 'listening' && `Listening\u2026 ${idSecondsLeft}s`}
              {idStatus === 'processing' && 'Identifying song\u2026'}
              {idStatus === 'error' && idError}
            </p>
            {idStatus === 'error' && (
              <button className="song-id-retry" onClick={idReset}>
                <i className="ti ti-refresh" /> Try again
              </button>
            )}
          </div>
        )}

        {!idPanelOpen && open && suggestions.length > 0 && (
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
              <i className="ti ti-keyboard" /> \u2191\u2193 navigate \u00b7 Enter select \u00b7 Esc close
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>
        {searchMode === 'artist' && 'Browse all songs by an artist and pick one'}
        {searchMode === 'song' && 'Suggestions from LRCLIB as you type'}
        {searchMode === 'youtube' && "For songs our search can\u2019t find on YouTube \u2014 we\u2019ll fetch lyrics from LRCLIB separately"}
      </div>
    </div>
  );
}