import { useCallback, useEffect, useRef, useState } from "react";

const WORKER_BASE = import.meta.env.VITE_WORKER_URL;
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

const LISTEN_SECONDS = 10;
const SAMPLE_SECONDS = 4;
const SAMPLE_RATE = 44100;

let turnstileScriptPromise = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );

    if (existing) {
      const check = setInterval(() => {
        if (window.turnstile) {
          clearInterval(check);
          resolve(window.turnstile);
        }
      }, 50);

      setTimeout(() => {
        clearInterval(check);
        if (!window.turnstile) {
          reject(new Error("Turnstile failed to load."));
        }
      }, 15000);

      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      const check = setInterval(() => {
        if (window.turnstile) {
          clearInterval(check);
          resolve(window.turnstile);
        }
      }, 50);

      setTimeout(() => {
        clearInterval(check);
        if (!window.turnstile) {
          reject(new Error("Turnstile API unavailable."));
        }
      }, 10000);
    };

    script.onerror = () =>
      reject(new Error("Could not load Cloudflare Turnstile."));

    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export function useAudioRecognition() {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(LISTEN_SECONDS);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const turnstileWidgetRef = useRef(null);
  const turnstileContainerRef = useRef(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const cleanupTurnstile = useCallback(() => {
    if (turnstileWidgetRef.current && window.turnstile) {
      try {
        window.turnstile.remove(turnstileWidgetRef.current);
      } catch {}
    }

    turnstileWidgetRef.current = null;

    if (turnstileContainerRef.current) {
      turnstileContainerRef.current.innerHTML = "";
    }
  }, []);

  useEffect(() => {
    const container = document.createElement("div");

    container.style.position = "fixed";
    container.style.left = "50%";
    container.style.bottom = "90px";
    container.style.transform = "translateX(-50%)";
    container.style.width = "300px";
    container.style.minHeight = "65px";
    container.style.zIndex = "99999";
    container.style.display = "flex";
    container.style.justifyContent = "center";
    container.style.alignItems = "center";

    document.body.appendChild(container);
    turnstileContainerRef.current = container;

    return () => {
      cleanupTurnstile();
      container.remove();
    };
  }, [cleanupTurnstile]);

  const getTurnstileToken = useCallback(async () => {
    if (!TURNSTILE_SITE_KEY) {
      throw new Error("Turnstile site key is not configured.");
    }

    const turnstile = await loadTurnstile();
    const container = turnstileContainerRef.current;

    if (!container) {
      throw new Error("Turnstile container unavailable.");
    }

    cleanupTurnstile();

    return new Promise((resolve, reject) => {
      let finished = false;

      const finish = (callback) => {
        if (finished) return;
        finished = true;
        callback();
      };

      const timeout = setTimeout(() => {
        finish(() =>
          reject(
            new Error("Security verification took too long. Please try again."),
          ),
        );
      }, 60000);

      const widgetId = turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "recognize",
        execution: "execute",
        appearance: "interaction-only",
        theme: "dark",
        "response-field": false,
        retry: "auto",
        "retry-interval": 8000,
        "refresh-expired": "auto",
        "refresh-timeout": "auto",

        callback: (token) => {
          clearTimeout(timeout);
          cleanupTurnstile();
          finish(() => resolve(token));
        },

        "error-callback": (code) => {
          clearTimeout(timeout);
          cleanupTurnstile();

          finish(() =>
            reject(
              new Error(
                `Security verification failed${
                  code ? ` (${code})` : ""
                }. Please try again.`,
              ),
            ),
          );

          return true;
        },

        "expired-callback": () => {
          clearTimeout(timeout);
          cleanupTurnstile();

          finish(() =>
            reject(
              new Error("Security verification expired. Please try again."),
            ),
          );
        },

        "unsupported-callback": () => {
          clearTimeout(timeout);
          cleanupTurnstile();

          finish(() =>
            reject(
              new Error("This browser does not support security verification."),
            ),
          );
        },
      });

      turnstileWidgetRef.current = widgetId;
      turnstile.execute(widgetId);
    });
  }, [cleanupTurnstile]);

  const decodeAudio = async (blob) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported.");
    }

    const context = new AudioContextClass();

    try {
      return await context.decodeAudioData(await blob.arrayBuffer());
    } finally {
      await context.close();
    }
  };

  const normalizeAudio = async (audioBuffer) => {
    const length = Math.floor(audioBuffer.duration * SAMPLE_RATE);

    const context = new OfflineAudioContext(1, length, SAMPLE_RATE);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    source.start(0);

    return context.startRendering();
  };

  const createPCM = (audioBuffer) => {
    const requiredSamples = SAMPLE_RATE * SAMPLE_SECONDS;

    if (audioBuffer.length < requiredSamples) {
      throw new Error(
        "Recording is too short. Please record for at least 4 seconds.",
      );
    }

    const start = Math.floor((audioBuffer.length - requiredSamples) / 2);

    const samples = audioBuffer
      .getChannelData(0)
      .slice(start, start + requiredSamples);

    const pcm = new Int16Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return pcm.buffer;
  };

  const sendToWorker = async (pcm, token) => {
    if (!WORKER_BASE) {
      throw new Error("VITE_WORKER_URL is not configured.");
    }

    const response = await fetch(`${WORKER_BASE}/recognize`, {
      method: "POST",
      headers: {
        "Content-Type": "audio/pcm",
        "X-Audio-Sample-Rate": String(SAMPLE_RATE),
        "X-Audio-Channels": "1",
        "X-Audio-Bits": "16",
        "X-Turnstile-Token": token,
      },
      body: pcm,
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Recognition service returned invalid data.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Song recognition failed.");
    }

    return data;
  };

  const reset = useCallback(() => {
    clearInterval(timerRef.current);

    if (mediaRecorderRef.current?.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    cleanupStream();
    cleanupTurnstile();

    mediaRecorderRef.current = null;
    chunksRef.current = [];

    setStatus("idle");
    setError(null);
    setSecondsLeft(LISTEN_SECONDS);
  }, [cleanupStream, cleanupTurnstile]);

  const listen = useCallback(
    async (onIdentified) => {
      clearInterval(timerRef.current);
      setError(null);
      setSecondsLeft(LISTEN_SECONDS);
      chunksRef.current = [];

      try {
        setStatus("verifying");

        const turnstileToken = await getTurnstileToken();

        setStatus("listening");

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
        } catch {
          throw new Error(
            "Microphone access was denied. Check your browser settings and try again.",
          );
        }

        streamRef.current = stream;

        const mimeTypes = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg",
        ];

        const mimeType = mimeTypes.find((type) =>
          MediaRecorder.isTypeSupported(type),
        );

        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data?.size) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          clearInterval(timerRef.current);
          cleanupStream();
          setStatus("error");
          setError("An error occurred while recording audio.");
        };

        recorder.onstop = async () => {
          clearInterval(timerRef.current);
          cleanupStream();
          setStatus("processing");

          try {
            const blob = new Blob(chunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            });

            if (!blob.size) {
              throw new Error("The microphone recording was empty.");
            }

            const decoded = await decodeAudio(blob);
            const normalized = await normalizeAudio(decoded);
            const pcm = createPCM(normalized);

            const data = await sendToWorker(pcm, turnstileToken);

            if (!data.matched) {
              setStatus("error");
              setError(
                "Couldn't identify that song. Try moving closer to the speaker and recording again.",
              );
              return;
            }

            setStatus("idle");
            setError(null);

            onIdentified({
              title: data.title,
              artist: data.artist,
              album: data.album,
              coverArt: data.coverArt,
              coverArtHq: data.coverArtHq,
              webUrl: data.webUrl,
              previewUrl: data.previewUrl,
              shazamId: data.shazamId,
            });
          } catch (err) {
            setStatus("error");
            setError(err?.message || "Could not identify the song.");
          } finally {
            mediaRecorderRef.current = null;
            chunksRef.current = [];
          }
        };

        recorder.start();

        timerRef.current = setInterval(() => {
          setSecondsLeft((seconds) => {
            if (seconds <= 1) {
              clearInterval(timerRef.current);

              if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop();
              }

              return 0;
            }

            return seconds - 1;
          });
        }, 1000);
      } catch (err) {
        cleanupStream();
        cleanupTurnstile();

        setStatus("error");
        setError(
          err?.message || "Security verification failed. Please try again.",
        );
      }
    },
    [cleanupStream, cleanupTurnstile, getTurnstileToken],
  );

  const stopEarly = useCallback(() => {
    clearInterval(timerRef.current);

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      cleanupStream();
      cleanupTurnstile();

      if (mediaRecorderRef.current?.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
    };
  }, [cleanupStream, cleanupTurnstile]);

  return {
    status,
    error,
    secondsLeft,
    listen,
    stopEarly,
    reset,
  };
}
