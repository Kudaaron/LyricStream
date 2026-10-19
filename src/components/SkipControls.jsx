import { useEffect, useState } from "react";
import { createPortal } from "react-dom";



function findVideoHost() {
    const iframe = document.querySelector('iframe[src*="youtube"]');
    return iframe?.parentElement || null;
}

function useHoverCapable() {
    const query = "(hover: hover) and (pointer: fine)";
    const [capable, setCapable] = useState(
        () => window.matchMedia?.(query).matches ?? true,
    );

    useEffect(() => {
        const mq = window.matchMedia?.(query);
        if (!mq) return undefined;
        const onChange = (e) => setCapable(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    return capable;
}

export default function SkipControls({ visible, onPrev, onNext, canPrev, busy }) {
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

    // Touch: create a mount point right after the video for the button row.
    useEffect(() => {
        if (!host || hoverCapable) {
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
    }, [host, hoverCapable]);

    if (!visible || !host) return null;

    const prevBtn = (
        <button
            type="button"
            className="skip-btn"
            onClick={onPrev}
            disabled={busy}
            title={canPrev ? "Previous song" : "Restart song"}
            aria-label="Previous song"
        >
            <i className="ti ti-player-skip-back-filled" aria-hidden="true" />
            <span className="skip-btn-label">Previous</span>
        </button>
    );

    const nextBtn = (
        <button
            type="button"
            className="skip-btn"
            onClick={onNext}
            disabled={busy}
            title="Next song"
            aria-label="Next song"
        >
            <i
                className={`ti ${busy ? "ti-loader-2 spin" : "ti-player-skip-forward-filled"}`}
                aria-hidden="true"
            />
            <span className="skip-btn-label">Next</span>
        </button>
    );

    if (hoverCapable) {
        return createPortal(
            <div className="skip-overlay">
                {prevBtn}
                {nextBtn}
            </div>,
            host,
        );
    }

    if (!rowMount) return null;

    return createPortal(
        <div className="skip-row">
            {prevBtn}
            {nextBtn}
        </div>,
        rowMount,
    );
}