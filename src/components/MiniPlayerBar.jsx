export default function MiniPlayerBar({ player, visible, onExpand }) {
    if (!visible || !player.song) return null;

    const { song, isPlaying, togglePlay, progress } = player;

    return (
        <div className="mini-player-bar" onClick={onExpand} role="button" tabIndex={0}>
            <div className="mini-player-progress" style={{ width: `${progress}%` }} />
            <div className="mini-player-art">
                <i className="ti ti-music" />
            </div>
            <div className="mini-player-info">
                <p className="mini-player-title">{song.title}</p>
                <p className="mini-player-artist">{song.artist || 'Unknown artist'}</p>
            </div>
            <button
                className="mini-player-play"
                onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                }}
                title={isPlaying ? 'Pause' : 'Play'}
            >
                <i className={`ti ${isPlaying ? 'ti-player-pause' : 'ti-player-play'}`} />
            </button>
        </div>
    );
}
