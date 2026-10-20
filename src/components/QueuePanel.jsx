import { useEffect, useState } from "react";
import { sameSong } from "../hooks/useQueue";
import "../styles/features.css";

const SPLIT = /\s+[-–—]\s*|\s*[-–—]\s+|\s+by\s+/i;

export default function QueuePanel({
    open,
    onClose,
    queue,
    favorites,
    recent,
    onAdd,
    onRemove,
    onPlayNow,
    onClear,
}) {
    const [tab, setTab] = useState("favourites");
    const [text, setText] = useState("");

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const source = tab === "favourites" ? favorites : recent;

    const addTyped = () => {
        const value = text.trim();
        if (!value) return;

        const parts = value.split(SPLIT).map((p) => p.trim()).filter(Boolean);
        const song = parts.length >= 2 ? { title: parts[0], artist: parts[1] } : { title: value, artist: "" };

        onAdd(song);
        setText("");
    };

    return (
        <div className="fx-backdrop" onClick={onClose} role="presentation">
            <div
                className="fx-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Up next"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="fx-header">
                    <h2>Up next</h2>
                    <div className="fx-header-actions">
                        {queue.length > 0 && (
                            <button type="button" className="fx-link" onClick={onClear}>
                                Clear
                            </button>
                        )}
                        <button type="button" className="fx-close" onClick={onClose} aria-label="Close">
                            <i className="ti ti-x" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {queue.length === 0 ? (
                    <p className="fx-empty">
                        Nothing queued. Add songs below, then use Next to play them in order.
                    </p>
                ) : (
                    <ol className="fx-list">
                        {queue.map((song, i) => (
                            <li key={`${song.title}-${song.artist}-${i}`} className="fx-row">
                                <span className="fx-row-index">{i + 1}</span>
                                <span className="fx-row-text">
                                    <strong>{song.title}</strong>
                                    <small>{song.artist || "Unknown artist"}</small>
                                </span>
                                <button type="button" className="fx-icon-btn" onClick={() => onPlayNow(i)} aria-label={`Play ${song.title} now`} title="Play now">
                                    <i className="ti ti-player-play-filled" aria-hidden="true" />
                                </button>
                                <button type="button" className="fx-icon-btn" onClick={() => onRemove(i)} aria-label={`Remove ${song.title}`} title="Remove">
                                    <i className="ti ti-trash" aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ol>
                )}

                <form
                    className="fx-add"
                    onSubmit={(e) => {
                        e.preventDefault();
                        addTyped();
                    }}
                >
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Add a song: Title - Artist"
                        maxLength={120}
                        aria-label="Add a song to the queue"
                    />
                    <button type="submit" className="fx-primary fx-primary--small">
                        Add
                    </button>
                </form>

                <div className="fx-tabs" role="tablist">
                    {[
                        ["favourites", "Favourites"],
                        ["recent", "Recently played"],
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            className={`fx-tab ${tab === id ? "fx-tab--active" : ""}`}
                            onClick={() => setTab(id)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <ul className="fx-list fx-list--source">
                    {(source || []).length === 0 && <li className="fx-empty">Nothing here yet.</li>}
                    {(source || []).slice(0, 30).map((song) => {
                        const queued = queue.some((q) => sameSong(q, song));
                        return (
                            <li key={`${song.title}-${song.artist}`} className="fx-row">
                                <span className="fx-row-text">
                                    <strong>{song.title}</strong>
                                    <small>{song.artist || "Unknown artist"}</small>
                                </span>
                                <button
                                    type="button"
                                    className="fx-icon-btn"
                                    disabled={queued}
                                    onClick={() => onAdd(song)}
                                    aria-label={queued ? `${song.title} is already queued` : `Add ${song.title} to queue`}
                                    title={queued ? "Already queued" : "Add to queue"}
                                >
                                    <i className={`ti ${queued ? "ti-check" : "ti-plus"}`} aria-hidden="true" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}