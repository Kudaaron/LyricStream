import { useState } from 'react';
import SearchBar from './SearchBar';
import LyricsPanel from './LyricsPanel';
import PlayerCard from './PlayerCard';
import SongCard from './SongCard';
import SongPicker from './SongPicker';
import MiniPlayerBar from './MiniPlayerBar';

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

  // Uses the real cached favorite data directly (title, artist, and the
  // actual synced lyrics captured when it was favourited) rather than
  // cross-referencing the old hardcoded demo library — that cross-
  // reference was both showing dummy placeholder lyrics for any title
  // that happened to collide with a demo song, and silently hiding any
  // favourite that wasn't in that demo list at all.
  const [playerCollapsed, setPlayerCollapsed] = useState(false);

  const favSongs = favorites;

  // Recently Played / Favourites cards used to call loadSong directly,
  // jumping straight from the old song to the new one in a single
  // update. That skipped the clean "old song → nothing → new song" gap
  // the search flow already relies on to let React fully unmount the
  // previous panel before mounting the next — without it, both could
  // briefly end up rendered at once.
  const handleCardPlay = async (newSong) => {
    await loadSong(null);
    await loadSong(newSong);
  };

  // Lock page scroll on mobile when player is active
  // This enables the full-viewport split layout (player top, lyrics bottom).
  // Gated on isActiveTab so this component (now permanently mounted to
  // keep playback alive across tabs) never locks scrolling on Favourites
  // or About just because a song happens to be loaded in the background.
  // Also gated on !playerCollapsed — while searching, the immersive view
  // is pushed off-canvas rather than unmounted (see below), and the lock
  // needs to release so the hero/search bar/grids become reachable again.
  const playerActive = isActiveTab && !loading && !pickerResults && !!song && !playerCollapsed;
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
        <SearchBar onSearch={onSearch} onArtistSearch={onArtistSearch} onFocusChange={setPlayerCollapsed} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading-state">
          <div className="skeleton-loader">
            <div className="skeleton-bar title" />
            <div className="skeleton-bar w-80" />
            <div className="skeleton-bar w-60" />
            <div className="skeleton-bar w-40" />
          </div>
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

      {/* Player — moved off-canvas (not unmounted, so YouTube playback
          survives) while the search bar has focus, instead of leaving
          it as a full-screen blocker between the person and the search
          bar/results grids underneath it. */}
      {!loading && !pickerResults && song && (
        <div className={`player-section ${playerCollapsed ? 'tab-offscreen' : ''}`}>
          <div className="player-layout">
            <LyricsPanel
              key={`lyrics-${song.title}::${song.artist}`}
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
            <div className="player-panel" key={`player-${song.title}::${song.artist}`}>
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

      {/* Stand-in for the collapsed player above — keeps playback
          context visible and reachable while searching. */}
      {playerCollapsed && song && (
        <MiniPlayerBar
          player={player}
          visible={true}
          onExpand={() => setPlayerCollapsed(false)}
        />
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
              <SongCard key={s.title} song={s} onClick={handleCardPlay} />
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
              <SongCard key={s.title} song={s} onClick={handleCardPlay} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}