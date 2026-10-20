import { useEffect, useRef, useState } from "react";
import "../styles/features.css";

const W = 1080;
const H = 1350;
const MAX_LINES = 4;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const CARD_STYLES = [
    { id: "aurora", name: "Aurora", colors: ["#0ea5e9", "#6366f1", "#a855f7"], text: "#ffffff" },
    { id: "sunset", name: "Sunset", colors: ["#f97316", "#ef4444", "#be185d"], text: "#ffffff" },
    { id: "midnight", name: "Midnight", colors: ["#0f172a", "#1e293b", "#334155"], text: "#f8fafc" },
    { id: "forest", name: "Forest", colors: ["#065f46", "#047857", "#0f766e"], text: "#ffffff" },
    { id: "gold", name: "Gold", colors: ["#fef3c7", "#fde68a", "#fbbf24"], text: "#1f2937" },
];

function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";

    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth || !current) {
            current = test;
        } else {
            lines.push(current);
            current = word;
        }
    }

    if (current) lines.push(current);
    return lines;
}

// Largest font size at which all the selected lines fit the text area.
function layoutQuote(ctx, paragraphs, maxWidth, maxHeight) {
    for (let size = 76; size >= 32; size -= 2) {
        ctx.font = `800 ${size}px ${FONT}`;

        const blocks = paragraphs.map((p) => wrapText(ctx, p, maxWidth));
        const lineHeight = size * 1.28;
        const gap = size * 0.34;
        const lineCount = blocks.reduce((n, b) => n + b.length, 0);
        const height = lineCount * lineHeight + (blocks.length - 1) * gap;

        if (height <= maxHeight || size === 32) {
            return { size, blocks, lineHeight, gap, height };
        }
    }
    return null;
}

function drawCard(canvas, { lines, title, artist, style }) {
    const ctx = canvas.getContext("2d");
    canvas.width = W;
    canvas.height = H;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    style.colors.forEach((color, i) => gradient.addColorStop(i / (style.colors.length - 1), color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Soft decorative circles
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = style.text;
    ctx.beginPath();
    ctx.arc(W * 0.9, H * 0.08, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W * 0.05, H * 0.95, 360, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = style.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // Opening quote mark
    ctx.globalAlpha = 0.35;
    ctx.font = `900 260px Georgia, serif`;
    ctx.fillText("\u201C", 90, 330);
    ctx.globalAlpha = 1;

    // Lyrics, centred in the middle block
    const paragraphs = lines.length ? lines : ["Pick a few lines to build your card"];
    const layout = layoutQuote(ctx, paragraphs, W - 200, 640);

    ctx.textAlign = "center";
    ctx.font = `800 ${layout.size}px ${FONT}`;

    let y = 330 + (640 - layout.height) / 2 + layout.size;
    layout.blocks.forEach((block, bi) => {
        block.forEach((line) => {
            ctx.fillText(line, W / 2, y);
            y += layout.lineHeight;
        });
        if (bi < layout.blocks.length - 1) y += layout.gap;
    });

    // Divider + song info
    ctx.globalAlpha = 0.45;
    ctx.fillRect(W / 2 - 60, 1060, 120, 4);
    ctx.globalAlpha = 1;

    ctx.font = `700 46px ${FONT}`;
    ctx.fillText(title.length > 34 ? `${title.slice(0, 33)}\u2026` : title, W / 2, 1140);

    ctx.globalAlpha = 0.8;
    ctx.font = `500 36px ${FONT}`;
    ctx.fillText(artist.length > 40 ? `${artist.slice(0, 39)}\u2026` : artist, W / 2, 1196);

    // Brand
    ctx.globalAlpha = 0.6;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText("LyricStream", W / 2, 1290);
    ctx.globalAlpha = 1;
}

export default function LyricCardModal({ open, onClose, song, activeIdx, showToast }) {
    const canvasRef = useRef(null);
    const [selected, setSelected] = useState([]);
    const [styleId, setStyleId] = useState(CARD_STYLES[0].id);

    const lyrics = song?.lyrics || [];
    const style = CARD_STYLES.find((s) => s.id === styleId) || CARD_STYLES[0];

    // Start with the line that is playing right now.
    useEffect(() => {
        if (open) setSelected(activeIdx >= 0 ? [activeIdx] : []);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Redraw whenever the selection or style changes.
    useEffect(() => {
        if (!open || !canvasRef.current || !song) return;
        drawCard(canvasRef.current, {
            lines: [...selected].sort((a, b) => a - b).map((i) => lyrics[i]?.l).filter(Boolean),
            title: song.title || "",
            artist: song.artist || "",
            style,
        });
    }, [open, selected, style, song]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || !song) return null;

    const toggleLine = (index) => {
        setSelected((current) => {
            if (current.includes(index)) return current.filter((i) => i !== index);
            if (current.length >= MAX_LINES) {
                showToast?.(`Pick up to ${MAX_LINES} lines`);
                return current;
            }
            return [...current, index];
        });
    };

    const exportCard = async () => {
        const canvas = canvasRef.current;
        if (!canvas || !selected.length) {
            showToast?.("Pick at least one line first");
            return;
        }

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) {
            showToast?.("Couldn't create the image");
            return;
        }

        const slug = (song.title || "lyrics").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const file = new File([blob], `${slug || "lyrics"}-card.png`, { type: "image/png" });

        if (navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: song.title });
                return;
            } catch (err) {
                if (err?.name === "AbortError") return;
            }
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast?.("Image saved");
    };

    return (
        <div className="fx-backdrop" onClick={onClose} role="presentation">
            <div
                className="fx-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Create a lyric card"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="fx-header">
                    <h2>Lyric card</h2>
                    <button type="button" className="fx-close" onClick={onClose} aria-label="Close">
                        <i className="ti ti-x" aria-hidden="true" />
                    </button>
                </div>

                <div className="fx-card-layout">
                    <div className="fx-card-preview">
                        <canvas ref={canvasRef} aria-label="Lyric card preview" />
                    </div>

                    <div className="fx-card-controls">
                        <div className="fx-styles" role="radiogroup" aria-label="Card style">
                            {CARD_STYLES.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={s.id === styleId}
                                    aria-label={s.name}
                                    title={s.name}
                                    className={`fx-swatch ${s.id === styleId ? "fx-swatch--active" : ""}`}
                                    style={{ background: `linear-gradient(135deg, ${s.colors.join(", ")})` }}
                                    onClick={() => setStyleId(s.id)}
                                />
                            ))}
                        </div>

                        <p className="fx-hint">
                            Tap up to {MAX_LINES} lines ({selected.length}/{MAX_LINES})
                        </p>

                        <div className="fx-lines">
                            {lyrics.map((line, i) => (
                                <button
                                    key={`${i}-${line.t}`}
                                    type="button"
                                    className={`fx-line ${selected.includes(i) ? "fx-line--on" : ""}`}
                                    aria-pressed={selected.includes(i)}
                                    onClick={() => toggleLine(i)}
                                >
                                    {line.l}
                                </button>
                            ))}
                        </div>

                        <button type="button" className="fx-primary" onClick={exportCard}>
                            <i className="ti ti-share-3" aria-hidden="true" /> Share / save image
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}