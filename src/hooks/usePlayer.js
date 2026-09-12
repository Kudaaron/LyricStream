import { useState, useRef, useCallback } from "react";
import { fetchItunesPreview } from "../api/itunes";

export function usePlayer({ onSongLoad } = {}) {
  const [song, setSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [mode, setMode] = useState("sim");
  const [videoId, setVideoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lyricOffset, setLyricOffset] = useState(0);

  const audioRef = useRef(null);
  const simIntervalRef = useRef(null);
  const songRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const rafRef = useRef(null);
  const lyricOffsetRef = useRef(0);
  const isFreshLoadRef = useRef(false);

  const updateLyricOffset = useCallback((val) => {
    lyricOffsetRef.current = val;
    setLyricOffset(val);
  }, []);

  const stopSim = () => {
    clearInterval(simIntervalRef.current);
    simIntervalRef.current = null;
  };

  const stopAudio = () => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.src = "";
    }

    cancelAnimationFrame(rafRef.current);
  };

  const stopAll = () => {
    stopSim();
    stopAudio();
    setIsPlaying(false);
  };

  const loadSong = useCallback(
    async (newSong) => {
      if (!newSong) {
        stopAll();
        setSong(null);
        songRef.current = null;
        setVideoId(null);
        setMode("sim");
        setLoading(false);
        return;
      }

      stopAll();

      setCurrentSec(0);
      setDuration(newSong.duration || 0);
      setMode(newSong.youtubeVideoId ? "youtube" : "sim");
      setVideoId(newSong.youtubeVideoId || null);
      setLoading(!!newSong.youtubeVideoId);
      updateLyricOffset(0);

      setSong(newSong);
      songRef.current = newSong;
      isFreshLoadRef.current = true;

      if (onSongLoad && !newSong.isPlaceholder) {
        onSongLoad(newSong);
      }

      if (newSong.youtubeVideoId) {
        setLoading(false);
        return;
      }

      try {
        const prev = await fetchItunesPreview(newSong.title, newSong.artist);

        if (prev) {
          setMode("preview");
          setLoading(false);

          let audio = audioRef.current;

          if (!audio) {
            audio = new Audio();
            audio.preload = "auto";
            audioRef.current = audio;
          }

          audio.volume = volume / 100;
          audio.playbackRate = speed;
          audio.src = prev;
          audio.load();

          audio.onended = () => {
            setIsPlaying(false);
            cancelAnimationFrame(rafRef.current);
          };

          return;
        }
      } catch {}

      setMode("sim");
      setLoading(false);
    },
    [volume, speed, onSongLoad, updateLyricOffset],
  );

  const onYTReady = useCallback(
    (ytPlayer) => {
      ytPlayerRef.current = ytPlayer;
      ytPlayer.setVolume(volume);

      if (isFreshLoadRef.current) {
        ytPlayer.seekTo(0, true);
        isFreshLoadRef.current = false;
      }
    },
    [volume],
  );

  const onYTTimeUpdate = useCallback((t) => {
    setCurrentSec(t);

    const dur =
      ytPlayerRef.current?.getDuration?.() || songRef.current?.duration || 0;

    if (dur > 0) {
      setDuration((old) => (old !== dur ? dur : old));
    }
  }, []);

  const onYTStateChange = useCallback((state) => {
    setIsPlaying(state === 1);
  }, []);

  const startRAF = useCallback(() => {
    cancelAnimationFrame(rafRef.current);

    const tick = () => {
      const audio = audioRef.current;

      if (audio && !audio.paused && !audio.ended) {
        setCurrentSec(audio.currentTime);
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startSim = useCallback(() => {
    stopSim();

    simIntervalRef.current = setInterval(() => {
      setCurrentSec((prev) => {
        const next = prev + (speed || 1);
        const dur = songRef.current?.duration || 0;

        if (dur > 0 && next >= dur) {
          stopSim();
          setIsPlaying(false);
          return dur;
        }

        return next;
      });
    }, 1000);
  }, [speed]);

  const play = useCallback(() => {
    if (!songRef.current) return;

    setIsPlaying(true);

    if (mode === "youtube") {
      ytPlayerRef.current?.playVideo();
    } else if (mode === "preview" && audioRef.current?.src) {
      audioRef.current.playbackRate = speed;
      audioRef.current.volume = volume / 100;

      audioRef.current
        .play()
        .then(() => startRAF())
        .catch(() => {
          setMode("sim");
          startSim();
        });
    } else {
      startSim();
    }
  }, [mode, speed, volume, startRAF, startSim]);

  const pause = useCallback(() => {
    setIsPlaying(false);

    if (mode === "youtube") {
      ytPlayerRef.current?.pauseVideo();
    } else {
      stopAudio();
      stopSim();
    }
  }, [mode]);

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
      const t = dur > 0 ? Math.max(0, Math.min(dur, sec)) : Math.max(0, sec);

      setCurrentSec(t);

      if (mode === "youtube") {
        ytPlayerRef.current?.seekTo(t, true);
      } else if (mode === "preview" && audioRef.current?.src) {
        try {
          audioRef.current.currentTime = t;
        } catch {}
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
  }, [seekTo, currentSec]);

  const setVolumeSynced = useCallback((value) => {
    setVolume(value);
    ytPlayerRef.current?.setVolume(value);

    if (audioRef.current) {
      audioRef.current.volume = value / 100;
    }
  }, []);

  const setSpeedSynced = useCallback((value) => {
    setSpeed(value);
    ytPlayerRef.current?.setPlaybackRate(value);

    if (audioRef.current) {
      audioRef.current.playbackRate = value;
    }
  }, []);

  const manualSetVideoId = useCallback((vid) => {
    if (!vid) return;

    stopAll();
    setCurrentSec(0);
    setVideoId(vid);
    setMode("youtube");
    setLoading(false);
    isFreshLoadRef.current = true;
  }, []);

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
