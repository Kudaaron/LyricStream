const LINKS = [
    { id: 'search', label: 'Search', icon: 'ti-search' },
    { id: 'favourites', label: 'Favourites', icon: 'ti-heart' },
    { id: 'about', label: 'About', icon: 'ti-info-circle' },
];

export default function Footer({ activeTab, onNavigate }) {
    const year = new Date().getFullYear();

    return (
        <footer className="site-footer">
            <div className="footer-brand">
                <div className="footer-logo">
                    <i className="ti ti-music" />
                </div>
                <span className="footer-title">LyricStream</span>
            </div>

            <p className="footer-tagline">
                Find lyrics for any song, synced and ready to sing along.
            </p>

            <nav className="footer-nav">
                {LINKS.map(l => (
                    <button
                        key={l.id}
                        className={`footer-nav-link ${activeTab === l.id ? 'active' : ''}`}
                        onClick={() => onNavigate(l.id)}
                    >
                        <i className={`ti ${l.icon}`} /> {l.label}
                    </button>
                ))}
            </nav>

            <div className="footer-credits">
                <span>Powered by LRCLIB</span>
                <span className="footer-dot">·</span>
                <span>Playback via YouTube</span>
            </div>

            <p className="footer-copy">© {year} LyricStream · Built for the love of music @Tronnix</p>
        </footer>
    );
}