import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Player controls drawn around the YouTube video (found via its iframe, so
// PlayerCard.jsx needs no edits):
//
//  • Mouse devices: previous / next buttons over the video, visible only
//    while hovering it (pure CSS :hover).
//  • Touch devices: previous / next go in the row UNDER the video instead,
//    so nothing ever sits over the video or its play button.
//  • Both: an action row under the video — share link, lyric card, queue.
function findVideoHost() {
    const iframe = document.querySelector('iframe[src*="youtube"]');
    return iframe?.parentElement || null;
}

function useHoverCapable() {
    const query = "(hover: hover) and (pointer: fine)";
    const [capable, setCapable] = useState(() => window.matchMedia?.(query).matches ?? true);

    useEffect(() => {
        const mq = window.matchMedia?.(query);
        if (!mq) return undefined;
        const onChange = (e) => setCapable(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    return capable;
}

export default function SkipControls({
    visible,
    onPrev,
    onNext,
    canPrev,
    busy,
    onShare,
    onCard,
    onQueue,
    queueCount = 0,
}) {
    const hoverCapable = useHoverCapable();
    const [host, setHost] = useState(null);
    const [rowMount, setRowMount] = useState(null);

    // Locate the video container (the iframe is created asynchronously).
    useEffect(() => {
        if (!visible) {
            setHost(null);
            return undefined;
        }

        const check = () => {
            const el = findVideoHost();
            setHost((prev) => (prev === el ? prev : el));
        };

        check();
        const id = setInterval(check, 600);
        return () => clearInterval(id);
    }, [visible]);

    // Desktop: mark the host so CSS can reveal the overlay on :hover.
    useEffect(() => {
        if (!host || !hoverCapable) return undefined;

        const addedRelative = getComputedStyle(host).position === "static";
        if (addedRelative) host.style.position = "relative";
        host.classList.add("skip-host");

        return () => {
            host.classList.remove("skip-host");
            if (addedRelative) host.style.position = "";
        };
    }, [host, hoverCapable]);

    // Row mount point right after the video (both modes).
    useEffect(() => {
        if (!host) {
            setRowMount(null);
            return undefined;
        }

        const mount = document.createElement("div");
        mount.className = "skip-row-mount";
        host.after(mount);
        setRowMount(mount);

        return () => {
            mount.remove();
            setRowMount(null);
        };
    }, [host]);

    if (!visible || !host) return null;

    const prevBtn = (
        <button
            type="button"
            className="skip-btn"
            onClick={onPrev}
            disabled={busy}
            title={canPrev ? "Previous song (P)" : "Restart song (P)"}
            aria-label="Previous song"
        >
            <i className="ti ti-player-skip-back-filled" aria-hidden="true" />
        </button>
    );

    const nextBtn = (
        <button
            type="button"
            className="skip-btn"
            onClick={onNext}
            disabled={busy}
            title="Next song (N)"
            aria-label="Next song"
        >
            <i
                className={`ti ${busy ? "ti-loader-2 spin" : "ti-player-skip-forward-filled"}`}
                aria-hidden="true"
            />
        </button>
    );

    return (
        <>
            {hoverCapable &&
                createPortal(
                    <div className="skip-overlay">
                        {prevBtn}
                        {nextBtn}
                    </div>,
                    host,
                )}

            {rowMount &&
                createPortal(
                    <div className="skip-row">
                        {!hoverCapable && (
                            <>
                                {prevBtn}
                                {nextBtn}
                                <span className="skip-sep" aria-hidden="true" />
                            </>
                        )}

                        <button type="button" className="skip-btn" onClick={onShare} title="Share link" aria-label="Share this song">
                            <i className="ti ti-share-3" aria-hidden="true" />
                        </button>

                        <button type="button" className="skip-btn" onClick={onCard} title="Make a lyric card" aria-label="Create a lyric card">
                            <i className="ti ti-photo" aria-hidden="true" />
                        </button>

                        <button type="button" className="skip-btn skip-btn--badge" onClick={onQueue} title="Up next (Q)" aria-label="Open the queue">
                            <i className="ti ti-playlist" aria-hidden="true" />
                            {queueCount > 0 && <span className="skip-badge">{queueCount}</span>}
                        </button>
                    </div>,
                    rowMount,
                )}
        </>
    );
}