export default function CreditBadge() {
    const year = new Date().getFullYear();

    return (
        <div className="credit-badge">
            © {year} LyricStream · Built for the love of music @Tronnix
        </div>
    );
}
