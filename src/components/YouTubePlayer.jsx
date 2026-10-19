
import { useEffect, useRef, useCallback } from 'react';

let youtubeApiPromise = null;

function loadYouTubeAPI() {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('YouTube Player requires a browser.'));
    }

    if (window.YT?.Player) {
        return Promise.resolve(window.YT);
    }

    if (youtubeApiPromise) {
        return youtubeApiPromise;
    }

    youtubeApiPromise = new Promise((resolve, reject) => {
        const previousCallback = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
            try {
                previousCallback?.();
            } catch (error) {
                console.error('Previous YouTube API callback failed:', error);
            }

            if (window.YT?.Player) {
                resolve(window.YT);
            } else {
                reject(new Error('YouTube IFrame API failed to initialize.'));
            }
        };

        let script = document.getElementById('yt-iframe-api');

        if (!script) {
            script = document.createElement('script');
            script.id = 'yt-iframe-api';
            script.src = 'https://www.youtube.com/iframe_api';
            script.async = true;

            script.onerror = () => {
                youtubeApiPromise = null;
                reject(new Error('Could not load the YouTube IFrame API.'));
            };

            document.head.appendChild(script);
        }
    });

    return youtubeApiPromise;
}

export default function YouTubePlayer({
    videoId,
    onTimeUpdate,
    onStateChange,
    onReady,
}) {
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const rafRef = useRef(null);
    const videoIdRef = useRef(videoId);

    const callbacksRef = useRef({
        onTimeUpdate,
        onStateChange,
        onReady,
    });

    const readyRef = useRef(false);

    // Keep callbacks current without recreating the YouTube player.
    useEffect(() => {
        callbacksRef.current = {
            onTimeUpdate,
            onStateChange,
            onReady,
        };
    }, [onTimeUpdate, onStateChange, onReady]);

    const stopPolling = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    const startPolling = useCallback(() => {
        stopPolling();

        const tick = () => {
            const player = playerRef.current;

            if (player?.getCurrentTime) {
                try {
                    callbacksRef.current.onTimeUpdate?.(
                        player.getCurrentTime()
                    );
                } catch (error) {
                    console.error('YouTube time update failed:', error);
                }
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
    }, [stopPolling]);

    // Create the YouTube player once.
    useEffect(() => {
        let cancelled = false;
        let createdPlayer = null;

        const initializePlayer = async () => {
            try {
                const YT = await loadYouTubeAPI();

                if (cancelled || !containerRef.current) return;

                createdPlayer = new YT.Player(containerRef.current, {
                    width: '100%',
                    height: '100%',
                    videoId: videoIdRef.current || undefined,

                    playerVars: {
                        autoplay: 1,
                        controls: 1,
                        rel: 0,
                        modestbranding: 1,
                        iv_load_policy: 3,
                        playsinline: 1,
                    },

                    events: {
                        onReady: (event) => {
                            if (cancelled) {
                                event.target.destroy();
                                return;
                            }

                            playerRef.current = event.target;
                            readyRef.current = true;

                            callbacksRef.current.onReady?.(event.target);

                            // Start the currently selected video.
                            const currentVideoId = videoIdRef.current;

                            if (currentVideoId) {
                                event.target.loadVideoById(currentVideoId);
                            }
                        },

                        onStateChange: (event) => {
                            if (cancelled) return;

                            callbacksRef.current.onStateChange?.(event.data);

                            // YouTube states:
                            // -1 = unstarted
                            //  0 = ended
                            //  1 = playing
                            //  2 = paused
                            //  3 = buffering
                            //  5 = video cued

                            if (event.data === YT.PlayerState.PLAYING) {
                                startPolling();
                            } else {
                                stopPolling();
                            }
                        },

                        onError: (event) => {
                            console.error(
                                'YouTube playback error:',
                                event.data
                            );
                        },
                    },
                });

                if (cancelled) {
                    try {
                        createdPlayer?.destroy();
                    } catch {
                        // Player may not have finished initializing.
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    console.error(
                        'Failed to initialize YouTube player:',
                        error
                    );
                }
            }
        };

        initializePlayer();

        return () => {
            cancelled = true;
            readyRef.current = false;

            stopPolling();

            try {
                createdPlayer?.destroy();
            } catch {
                // Ignore cleanup errors.
            }

            playerRef.current = null;
        };
    }, [startPolling, stopPolling]);

    // Load and start every newly selected song.
    useEffect(() => {
        videoIdRef.current = videoId;

        if (!videoId || !readyRef.current) return;

        const player = playerRef.current;

        if (!player?.loadVideoById) return;

        try {
            player.loadVideoById({
                videoId,
                suggestedQuality: 'default',
            });
        } catch (error) {
            console.error('Failed to load YouTube video:', error);
        }
    }, [videoId]);

    return (
        <div
            style={{
                display: 'block',
                position: 'relative',
                width: '100%',
                maxWidth: '100%',
                paddingBottom: '56.25%',
                height: 0,
                background: '#000',
                overflow: 'hidden',
                borderRadius: 'inherit',
            }}
        >
            <div
                ref={containerRef}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                }}
            />
        </div>
    );
}
