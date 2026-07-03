export default function Navbar({ activeTab, onTabChange, theme, onToggleTheme }) {
  const tabs = [
    { id: 'search', icon: 'ti-search',       label: 'Search' },
    { id: 'about',  icon: 'ti-info-circle',   label: 'About'  },
  ];

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <div className="nav-logo"><i className="ti ti-music" /></div>
        <span className="nav-title">LyricStream</span>
      </div>

      <div className="nav-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <i className={`ti ${tab.icon}`} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="nav-actions">
        <button className="btn-icon" onClick={onToggleTheme} title="Toggle dark / light mode">
          <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'}`} />
        </button>
      </div>
    </nav>
  );
}
