import { useEffect } from 'react';
import SearchBar from './SearchBar';
import LyricsPanel from './LyricsPanel';
import PlayerCard from './PlayerCard';
import SongCard from './SongCard';
import SongPicker from './SongPicker';
import { getAllSongs } from '../data/songs';

export default function SearchTab({
  player, loading, loadingMsg, onSearch, onArtistSearch,
  pickerResults, pickerQuery, onPickSong, onCancelPicker, onBackToResults,
  isFav, onToggleFav, onCopy, onOpenSpotify,
  favorites, recentlyPlayed, isActiveTab,
}) {
  const {
    song, isPlaying, currentSec, duration, progress,
    activeLyricIdx, introSecsRemaining,
    togglePlay, seekTo, seekByPercent, restart, skipForward,
    speed, setSpeed, volume, setVolume,
    mode, videoId, loading: playerLoading,
    lyricOffset, setLyricOffset,
    onYTReady, onYTTimeUpdate, onYTStateChange,
    manualSetVideoId, loadSong,
  } = player;

  const favTitles = new Set(favorites.map(f => f.title));
  const favSongs = getAllSongs().filter(s => favTitles.has(s.title));

  // Lock page scroll on mobile when player is active
  // This enables the full-viewport split layout (player top, lyrics bottom).
  // Gated on isActiveTab so this component (now permanently mounted to
  // keep playback alive across tabs) never locks scrolling on Favourites
  // or About just because a song happens to be loaded in the background.
  const playerActive = isActiveTab && !loading && !pickerResults && !!song;
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 600;

  // We use a class on <html> rather than JS scroll lock so CSS can
  // respond cleanly and it survives React re-renders without jank.
  if (typeof document !== 'undefined') {
    if (playerActive) {
      document.documentElement.classList.add('player-active');
    } else {
      document.documentElement.classList.remove('player-active');
    }
  }

  return (
    <div>
      {/* Hero */}
      <div className="search-hero">
        <h1 className="hero-title">Find lyrics for any song</h1>
        <p className="hero-sub">Powered by LRCLIB · Free · No API key needed</p>
        <SearchBar onSearch={onSearch} onArtistSearch={onArtistSearch} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>{loadingMsg || 'Fetching lyrics…'}</p>
        </div>
      )}

      {/* Song picker */}
      {!loading && pickerResults?.length > 0 && (
        <SongPicker
          results={pickerResults}
          query={pickerQuery}
          onPick={onPickSong}
          onCancel={onCancelPicker}
        />
      )}

      {/* Player */}
      {!loading && !pickerResults && song && (
        <div className="player-section">
          <div className="player-layout">
            <LyricsPanel
              song={song}
              activeLyricIdx={activeLyricIdx}
              introSecsRemaining={introSecsRemaining}
              isPlaying={isPlaying}
              currentSec={currentSec}
              lyricOffset={lyricOffset}
              onSetLyricOffset={setLyricOffset}
              onSeek={seekTo}
              isFav={isFav(song.title)}
              onToggleFav={() => onToggleFav(song)}
              onOpenSpotify={onOpenSpotify}
              onCopy={onCopy}
              onBackToResults={onBackToResults}
            />
            <div className="player-panel">
              <PlayerCard
                song={song}
                isPlaying={isPlaying}
                currentSec={currentSec}
                duration={duration}
                progress={progress}
                onTogglePlay={togglePlay}
                onRestart={restart}
                onSkipForward={skipForward}
                onSeekByPercent={seekByPercent}
                speed={speed}
                onSetSpeed={setSpeed}
                volume={volume}
                onSetVolume={setVolume}
                mode={mode}
                videoId={videoId}
                loading={playerLoading}
                lyricOffset={lyricOffset}
                onSetLyricOffset={setLyricOffset}
                onYTReady={onYTReady}
                onYTTimeUpdate={onYTTimeUpdate}
                onYTStateChange={onYTStateChange}
                onManualVideoId={manualSetVideoId}
              />
            </div>
          </div>
        </div>
      )}

      {/* Recently played */}
      {!pickerResults && recentlyPlayed.length > 0 && (
        <div className="fav-section">
          <h3 className="section-heading">
            <i className="ti ti-history" style={{ color: 'var(--accent)' }} />
            Recently played
          </h3>
          <div className="results-grid">
            {recentlyPlayed.map(s => (
              <SongCard key={s.title} song={s} onClick={loadSong} />
            ))}
          </div>
        </div>
      )}

      {/* Favourites */}
      {!pickerResults && favSongs.length > 0 && (
        <div className="fav-section">
          <h3 className="section-heading">
            <i className="ti ti-heart-filled" style={{ color: '#EF4444' }} />
            Your favourites
          </h3>
          <div className="results-grid">
            {favSongs.map(s => (
              <SongCard key={s.title} song={s} onClick={loadSong} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}