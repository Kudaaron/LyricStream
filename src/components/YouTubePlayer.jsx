import { useEffect, useRef, useCallback } from 'react';

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
                playsinline: 1,
            },
            events: {
                onReady: (e) => { onReady?.(e.target); },
                onStateChange: (e) => {
                    onStateChange?.(e.data);
                    if (e.data === 1) startPolling();
                    else stopPolling();
                },
            },
        });
    }, [onReady, onStateChange, startPolling, stopPolling]);

    useEffect(() => {
        loadYTScript();
        if (window.YT?.Player) {
            initPlayer();
        } else {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { prev?.(); initPlayer(); };
        }
        return () => {
            stopPolling();
            try { playerRef.current?.destroy(); } catch { }
            playerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        videoIdRef.current = videoId;
        if (playerRef.current?.loadVideoById) {
            playerRef.current.loadVideoById(videoId);
        }
    }, [videoId]);

    return (
        /* 
          Key: 100vw-aware responsive 16:9 container.
          - display:block removes inline-block gap
          - width:100% fills parent completely
          - padding-bottom:56.25% = 16:9 ratio
          - The YT SDK replaces containerRef div with an <iframe>
            that is absolutely positioned to fill the box
        */
        <div style={{
            display: 'block',
            position: 'relative',
            width: '100%',
            maxWidth: '100%',
            paddingBottom: '56.25%',
            height: 0,
            background: '#000',
            overflow: 'hidden',
        }}>
            <div
                ref={containerRef}
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    width: '100%', height: '100%',
                }}
            />
        </div>
    );
}