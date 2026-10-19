import { useState } from "react";

const GENRE_TABS = [
    {
        id: "popular",
        label: "Popular",
        genres: ["ZimDancehall", "Sungura", "Afrobeats", "Amapiano", "Hip-Hop", "R&B"],
    },
    {
        id: "african",
        label: "African",
        genres: [
            "ZimDancehall", "Zimbabwean HipHop","Sungura", "Zimbabwean Gospel",
            "Afrobeats", "Afro-fusion", "Afro-house",
            "Amapiano", "Kwaito", "Bongo Flava",
            "Highlife", "Soukous", "Kizomba", "Gqom", "Maskandi",
        ],
    },
    {
        id: "caribbean",
        label: "Caribbean & Latin",
        genres: [
            "Dancehall", "Reggae", "Soca", "Calypso",
            "Reggaeton", "Latin Pop", "Salsa",
        ],
    },
    {
        id: "international",
        label: "International",
        genres: [
            "Pop", "Hip-Hop", "R&B", "Rock", "Alternative",
            "Indie", "Metal", "Punk", "Country", "Folk",
            "Gospel", "Jazz", "Blues", "Funk", "Disco",
            "Classical", "Soul", "Acoustic", "Ambient",
            "K-pop", "J-pop",
        ],
    },
    {
        id: "electronic",
        label: "Electronic",
        genres: [
            "Electronic", "House", "Techno", "Trance",
            "EDM", "Drum and Bass", "Lo-fi",
        ],
    },
];

// Collapsed by default: one slim row (current genre + autoplay switch).
// Tap the row to open the picker; picking a genre closes it again.
export default function GenrePicker({
    favoriteGenre,
    onSetGenre,
    autoplayEnabled,
    onSetAutoplay,
}) {
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("popular");

    const tab = GENRE_TABS.find((t) => t.id === activeTab) || GENRE_TABS[0];
    const needsGenre = autoplayEnabled && !favoriteGenre;

    const pick = (genre) => {
        onSetGenre(genre);
        setOpen(false);
    };

    return (
        <section className={`gp ${open ? "gp--open" : ""}`}>
            <div className="gp-bar">
                <button
                    type="button"
                    className="gp-summary"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    aria-controls="gp-panel"
                >
                    <i className="ti ti-disc gp-disc" aria-hidden="true" />
                    <span className="gp-label">Autoplay</span>
                    <span className={`gp-current ${needsGenre ? "gp-current--warn" : ""}`}>
                        {favoriteGenre || "Pick a genre"}
                    </span>
                    <i
                        className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"} gp-chevron`}
                        aria-hidden="true"
                    />
                </button>

                <button
                    type="button"
                    role="switch"
                    aria-checked={autoplayEnabled}
                    aria-label="Autoplay"
                    className={`gp-switch ${autoplayEnabled ? "gp-switch--on" : ""}`}
                    onClick={() => onSetAutoplay(!autoplayEnabled)}
                    title={autoplayEnabled ? "Autoplay is on" : "Autoplay is off"}
                >
                    <span className="gp-knob" />
                </button>
            </div>

            {open && (
                <div className="gp-panel" id="gp-panel">
                    <div className="gp-tabs" role="tablist">
                        {GENRE_TABS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={t.id === activeTab}
                                className={`gp-tab ${t.id === activeTab ? "gp-tab--active" : ""}`}
                                onClick={() => setActiveTab(t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="gp-chips">
                        {tab.genres.map((genre) => (
                            <button
                                key={genre}
                                type="button"
                                className={`gp-chip ${favoriteGenre === genre ? "gp-chip--active" : ""}`}
                                aria-pressed={favoriteGenre === genre}
                                onClick={() => pick(genre)}
                            >
                                {genre}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}