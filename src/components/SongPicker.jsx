function fmt(s) {
    if (!s) return '';
    s = Math.floor(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SongPicker({ results, query, onPick, onCancel }) {
    return (
        <div className="song-picker">
            <div className="song-picker-header">
                <div>
                    <h3 className="song-picker-title">
                        <i className="ti ti-list-search" /> Pick a song
                    </h3>
                    <p className="song-picker-sub">
                        Found {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
                    </p>
                </div>
                <button className="btn-icon-sm" onClick={onCancel} title="Cancel">
                    <i className="ti ti-x" />
                </button>
            </div>

            <div className="song-picker-list">
                {results.map((r, i) => (
                    <button
                        key={i}
                        className="song-picker-item"
                        onClick={() => onPick(r)}
                    >
                        <div className="song-picker-art">
                            <i className="ti ti-music" />
                        </div>
                        <div className="song-picker-info">
                            <p className="song-picker-name">{r.title}</p>
                            <p className="song-picker-artist">{r.artist}{r.album ? ` · ${r.album}` : ''}</p>
                        </div>
                        <div className="song-picker-meta">
                            {r.hasSynced && (
                                <span className="song-picker-synced" title="Has synced lyrics">
                                    <i className="ti ti-clock" /> synced
                                </span>
                            )}
                            {r.duration > 0 && (
                                <span className="song-picker-duration">{fmt(r.duration)}</span>
                            )}
                            <i className="ti ti-chevron-right" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}