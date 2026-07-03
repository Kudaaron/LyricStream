const TECH = [
  'React 18', 'Vite', 'CSS3 (custom properties)',
  'Tabler Icons', 'LRCLIB API (free, no key)', 'YouTube IFrame API',
  'iTunes Preview API', 'localStorage',
];

const FEATURES = [
  { icon: 'ti-search', title: 'Search any song', desc: 'Powered by LRCLIB — a free, open lyrics database with millions of songs. No API key needed.' },
  { icon: 'ti-list', title: 'Synced lyrics', desc: 'Real LRC-format timestamps from LRCLIB sync lyrics line-by-line as the song plays.' },
  { icon: 'ti-brand-youtube', title: 'Full song playback', desc: 'YouTube IFrame API plays the full song. Lyrics highlight in real time using the video\'s current time.' },
  { icon: 'ti-adjustments', title: 'Lyric offset', desc: 'If lyrics drift, use the sync slider in the player to nudge them forward or backward.' },
  { icon: 'ti-heart', title: 'Favourites', desc: 'Heart any song to save it locally. Persists across sessions via localStorage.' },
  { icon: 'ti-moon', title: 'Dark mode', desc: 'Toggle between light and dark theme. Your preference is saved automatically.' },
];

export default function AboutTab() {
  return (
    <div className="about-wrap">
      <div className="about-hero">
        <div className="about-logo"><i className="ti ti-music" /></div>
        <h1>LyricStream</h1>
        <p className="about-tagline">Your personal lyrics companion</p>
      </div>

      <div className="about-grid">
        {FEATURES.map(f => (
          <div key={f.title} className="about-card">
            <i className={`ti ${f.icon} about-card-icon`} />
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>


      <div className="api-setup">
        <h3><i className="ti ti-info-circle" /> How lyrics work</h3>

        <p>
          For best search results, use the format: <code>Song Title - Artist Name</code>
        </p>
        <p>
          Audio playback uses the <strong>YouTube IFrame API</strong> (full song) with an iTunes
          30-second preview as fallback both completely free, no registration required.
        </p>
      </div>
    </div>
  );
}