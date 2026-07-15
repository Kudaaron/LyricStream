import { useState, lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Navbar from './components/Navbar';
import FavouritesTab from './components/FavouritesTab';
import SearchTab from './components/SearchTab';
import Toast from './components/Toast';
import MiniPlayerBar from './components/MiniPlayerBar';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-loaded: About is rarely the first thing anyone opens, so it
// doesn't need to be in the initial JS bundle everyone downloads.
const AboutTab = lazy(() => import('./components/AboutTab'));

import { useTheme } from './hooks/useTheme';
import { usePlayer } from './hooks/usePlayer';
import { useFavorites } from './hooks/useFavorites';
import { useRecentlyPlayed } from './hooks/useRecentlyPlayed';
import { useToast } from './hooks/useToast';

import { findSongInLibrary } from './data/songs';
import {
  fetchLRCLibLyrics, searchLRCLib,
  searchLRCLibByArtist, searchLRCLibFuzzy,
  resolvePickedSong
} from './api/lrclib';

import './styles/main.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Searching…');
  const [pickerResults, setPickerResults] = useState(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [lastPicker, setLastPicker] = useState(null);

  const { theme, toggle: toggleTheme } = useTheme();
  const { recentlyPlayed, add: addRecentlyPlayed } = useRecentlyPlayed();
  const player = usePlayer({ onSongLoad: addRecentlyPlayed });
  const { favorites, toggle: toggleFav, isFav } = useFavorites();
  const { toast, showToast } = useToast();

  // ── Song search ──────────────────────────────────────────────────
  const handleSearch = async (query) => {
    setPickerResults(null);
    setLoading(true);
    setLoadingMsg('Searching…');
    player.loadSong(null);

    // 1. Built-in library
    const local = findSongInLibrary(query);
    if (local) {
      await player.loadSong(local);
      setLoading(false);
      return;
    }

    let title = query;
    let artist = '';
    if (query.includes(' - ')) {
      [title, artist] = query.split(' - ').map(s => s.trim());
    } else if (query.includes(' by ')) {
      [title, artist] = query.split(' by ').map(s => s.trim());
    }

    try {
      // 2. LRCLIB exact match
      if (artist) {
        setLoadingMsg('Fetching lyrics…');
        const result = await fetchLRCLibLyrics(title, artist);
        if (result?.lyrics?.length > 0) {
          await player.loadSong({ ...result, genre: '', year: '', spotify: null });
          setLoading(false);
          return;
        }
      }

      // 3. LRCLIB search
      setLoadingMsg('Searching lyrics database…');
      let results = await searchLRCLib(query);
      if (!results.length) results = await searchLRCLibFuzzy(title, artist);

      if (results.length === 0) {
        showNoLyricsFound(title, artist);
      } else if (results.length === 1) {
        await loadFromPick(results[0]);
        return;
      } else {
        setPickerResults(results);
        setPickerQuery(query);
        setLastPicker({ results, query });
      }
    } catch {
      showToast('Could not reach lyrics server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // ── Artist search ────────────────────────────────────────────────
  const handleArtistSearch = async (artistName) => {
    setPickerResults(null);
    setLoading(true);
    setLoadingMsg(`Finding songs by "${artistName}"…`);
    player.loadSong(null);
    try {
      const results = await searchLRCLibByArtist(artistName);
      if (!results.length) {
        showToast(`No songs found for "${artistName}" on LRCLIB.`);
      } else {
        setPickerResults(results);
        setPickerQuery(artistName);
        setLastPicker({ results, query: artistName });
      }
    } catch {
      showToast('Could not reach lyrics server.');
    } finally {
      setLoading(false);
    }
  };

  // ── Pick from list ───────────────────────────────────────────────
  const loadFromPick = async (pick) => {
    setPickerResults(null);
    setLoading(true);
    setLoadingMsg('Loading lyrics…');
    try {
      const result = await resolvePickedSong(pick);
      if (result?.lyrics?.length > 0) {
        await player.loadSong({ ...result, genre: '', year: '', spotify: null });
      } else {
        showNoLyricsFound(pick.title, pick.artist);
      }
    } catch {
      showToast('Could not load that song. Try another.');
    } finally {
      setLoading(false);
    }
  };

  const showNoLyricsFound = (title, artist) => {
    showToast('No lyrics found. Try "Song - Artist" format.');
    player.loadSong({
      title, artist: artist || 'Unknown',
      genre: '', year: '', duration: 0, spotify: null,
      isPlaceholder: true,
      lyrics: [
        { t: 0, l: '⚠ No lyrics found for this song.' },
        { t: 4, l: 'Try "Song Title - Artist Name" format' },
        { t: 8, l: 'or switch to "By artist" to browse their catalogue.' },
      ],
    });
  };

  const handleCopy = () => {
    if (!player.song) return;
    const text = player.song.lyrics.map(l => l.l).join('\n');
    navigator.clipboard?.writeText(text)
      .then(() => showToast('Lyrics copied!'))
      .catch(() => showToast('Copy failed'));
  };

  const handleOpenSpotify = () => {
    if (player.song?.spotify) {
      window.open(player.song.spotify, '_blank');
      return;
    }

    const q = `${player.song?.title || ''} ${player.song?.artist || ''}`.trim();
    const encoded = encodeURIComponent(q);
    // /tracks skips Spotify's mixed "Top Result / Songs / Albums" landing
    // page and goes straight to a scrollable list of matching tracks —
    // one tap to play instead of tap, scroll, tap.
    const webUrl = `https://open.spotify.com/search/${encoded}/tracks`;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
      window.open(webUrl, '_blank');
      return;
    }

    // On mobile, try handing off to the native Spotify app's own search
    // first — feels far snappier than a browser tab. If the app isn't
    // installed, the page never loses focus and we fall back to the
    // web link a moment later.
    const appUri = `spotify:search:${encoded}`;
    const fallback = setTimeout(() => {
      if (!document.hidden) window.open(webUrl, '_blank');
    }, 1200);
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(fallback);
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.location.href = appUri;
  };

  const handleBackToResults = () => {
    if (lastPicker) {
      setPickerResults(lastPicker.results);
      setPickerQuery(lastPicker.query);
      player.loadSong(null);
    }
  };

  // Accepts either a full song object (favouriting from the player, so the
  // exact lyrics get cached) or a plain title string (removing a favourite).
  const handleToggleFav = (songOrTitle) => {
    const title = typeof songOrTitle === 'string' ? songOrTitle : songOrTitle.title;
    const wasF = isFav(title);
    toggleFav(songOrTitle);
    showToast(wasF ? 'Removed from favourites' : '❤ Added to favourites');
  };

  // ── Play a favourited song ───────────────────────────────────────
  // Favourites only ever persist a title (see useFavorites). Built-in
  // songs come back from getAllSongs() with full lyrics already attached,
  // but anything found via search has no cached lyrics at all — so we
  // re-fetch from LRCLIB here, the same way a fresh search would, before
  // handing the song to the player. This is what actually stops the
  // blank-screen crash (LyricsPanel now also guards against missing
  // lyrics, but without this the song would still play with no lyrics).
  const handlePlayFavourite = async (song) => {
    setActiveTab('search');
    player.loadSong(null);

    if (song.lyrics?.length > 0) {
      await player.loadSong(song);
      return;
    }

    setLoading(true);
    setLoadingMsg('Loading lyrics…');
    try {
      let result = null;
      if (song.artist) {
        result = await fetchLRCLibLyrics(song.title, song.artist);
      }
      if (!result?.lyrics?.length) {
        const query = song.artist ? `${song.title} ${song.artist}` : song.title;
        const results = await searchLRCLib(query);
        if (results.length > 0) {
          result = await resolvePickedSong(results[0]);
        }
      }
      if (result?.lyrics?.length > 0) {
        await player.loadSong({ ...result, genre: '', year: '', spotify: null });
      } else {
        showNoLyricsFound(song.title, song.artist);
      }
    } catch {
      showToast('Could not load that song. Try another.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="main-content">
        {/* Always mounted — this is what keeps YouTube/audio playback
            alive when you switch to Favourites or About mid-song.
            When nothing is playing, a plain display:none is fine and
            cheap. When a song IS loaded, we use an off-screen (not
            display:none) technique instead, since display:none causes
            many mobile browsers to suspend/unload hidden video.
            Kept in its own error boundary so a crash elsewhere in the
            app can never take down the tab holding the live player. */}
        <ErrorBoundary message="The player hit a snag. Your other tabs are unaffected.">
          <div
            className={
              activeTab === 'search'
                ? ''
                : player.song
                  ? 'tab-offscreen'
                  : 'hidden'
            }
          >
            <SearchTab
              player={player}
              loading={loading}
              loadingMsg={loadingMsg}
              onSearch={handleSearch}
              onArtistSearch={handleArtistSearch}
              pickerResults={pickerResults}
              pickerQuery={pickerQuery}
              onPickSong={loadFromPick}
              onCancelPicker={() => setPickerResults(null)}
              onBackToResults={lastPicker ? handleBackToResults : null}
              isFav={isFav}
              onToggleFav={handleToggleFav}
              onCopy={handleCopy}
              onOpenSpotify={handleOpenSpotify}
              favorites={favorites}
              recentlyPlayed={recentlyPlayed}
              isActiveTab={activeTab === 'search'}
            />
          </div>
        </ErrorBoundary>
        {activeTab === 'about' && (
          <ErrorBoundary message="This page hit a snag.">
            <Suspense fallback={
              <div className="loading-state">
                <div className="spinner" />
                <p>Loading…</p>
              </div>
            }>
              <AboutTab />
            </Suspense>
          </ErrorBoundary>
        )}
        {activeTab === 'favourites' && (
          <ErrorBoundary message="This page hit a snag.">
            <FavouritesTab
              favorites={favorites}
              onPlaySong={handlePlayFavourite}
              onRemoveFav={(title) => {
                toggleFav(title);
                showToast('Removed from favourites');
              }}
            />
          </ErrorBoundary>
        )}
        <Footer activeTab={activeTab} onNavigate={setActiveTab} />
      </main>
      <ErrorBoundary message="">
        <MiniPlayerBar
          player={player}
          visible={!!player.song && activeTab !== 'search'}
          onExpand={() => setActiveTab('search')}
        />
      </ErrorBoundary>
      <Toast message={toast} />
      <Analytics />
    </>
  );
}