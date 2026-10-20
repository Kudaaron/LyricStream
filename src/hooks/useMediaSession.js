import { useEffect, useRef } from "react";

export function useMediaSession({
  song,
  isPlaying,
  currentSec,
  duration,
  handlers,
}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const supported =
    typeof navigator !== "undefined" && "mediaSession" in navigator;

  // Now-playing metadata
  useEffect(() => {
    if (!supported) return;

    if (!song) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const artwork = song.youtubeVideoId
      ? [
          {
            src: `https://i.ytimg.com/vi/${song.youtubeVideoId}/hqdefault.jpg`,
            sizes: "480x360",
            type: "image/jpeg",
          },
        ]
      : [];

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || "",
        artist: song.artist || "",
        album: song.album || "LyricStream",
        artwork,
      });
    } catch {
      // MediaMetadata unsupported
    }
  }, [supported, song?.title, song?.artist, song?.album, song?.youtubeVideoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playing / paused state
  useEffect(() => {
    if (!supported) return;
    navigator.mediaSession.playbackState = song
      ? isPlaying
        ? "playing"
        : "paused"
      : "none";
  }, [supported, song, isPlaying]);

  // Position (updated every ~2s, not every frame)
  const positionBucket = Math.floor(currentSec / 2);
  useEffect(() => {
    if (!supported || !song || !(duration > 0)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(Math.max(currentSec, 0), duration),
        playbackRate: 1,
      });
    } catch {
      // out-of-range values are rejected by some browsers
    }
  }, [supported, song, duration, positionBucket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buttons
  useEffect(() => {
    if (!supported) return undefined;

    const actions = {
      play: () => handlersRef.current.play?.(),
      pause: () => handlersRef.current.pause?.(),
      previoustrack: () => handlersRef.current.previoustrack?.(),
      nexttrack: () => handlersRef.current.nexttrack?.(),
      seekbackward: (d) => handlersRef.current.seekBy?.(-(d?.seekOffset || 10)),
      seekforward: (d) => handlersRef.current.seekBy?.(d?.seekOffset || 10),
      seekto: (d) => handlersRef.current.seekTo?.(d?.seekTime ?? 0),
    };

    for (const [name, fn] of Object.entries(actions)) {
      try {
        navigator.mediaSession.setActionHandler(name, fn);
      } catch {
        // action not supported on this browser
      }
    }

    return () => {
      for (const name of Object.keys(actions)) {
        try {
          navigator.mediaSession.setActionHandler(name, null);
        } catch {
          // ignore
        }
      }
    };
  }, [supported]);
}
