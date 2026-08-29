export default function KaraokeView({ song, activeLyricIdx, isPlaying, onSeek, onTogglePlay, onClose }) {
    if (!song) return null;

    const lyrics = song.lyrics || [];
    const prev = activeLyricIdx > 0 ? lyrics[activeLyricIdx - 1] : null;
    const active = activeLyricIdx >= 0 ? lyrics[activeLyricIdx] : null;
    const next = activeLyricIdx >= 0 ? lyrics[activeLyricIdx + 1] : lyrics[0];

    return (
        <div className="karaoke-view">
            <button className="karaoke-close" onClick={onClose} title="Exit karaoke mode">
                <i className="ti ti-x" />
            </button>

            <div className="karaoke-meta">
                <p className="karaoke-title">{song.title}</p>
                <p className="karaoke-artist">{song.artist}</p>
            </div>

            <div className="karaoke-stage">
                {prev && (
                    <p className="karaoke-line karaoke-prev" onClick={() => onSeek(prev.t)}>
                        {prev.l || '♪'}
                    </p>
                )}
                <p className="karaoke-line karaoke-active">
                    {active?.l || '♪'}
                </p>
                {next && (
                    <p className="karaoke-line karaoke-next" onClick={() => onSeek(next.t)}>
                        {next.l || '♪'}
                    </p>
                )}
                {!active && !next && (
                    <p className="karaoke-line karaoke-active karaoke-empty">No lyrics for this song yet</p>
                )}
            </div>

            <button
                className={`karaoke-play ${isPlaying ? 'playing' : ''}`}
                onClick={onTogglePlay}
                title={isPlaying ? 'Pause' : 'Play'}
            >
                <i className={`ti ${isPlaying ? 'ti-player-pause' : 'ti-player-play'}`} />
            </button>
        </div>
    );
}