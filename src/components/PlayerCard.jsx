import { useState } from 'react';
import YouTubePlayer from './YouTubePlayer';
import { extractVideoIdFromUrl } from '../api/youtube';

const SPEEDS = [0.5, 1, 1.5, 2];

function fmt(s) {
  s = Math.floor(s || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function PlayerCard({
  song, isPlaying, currentSec, duration, progress,
  onTogglePlay, onRestart, onSkipForward, onSeekByPercent,
  speed, onSetSpeed, volume, onSetVolume,
  mode, videoId, loading,
  lyricOffset, onSetLyricOffset,
  onYTReady, onYTTimeUpdate, onYTStateChange,
  onManualVideoId,
}) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');

  const handleProgressClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeekByPercent(pct);
  };

  const handleManualUrl = () => {
    const id = extractVideoIdFromUrl(urlInput);
    if (!id) { setUrlError('Could not find a video ID in that URL'); return; }
    setUrlError('');
    setShowUrlInput(false);
    setUrlInput('');
    try {
      const cache = JSON.parse(localStorage.getItem('ls_yt_cache') || '{}');
      const key = `${song?.title || ''} ${song?.artist || ''}`.toLowerCase().trim();
      delete cache[key];
      localStorage.setItem('ls_yt_cache', JSON.stringify(cache));
    } catch { }
    onManualVideoId(id);
  };

  return (
    <div className="player-card">

      {/* YouTube embed OR album art */}
      {mode === 'youtube' && videoId ? (
        <div className="yt-embed-wrap">
          <YouTubePlayer
            videoId={videoId}
            onReady={onYTReady}
            onTimeUpdate={onYTTimeUpdate}
            onStateChange={onYTStateChange}
          />
        </div>
      ) : (
        <div className="player-art-big">
          <i className="ti ti-music" />
          <div className={`vinyl-ring${isPlaying ? ' spinning' : ''}`} />
        </div>
      )}

      {/* Song info */}
      <div className="player-info">
        <p className="player-title">{song?.title || '—'}</p>
        <p className="player-artist">{song?.artist || '—'}</p>
      </div>

      {/* Mode badge */}
      {song && (
        <div className="player-badge-wrap">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {loading ? (
              <span className="audio-badge audio-badge--sim">
                <i className="ti ti-loader" style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                {' '}Finding song…
              </span>
            ) : mode === 'youtube' ? (
              <span
                className="audio-badge audio-badge--live"
                style={{ cursor: 'pointer' }}
                title="Wrong video? Click to paste a different URL"
                onClick={() => setShowUrlInput(v => !v)}
              >
                <i className="ti ti-brand-youtube" /> Full song · YouTube ✎
              </span>
            ) : mode === 'preview' ? (
              <span className="audio-badge audio-badge--preview">
                <i className="ti ti-headphones" /> 30-sec preview · iTunes
              </span>
            ) : (
              <span className="audio-badge audio-badge--sim">
                <i className="ti ti-music" /> Lyrics sync only
              </span>
            )}

            {!loading && mode !== 'youtube' && (
              <button
                className="btn-icon-sm"
                title="Paste a YouTube URL to play full song"
                onClick={() => setShowUrlInput(v => !v)}
                style={{ color: 'var(--accent)' }}
              >
                <i className="ti ti-brand-youtube" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual YouTube URL input */}
      {showUrlInput && (
        <div className="yt-manual-wrap">
          <p className="yt-manual-label">Paste a YouTube URL for the full song:</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="yt-manual-input"
              type="text"
              placeholder="https://youtube.com/watch?v=..."
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleManualUrl()}
              autoFocus
            />
            <button className="btn-primary" style={{ padding: '7px 12px' }} onClick={handleManualUrl}>
              <i className="ti ti-check" />
            </button>
          </div>
          {urlError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{urlError}</p>}
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent((song?.title || '') + ' ' + (song?.artist || '') + ' official audio')}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: 'var(--accent)' }}
          >
            Search on YouTube ↗
          </a>
        </div>
      )}

      {/* Progress — preview / sim only */}
      {mode !== 'youtube' && (
        <div className="progress-wrap">
          <div className="progress-bar-bg" onClick={handleProgressClick}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
            <div className="progress-thumb" style={{ left: `${progress}%` }} />
          </div>
          <div className="progress-times">
            <span>{fmt(currentSec)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      )}

      {/* Controls — preview / sim only */}
      {mode !== 'youtube' && (
        <div className="player-controls">
          <button className="ctrl-btn" onClick={onRestart} title="Restart">
            <i className="ti ti-player-skip-back" />
          </button>
          <button
            className="ctrl-btn ctrl-play"
            onClick={onTogglePlay}
            disabled={loading}
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            <i className={`ti ${isPlaying ? 'ti-player-pause' : 'ti-player-play'}`} />
          </button>
          <button className="ctrl-btn" onClick={onSkipForward} title="+10s">
            <i className="ti ti-player-skip-forward" />
          </button>
        </div>
      )}

      {/* Volume */}
      <div className="volume-wrap">
        <i className="ti ti-volume" />
        <input
          type="range" min={0} max={100} value={volume}
          onChange={e => onSetVolume(Number(e.target.value))}
        />
        <span className="volume-label">{volume}%</span>
      </div>

      {/* Speed */}
      <div className="speed-wrap">
        <span className="speed-label">Speed</span>
        <div className="speed-btns">
          {SPEEDS.map(s => (
            <button
              key={s}
              className={`speed-btn${speed === s ? ' active' : ''}`}
              onClick={() => onSetSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Lyric sync offset */}
      {song && (
        <div className="offset-wrap">
          <div className="offset-header">
            <span className="speed-label">
              <i className="ti ti-adjustments-horizontal" /> Lyric sync
            </span>
            <span className="offset-value">
              {lyricOffset === 0 ? 'on beat' : lyricOffset > 0 ? `+${lyricOffset}s` : `${lyricOffset}s`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn-icon-sm" onClick={() => onSetLyricOffset(Math.max(-15, lyricOffset - 1))}>−</button>
            <input
              type="range" min={-15} max={15} value={lyricOffset} step={1}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
              onChange={e => onSetLyricOffset(Number(e.target.value))}
            />
            <button className="btn-icon-sm" onClick={() => onSetLyricOffset(Math.min(15, lyricOffset + 1))}>+</button>
          </div>
          {lyricOffset !== 0 && (
            <button className="offset-reset" onClick={() => onSetLyricOffset(0)}>Reset sync</button>
          )}
        </div>
      )}

      {/* Spotify */}
      {song && (
        <a
          href={song.spotify || `https://open.spotify.com/search/${encodeURIComponent((song.title || '') + ' ' + (song.artist || ''))}`}
          target="_blank" rel="noreferrer"
          className="spotify-cta"
        >
          <i className="ti ti-brand-spotify" />
          {song.spotify ? 'Open on Spotify' : 'Search on Spotify'}
          <i className="ti ti-external-link" />
        </a>
      )}

      {/* Footer note */}
      {mode === 'youtube' && (
        <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '0 1.25rem', lineHeight: 1.5 }}>
          Lyrics sync to YouTube · use offset slider if needed
        </p>
      )}
      {mode === 'preview' && (
        <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '0 1.25rem', lineHeight: 1.5 }}>
          30-sec preview via iTunes · paste YouTube URL above for full song
        </p>
      )}
    </div>
  );
}