import { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Navbar from './components/Navbar';
import FavouritesTab from './components/FavouritesTab';
import SearchTab from './components/SearchTab';
import AboutTab from './components/AboutTab';
import Toast from './components/Toast';

import { useTheme } from './hooks/useTheme';
import { usePlayer } from './hooks/usePlayer';
import { useFavorites } from './hooks/useFavorites';
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
  const player = usePlayer();
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
    const q = encodeURIComponent(`${player.song?.title || ''} ${player.song?.artist || ''}`);
    if (player.song?.spotify) window.open(player.song.spotify, '_blank');
    else window.open(`https://open.spotify.com/search/${q}`, '_blank');
  };

  const handleBackToResults = () => {
    if (lastPicker) {
      setPickerResults(lastPicker.results);
      setPickerQuery(lastPicker.query);
      player.loadSong(null);
    }
  };

  const handleToggleFav = (title) => {
    const wasF = isFav(title);
    toggleFav(title);
    showToast(wasF ? 'Removed from favourites' : '❤ Added to favourites');
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
        {activeTab === 'search' && (
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
          />
        )}
        {activeTab === 'about' && <AboutTab />}
        {activeTab === 'favourites' && (
          <FavouritesTab
            favorites={favorites}
            onPlaySong={async (song) => {
              setActiveTab('search');
              player.loadSong(null);
              await player.loadSong(song);
            }}
            onRemoveFav={(title) => {
              toggleFav(title);
              showToast('Removed from favourites');
            }}
          />
        )}
      </main>
      <Toast message={toast} />
      <Analytics />
    </>
  );
}