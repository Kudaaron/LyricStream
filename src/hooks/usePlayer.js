import { useState, useRef, useCallback } from "react";
import { fetchYouTubeVideoId } from "../api/youtube";
import { fetchItunesPreview } from "../api/itunes";

// Modes:
// 'youtube' — full song via YouTube IFrame (primary)
// 'preview' — 30s iTunes AAC via <audio> (fallback)
// 'sim'     — no audio, simulated timer (last resort)

export function usePlayer() {
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

  const updateLyricOffset = useCallback((val) => {
    lyricOffsetRef.current = val;
    setLyricOffset(val);
  }, []);

  // ── stop helpers ─────────────────────────────────────
  const stopSim = () => {
    clearInterval(simIntervalRef.current);
    simIntervalRef.current = null;
  };
  const stopAudio = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = "";
    }
    cancelAnimationFrame(rafRef.current);
  };
  const stopAll = () => {
    stopSim();
    stopAudio();
    setIsPlaying(false);
  };

  // ── load song ─────────────────────────────────────────
  const loadSong = useCallback(
    async (newSong) => {
      if (!newSong) {
        setSong(null);
        songRef.current = null;
        return;
      }

      stopAll();
      setCurrentSec(0);
      setDuration(newSong.duration || 0);
      setMode("sim");
      setVideoId(null);
      setLoading(true);
      updateLyricOffset(0);
      setSong(newSong);
      songRef.current = newSong;

      // 1. YouTube full song
      // If the song came with real lyric timestamps (e.g. from LRCLIB),
      // that confirms the song genuinely exists, so we tell the YouTube
      // lookup to try harder (looser matching) before giving up.
      const confirmedExists =
        newSong.lyrics?.length > 0 && newSong.duration > 0;
      try {
        const vid = await fetchYouTubeVideoId(
          newSong.title,
          newSong.artist,
          confirmedExists,
        );
        if (vid) {
          setVideoId(vid);
          setMode("youtube");
          setLoading(false);
          return;
        }
      } catch {}

      // 2. iTunes 30s preview fallback
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

      // 3. Sim mode
      setMode("sim");
      setLoading(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [volume, speed],
  );

  // ── YouTube player callbacks ──────────────────────────
  const onYTReady = useCallback(
    (ytPlayer) => {
      ytPlayerRef.current = ytPlayer;
      ytPlayer.setVolume(volume);
      ytPlayer.seekTo(0, true); // always start from beginning
    },
    [volume],
  );

  const onYTTimeUpdate = useCallback((t) => {
    setCurrentSec(t);
    const dur =
      ytPlayerRef.current?.getDuration?.() || songRef.current?.duration || 0;
    if (dur > 0) setDuration((d) => (d !== dur ? dur : d));
  }, []);

  const onYTStateChange = useCallback((state) => {
    // 1=playing 2=paused 0=ended
    setIsPlaying(state === 1);
  }, []);

  // ── audio RAF ────────────────────────────────────────
  const startRAF = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const a = audioRef.current;
      if (a && !a.paused && !a.ended) {
        setCurrentSec(a.currentTime);
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
        if (next >= dur) {
          stopSim();
          setIsPlaying(false);
          return dur;
        }
        return next;
      });
    }, 1000);
  }, [speed]);

  // ── play / pause ─────────────────────────────────────
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
    if (mode === "youtube") ytPlayerRef.current?.pauseVideo();
    else {
      stopAudio();
      stopSim();
    }
  }, [mode]);

  const togglePlay = useCallback(() => {
    isPlaying ? pause() : play();
  }, [isPlaying, play, pause]);

  // ── seek ─────────────────────────────────────────────
  const seekTo = useCallback(
    (sec) => {
      const dur = duration || songRef.current?.duration || 0;
      const t = Math.max(0, Math.min(dur, sec));
      setCurrentSec(t);
      if (mode === "youtube") ytPlayerRef.current?.seekTo(t, true);
      else if (mode === "preview" && audioRef.current?.src) {
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

  const restart = useCallback(() => seekTo(0), [seekTo]);
  const skipForward = useCallback(
    () => seekTo(currentSec + 10),
    [seekTo, currentSec],
  );

  // ── volume / speed ────────────────────────────────────
  const setVolumeSynced = useCallback((v) => {
    setVolume(v);
    ytPlayerRef.current?.setVolume(v);
    if (audioRef.current) audioRef.current.volume = v / 100;
  }, []);

  const setSpeedSynced = useCallback((s) => {
    setSpeed(s);
    ytPlayerRef.current?.setPlaybackRate(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }, []);

  // ── manual override: user pastes their own YouTube URL ─
  const manualSetVideoId = useCallback((vid) => {
    stopAll();
    setCurrentSec(0);
    setVideoId(vid);
    setMode("youtube");
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── active lyric index (with offset) ─────────────────
  // Returns -1 during intro (before first lyric timestamp is reached)
  const activeLyricIdx = (() => {
    const lyrics = songRef.current?.lyrics;
    if (!lyrics || !lyrics.length) return -1;
    const adj = currentSec + lyricOffset;
    // If we haven't reached the first lyric yet, return -1 (intro state)
    if (adj < lyrics[0].t) return -1;
    let idx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (adj >= lyrics[i].t) idx = i;
    }
    return idx;
  })();

  // How many seconds until first lyric (for intro countdown)
  const introSecsRemaining = (() => {
    const lyrics = songRef.current?.lyrics;
    if (!lyrics || !lyrics.length) return 0;
    const firstT = lyrics[0].t;
    const adj = currentSec + lyricOffset;
    return adj < firstT ? Math.ceil(firstT - adj) : 0;
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
