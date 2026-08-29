import { useState, useRef, useCallback } from "react";

const WORKER_BASE = import.meta.env.VITE_WORKER_URL;

// Record 5 seconds.
// We will extract a 4-second section for Shazam.
const LISTEN_SECONDS = 10;

const TARGET_SAMPLE_RATE = 44100;
const TARGET_CHANNELS = 1;
const SAMPLE_SECONDS = 4;

export function useAudioRecognition() {
  const [status, setStatus] = useState("idle");

  const [error, setError] = useState(null);

  const [secondsLeft, setSecondsLeft] = useState(LISTEN_SECONDS);

  const mediaRecorderRef = useRef(null);

  const streamRef = useRef(null);

  const chunksRef = useRef([]);

  const timerRef = useRef(null);

  // ─────────────────────────────────────────────
  // Cleanup microphone
  // ─────────────────────────────────────────────

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());

      streamRef.current = null;
    }
  }, []);

  // ─────────────────────────────────────────────
  // Reset
  // ─────────────────────────────────────────────

  const reset = useCallback(() => {
    clearInterval(timerRef.current);

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }

    cleanupStream();

    mediaRecorderRef.current = null;

    chunksRef.current = [];

    setStatus("idle");
    setError(null);
    setSecondsLeft(LISTEN_SECONDS);
  }, [cleanupStream]);

  // ─────────────────────────────────────────────
  // Convert AudioBuffer to 44.1kHz mono
  // ─────────────────────────────────────────────

  const convertToMono44100 = async (audioBuffer) => {
    const targetLength = Math.floor(audioBuffer.duration * TARGET_SAMPLE_RATE);

    const offlineContext = new OfflineAudioContext(
      TARGET_CHANNELS,
      targetLength,
      TARGET_SAMPLE_RATE,
    );

    const source = offlineContext.createBufferSource();

    source.buffer = audioBuffer;

    source.connect(offlineContext.destination);

    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();

    return renderedBuffer;
  };

  // ─────────────────────────────────────────────
  // Convert Float32 PCM → signed 16-bit PCM
  // ─────────────────────────────────────────────

  const float32ToInt16 = (float32Array) => {
    const int16Array = new Int16Array(float32Array.length);

    for (let i = 0; i < float32Array.length; i++) {
      let sample = float32Array[i];

      // Clamp
      sample = Math.max(-1, Math.min(1, sample));

      // Convert to signed 16-bit PCM
      if (sample < 0) {
        int16Array[i] = sample * 0x8000;
      } else {
        int16Array[i] = sample * 0x7fff;
      }
    }

    return int16Array;
  };

  // ─────────────────────────────────────────────
  // Extract exactly 4 seconds
  // ─────────────────────────────────────────────

  const extractFourSecondSample = (audioBuffer) => {
    const availableSamples = audioBuffer.length;

    const requiredSamples = TARGET_SAMPLE_RATE * SAMPLE_SECONDS;

    if (availableSamples < requiredSamples) {
      throw new Error(
        `Recording is too short. Need at least ${SAMPLE_SECONDS} seconds of audio.`,
      );
    }

    // Take the middle 4 seconds.
    //
    // Example:
    // 5-second recording
    // ↓
    // remove 0.5 sec from beginning
    // remove 0.5 sec from end
    // ↓
    // 4-second sample

    const start = Math.floor((availableSamples - requiredSamples) / 2);

    const channelData = audioBuffer
      .getChannelData(0)
      .slice(start, start + requiredSamples);

    return channelData;
  };

  // ─────────────────────────────────────────────
  // Create raw PCM ArrayBuffer
  // ─────────────────────────────────────────────

  const createPCMBuffer = (float32Samples) => {
    const int16Samples = float32ToInt16(float32Samples);

    return int16Samples.buffer;
  };

  // ─────────────────────────────────────────────
  // Decode recorded WebM/MP4/OGG
  // ─────────────────────────────────────────────

  const decodeRecordedAudio = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported by this browser.");
    }

    const audioContext = new AudioContextClass();

    try {
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      return decoded;
    } finally {
      await audioContext.close();
    }
  };

  // ─────────────────────────────────────────────
  // Send PCM to Worker
  // ─────────────────────────────────────────────

  const sendToWorker = async (pcmBuffer) => {
    console.log("Sending PCM bytes:", pcmBuffer.byteLength);

    const res = await fetch(`${WORKER_BASE}/recognize`, {
      method: "POST",

      headers: {
        "Content-Type": "audio/pcm",

        "X-Audio-Sample-Rate": String(TARGET_SAMPLE_RATE),

        "X-Audio-Channels": String(TARGET_CHANNELS),

        "X-Audio-Bits": "16",
      },

      body: pcmBuffer,
    });

    const responseText = await res.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Worker returned invalid JSON: ${responseText.slice(0, 300)}`,
      );
    }

    if (!res.ok) {
      throw new Error(data.error || "Song recognition request failed.");
    }

    return data;
  };

  // ─────────────────────────────────────────────
  // Listen
  // ─────────────────────────────────────────────

  const listen = useCallback(
    async (onIdentified) => {
      clearInterval(timerRef.current);

      setError(null);

      setStatus("listening");

      setSecondsLeft(LISTEN_SECONDS);

      chunksRef.current = [];

      // ───────────────────────────────────────
      // Get microphone
      // ───────────────────────────────────────

      let stream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,

            echoCancellation: false,

            noiseSuppression: false,

            autoGainControl: false,
          },
        });
      } catch (err) {
        console.error("Microphone error:", err);

        setStatus("error");

        setError(
          "Microphone access was denied. Check your browser settings and try again.",
        );

        return;
      }

      streamRef.current = stream;

      // ───────────────────────────────────────
      // Select recording format
      // ───────────────────────────────────────

      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];

      const mimeType =
        supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) ||
        "";

      let recorder;

      try {
        recorder = mimeType
          ? new MediaRecorder(stream, {
              mimeType,
            })
          : new MediaRecorder(stream);
      } catch (err) {
        cleanupStream();

        setStatus("error");

        setError("Your browser cannot create an audio recorder.");

        return;
      }

      mediaRecorderRef.current = recorder;

      // ───────────────────────────────────────
      // Collect audio chunks
      // ───────────────────────────────────────

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // ───────────────────────────────────────
      // Recording stopped
      // ───────────────────────────────────────

      recorder.onstop = async () => {
        clearInterval(timerRef.current);

        cleanupStream();

        setStatus("processing");

        try {
          // ───────────────────────────────────
          // Build recorded WebM/MP4 blob
          // ───────────────────────────────────

          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });

          console.log("Recorded blob:", {
            type: blob.type,
            size: blob.size,
          });

          if (blob.size === 0) {
            throw new Error("The microphone recording was empty.");
          }

          // ───────────────────────────────────
          // Decode WebM/MP4 → AudioBuffer
          // ───────────────────────────────────

          console.log("Decoding microphone audio...");

          const decoded = await decodeRecordedAudio(blob);

          console.log("Decoded audio:", {
            duration: decoded.duration,

            sampleRate: decoded.sampleRate,

            channels: decoded.numberOfChannels,
          });

          // ───────────────────────────────────
          // Resample → 44.1 kHz mono
          // ───────────────────────────────────

          console.log("Converting to 44.1kHz mono...");

          const normalized = await convertToMono44100(decoded);

          console.log("Normalized audio:", {
            duration: normalized.duration,

            sampleRate: normalized.sampleRate,

            channels: normalized.numberOfChannels,
          });

          // ───────────────────────────────────
          // Take exactly 4 seconds
          // ───────────────────────────────────

          const samples = extractFourSecondSample(normalized);

          console.log("Selected sample:", {
            seconds: samples.length / TARGET_SAMPLE_RATE,

            samples: samples.length,
          });

          // ───────────────────────────────────
          // Float32 → signed 16-bit PCM
          // ───────────────────────────────────

          const pcmBuffer = createPCMBuffer(samples);

          console.log("PCM:", {
            bytes: pcmBuffer.byteLength,

            expectedBytes: TARGET_SAMPLE_RATE * SAMPLE_SECONDS * 2,
          });

          // Expected:
          //
          // 44,100 samples/sec
          // × 4 seconds
          // × 2 bytes/sample
          //
          // = 352,800 bytes
          //
          // This is comfortably below 500 KB.

          // ───────────────────────────────────
          // Send to Cloudflare Worker
          // ───────────────────────────────────

          const data = await sendToWorker(pcmBuffer);

          console.log("Recognition response:", data);

          // ───────────────────────────────────
          // No match
          // ───────────────────────────────────

          if (!data.matched) {
            setStatus("error");

            setError(
              "Couldn't identify that song. Try moving closer to the speaker and recording again.",
            );

            return;
          }

          // ───────────────────────────────────
          // Match
          // ───────────────────────────────────

          setStatus("idle");

          onIdentified({
            title: data.title,

            artist: data.artist,

            album: data.album,

            coverArt: data.coverArt,

            spotifyUrl: data.spotifyUrl,
          });
        } catch (err) {
          console.error("Audio recognition error:", err);

          setStatus("error");

          setError(err?.message || "Could not identify the song.");
        } finally {
          mediaRecorderRef.current = null;

          chunksRef.current = [];
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);

        clearInterval(timerRef.current);

        cleanupStream();

        setStatus("error");

        setError("An error occurred while recording audio.");
      };

      // ───────────────────────────────────────
      // Start recording
      // ───────────────────────────────────────

      try {
        recorder.start();
      } catch (err) {
        console.error("Could not start recorder:", err);

        cleanupStream();

        setStatus("error");

        setError("Could not start microphone recording.");

        return;
      }

      // ───────────────────────────────────────
      // Countdown
      // ───────────────────────────────────────

      timerRef.current = setInterval(() => {
        setSecondsLeft((seconds) => {
          if (seconds <= 1) {
            clearInterval(timerRef.current);

            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === "recording"
            ) {
              mediaRecorderRef.current.stop();
            }

            return 0;
          }

          return seconds - 1;
        });
      }, 1000);
    },
    [cleanupStream],
  );

  // ─────────────────────────────────────────────
  // Stop early
  // ─────────────────────────────────────────────

  const stopEarly = useCallback(() => {
    clearInterval(timerRef.current);

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ─────────────────────────────────────────────
  // Return hook
  // ─────────────────────────────────────────────

  return {
    status,
    error,
    secondsLeft,
    listen,
    stopEarly,
    reset,
  };
}
