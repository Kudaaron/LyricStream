import { useEffect, useRef, useCallback } from 'react';

// Loads YouTube IFrame API once globally
function loadYTScript() {
    if (window.YT || document.getElementById('yt-iframe-api')) return;
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

export default function YouTubePlayer({ videoId, onTimeUpdate, onStateChange, onReady }) {
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const rafRef = useRef(null);
    const videoIdRef = useRef(videoId);

    // RAF loop: poll getCurrentTime for smooth lyric sync
    const startPolling = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        const tick = () => {
            if (playerRef.current?.getCurrentTime) {
                onTimeUpdate?.(playerRef.current.getCurrentTime());
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    }, [onTimeUpdate]);

    const stopPolling = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
    }, []);

    const initPlayer = useCallback(() => {
        if (!containerRef.current || !window.YT?.Player) return;

        // Destroy old player if exists
        if (playerRef.current) {
            try { playerRef.current.destroy(); } catch { }
            playerRef.current = null;
        }

        playerRef.current = new window.YT.Player(containerRef.current, {
            videoId: videoIdRef.current,
            playerVars: {
                autoplay: 0,
                controls: 1,
                rel: 0,
                modestbranding: 1,
                iv_load_policy: 3,
            },
            events: {
                onReady: (e) => {
                    onReady?.(e.target);
                },
                onStateChange: (e) => {
                    onStateChange?.(e.data);
                    // YT.PlayerState: PLAYING=1, PAUSED=2, ENDED=0
                    if (e.data === 1) startPolling();
                    else stopPolling();
                },
            },
        });
    }, [onReady, onStateChange, startPolling, stopPolling]);

    // Boot: load YT script then init
    useEffect(() => {
        loadYTScript();

        if (window.YT?.Player) {
            initPlayer();
        } else {
            // Wait for script to call onYouTubeIframeAPIReady
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                prev?.();
                initPlayer();
            };
        }

        return () => {
            stopPolling();
            try { playerRef.current?.destroy(); } catch { }
            playerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When videoId prop changes, load new video without destroying player
    useEffect(() => {
        videoIdRef.current = videoId;
        if (playerRef.current?.loadVideoById) {
            playerRef.current.loadVideoById(videoId);
        } else {
            // Player not ready yet — it will use videoIdRef on init
        }
    }, [videoId]);

    return (
        <div style={{
            width: '100%',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            background: '#000',
            position: 'relative',
            paddingBottom: '56.25%', /* 16:9 */
            height: 0,
        }}>
            <div ref={containerRef} style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%'
            }} />
        </div>
    );
}
