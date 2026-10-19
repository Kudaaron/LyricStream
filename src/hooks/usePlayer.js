import { useState, useRef, useCallback, useEffect } from "react";

export function usePlayer({ onSongLoad, onEnded } = {}) {
  const [song, setSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [mode, setMode] = useState("youtube");
  const [videoId, setVideoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lyricOffset, setLyricOffset] = useState(0);

  const songRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const lyricOffsetRef = useRef(0);
  const isFreshLoadRef = useRef(false);
  const hasHandledEndedRef = useRef(false);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const updateLyricOffset = useCallback((val) => {
    lyricOffsetRef.current = val;
    setLyricOffset(val);
  }, []);

  const stopAll = useCallback(() => {
    try {
      ytPlayerRef.current?.pauseVideo();
    } catch {
      // The YouTube player may not be ready yet.
    }

    setIsPlaying(false);
  }, []);

  const loadSong = useCallback(
    async (newSong) => {
      stopAll();

      if (!newSong) {
        setSong(null);
        songRef.current = null;
        setVideoId(null);
        setCurrentSec(0);
        setDuration(0);
        setMode("youtube");
        setLoading(false);
        isFreshLoadRef.current = false;
        hasHandledEndedRef.current = false;
        updateLyricOffset(0);
        return false;
      }

      const hasLyrics =
        Array.isArray(newSong.lyrics) && newSong.lyrics.length > 0;

      const hasVideo =
        typeof newSong.youtubeVideoId === "string" &&
        newSong.youtubeVideoId.trim().length > 0;

      // Reject songs without both lyrics and a YouTube video.
      if (!hasLyrics || !hasVideo || newSong.isPlaceholder) {
        setSong(null);
        songRef.current = null;
        setVideoId(null);
        setCurrentSec(0);
        setDuration(0);
        setMode("youtube");
        setLoading(false);
        isFreshLoadRef.current = false;
        hasHandledEndedRef.current = false;
        updateLyricOffset(0);
        return false;
      }

      hasHandledEndedRef.current = false;
      isFreshLoadRef.current = true;

      setCurrentSec(0);
      setDuration(newSong.duration || 0);
      setMode("youtube");
      setVideoId(newSong.youtubeVideoId);
      setLoading(true);
      updateLyricOffset(0);

      setSong(newSong);
      songRef.current = newSong;

      if (onSongLoad) {
        onSongLoad(newSong);
      }

      return true;
    },
    [onSongLoad, stopAll, updateLyricOffset],
  );

  const onYTReady = useCallback(
    (ytPlayer) => {
      ytPlayerRef.current = ytPlayer;

      try {
        ytPlayer.setVolume(volume);

        if (isFreshLoadRef.current) {
          ytPlayer.seekTo(0, true);
          isFreshLoadRef.current = false;
        }

        setLoading(false);
      } catch {
        setLoading(false);
      }
    },
    [volume],
  );

  const onYTTimeUpdate = useCallback((t) => {
    setCurrentSec(t);

    const actualDuration =
      ytPlayerRef.current?.getDuration?.() || songRef.current?.duration || 0;

    if (actualDuration > 0) {
      setDuration((old) => (old !== actualDuration ? actualDuration : old));
    }
  }, []);

  const onYTStateChange = useCallback((state) => {
    // YouTube IFrame API: 0 = ended, 1 = playing, 2 = paused.
    setIsPlaying(state === 1);

    if (state === 1) {
      hasHandledEndedRef.current = false;
      setLoading(false);
    }

    if (state === 0 && !hasHandledEndedRef.current) {
      hasHandledEndedRef.current = true;
      onEndedRef.current?.();
    }
  }, []);

  const play = useCallback(() => {
    const currentSong = songRef.current;

    if (
      !currentSong?.youtubeVideoId ||
      !Array.isArray(currentSong.lyrics) ||
      currentSong.lyrics.length === 0
    ) {
      setIsPlaying(false);
      return;
    }

    try {
      ytPlayerRef.current?.playVideo();
    } catch {
      setIsPlaying(false);
    }
  }, []);

  const pause = useCallback(() => {
    try {
      ytPlayerRef.current?.pauseVideo();
    } catch {
      // Player may not be ready.
    }

    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seekTo = useCallback(
    (sec) => {
      const dur = duration || songRef.current?.duration || 0;

      const target =
        dur > 0 ? Math.max(0, Math.min(dur, sec)) : Math.max(0, sec);

      setCurrentSec(target);

      if (mode === "youtube") {
        try {
          ytPlayerRef.current?.seekTo(target, true);
        } catch {
          // Player may not be ready.
        }
      }
    },
    [mode, duration],
  );

  const seekByPercent = useCallback(
    (pct) => {
      seekTo(pct * (duration || songRef.current?.duration || 0));
    },
    [duration, seekTo],
  );

  const restart = useCallback(() => {
    seekTo(0);
  }, [seekTo]);

  const skipForward = useCallback(() => {
    seekTo(currentSec + 10);
  }, [currentSec, seekTo]);

  const setVolumeSynced = useCallback((value) => {
    setVolume(value);

    try {
      ytPlayerRef.current?.setVolume(value);
    } catch {
      // Player may not be ready.
    }
  }, []);

  const setSpeedSynced = useCallback((value) => {
    setSpeed(value);

    try {
      ytPlayerRef.current?.setPlaybackRate(value);
    } catch {
      // Player may not be ready.
    }
  }, []);

  const manualSetVideoId = useCallback(
    (vid) => {
      if (!vid || !songRef.current?.lyrics?.length) {
        return;
      }

      stopAll();

      const updatedSong = {
        ...songRef.current,
        youtubeVideoId: vid,
      };

      songRef.current = updatedSong;
      setSong(updatedSong);

      setCurrentSec(0);
      setVideoId(vid);
      setMode("youtube");
      setLoading(true);
      isFreshLoadRef.current = true;
      hasHandledEndedRef.current = false;
    },
    [stopAll],
  );

  const activeLyricIdx = (() => {
    const lyrics = songRef.current?.lyrics;

    if (!lyrics?.length) return -1;

    const adjusted = currentSec + lyricOffset;

    if (adjusted < lyrics[0].t) {
      return -1;
    }

    let index = 0;

    for (let i = 0; i < lyrics.length; i++) {
      if (adjusted >= lyrics[i].t) {
        index = i;
      }
    }

    return index;
  })();

  const introSecsRemaining = (() => {
    const lyrics = songRef.current?.lyrics;

    if (!lyrics?.length) return 0;

    const firstTime = lyrics[0].t;
    const adjusted = currentSec + lyricOffset;

    return adjusted < firstTime ? Math.ceil(firstTime - adjusted) : 0;
  })();

  const effectiveDuration = duration || song?.duration || 0;

  const progress =
    effectiveDuration > 0
      ? Math.min(100, (currentSec / effectiveDuration) * 100)
      : 0;

  return {
    song,
    loadSong,
    isPlaying,
    togglePlay,
    play,
    pause,
    currentSec,
    duration: effectiveDuration,
    seekTo,
    seekByPercent,
    restart,
    skipForward,
    speed,
    setSpeed: setSpeedSynced,
    volume,
    setVolume: setVolumeSynced,
    mode,
    videoId,
    loading,
    lyricOffset,
    setLyricOffset: updateLyricOffset,
    onYTReady,
    onYTTimeUpdate,
    onYTStateChange,
    manualSetVideoId,
    activeLyricIdx,
    introSecsRemaining,
    progress,
  };
}
