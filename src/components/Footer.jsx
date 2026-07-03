export default function Footer() {
    return (
        <footer className="app-footer">
            <div className="footer-content">
                <p>&copy; {new Date().getFullYear()} LyricApp. All rights reserved.</p>
                <p>by TRONNIX</p>
                {/* <div className="footer-links">
                    <a href="#privacy">Privacy</a>
                    <a href="#terms">Terms</a>
                </div> */}
            </div>
        </footer>
    );
}
