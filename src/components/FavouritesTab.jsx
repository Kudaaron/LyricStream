function fmt(s) {
    if (!s) return '';
    s = Math.floor(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function FavouritesTab({ favorites, onPlaySong, onRemoveFav }) {
    // Uses the real cached favorite data directly — title, artist, and
    // the actual synced lyrics captured at favourite-time — rather than
    // cross-referencing the old hardcoded demo library, which could
    // silently substitute dummy placeholder lyrics for any favourite
    // whose title happened to match one of the demo songs.
    const allFavs = favorites;

    if (allFavs.length === 0) {
        return (
            <div className="favs-empty">
                <div className="favs-empty-icon">
                    <i className="ti ti-heart" />
                </div>
                <h2 className="favs-empty-title">No favourites yet</h2>
                <p className="favs-empty-sub">
                    Search for a song and tap the heart icon to save it here.
                </p>
            </div>
        );
    }

    return (
        <div className="favs-tab">
            <div className="favs-header">
                <h1 className="favs-title">
                    <i className="ti ti-heart-filled" style={{ color: '#EF4444' }} />
                    Your Favourites
                </h1>
                <p className="favs-sub">{allFavs.length} song{allFavs.length !== 1 ? 's' : ''} saved</p>
            </div>

            <div className="favs-list">
                {allFavs.map((song, i) => (
                    <div key={song.title} className="fav-item" style={{ animationDelay: `${i * 0.04}s` }}>
                        <div className="fav-art">
                            <i className="ti ti-music" />
                        </div>
                        <div className="fav-info">
                            <p className="fav-title">{song.title}</p>
                            <p className="fav-artist">{song.artist || 'Unknown artist'}</p>
                        </div>
                        <div className="fav-meta">
                            {song.duration > 0 && (
                                <span className="fav-duration">{fmt(song.duration)}</span>
                            )}
                        </div>
                        <div className="fav-actions">
                            <button
                                className="fav-play-btn"
                                onClick={() => onPlaySong(song)}
                                title="Play"
                            >
                                <i className="ti ti-player-play" />
                            </button>
                            <button
                                className="fav-remove-btn"
                                onClick={() => onRemoveFav(song.title)}
                                title="Remove from favourites"
                            >
                                <i className="ti ti-heart-filled" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}