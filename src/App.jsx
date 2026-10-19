import { useState, useCallback, useRef, lazy, Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";

import Navbar from "./components/Navbar";
import FavouritesTab from "./components/FavouritesTab";
import SearchTab from "./components/SearchTab";
import Toast from "./components/Toast";
import MiniPlayerBar from "./components/MiniPlayerBar";
import Footer from "./components/Footer";
import CreditBadge from "./components/CreditBadge";
import GenrePicker from "./components/GenrePicker";
import SkipControls from "./components/SkipControls";
import { GENRE_ARTISTS } from "./data/genreArtists";
import ErrorBoundary from "./components/ErrorBoundary";

const AboutTab = lazy(() => import("./components/AboutTab"));

import { useTheme } from "./hooks/useTheme";
import { usePlayer } from "./hooks/usePlayer";
import { useFavorites } from "./hooks/useFavorites";
import { useRecentlyPlayed } from "./hooks/useRecentlyPlayed";
import { useGenrePreference } from "./hooks/useGenrePreference";
import { useToast } from "./hooks/useToast";

import {
  fetchLRCLibLyrics,
  searchLRCLib,
  searchLRCLibByArtist,
  searchLRCLibFuzzy,
  resolvePickedSong,
  isLRCLibDown,
  resetLRCLibHealth,
} from "./api/lrclib";

import {
  fetchYouTubeVideo,
  extractVideoIdFromUrl,
} from "./api/youtube";

import "./styles/main.css";

function cleanYouTubeTitle(title = "") {
  return title
    .replace(/\s*\((?:official|audio|video|lyrics?|hd|hq)[^)]*\)\s*/gi, " ")
    .replace(/\s*\[(?:official|audio|video|lyrics?|hd|hq)[^\]]*\]\s*/gi, " ")
    .replace(/\b(official|audio|video|lyrics?|hd|hq|4k)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleLooksRelated(youtubeTitle, requestedTitle) {
  const a = cleanYouTubeTitle(youtubeTitle).toLowerCase();
  const b = cleanYouTubeTitle(requestedTitle).toLowerCase();

  if (!a || !b) return false;

  if (a === b) return true;

  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));

  let matches = 0;

  for (const word of bWords) {
    if (aWords.has(word)) matches++;
  }

  return matches >= Math.max(1, Math.ceil(bWords.size * 0.6));
}

// Do two artist strings refer to the same act? Compares meaningful name words
// ("Leonard Zhakata" ~ "Leonard Karikoga Zhakata", but not "Tembalami").
const ARTIST_STOP_WORDS = new Set([
  "dj", "de", "the", "and", "feat", "ft", "featuring", "mc", "la", "el", "of", "jr", "with", "x",
]);

function artistWords(value = "") {
  const all = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);
  const meaningful = all.filter((w) => !ARTIST_STOP_WORDS.has(w));
  return meaningful.length ? meaningful : all;
}

function artistsMatch(requested = "", returned = "") {
  if (!requested || !returned) return true; // nothing to compare against
  const a = artistWords(requested);
  const b = new Set(artistWords(returned));
  if (!a.length || !b.size) return true;
  return a.some((w) => b.has(w));
}

async function getLyricsForSong(
  title,
  artist,
  youtubeTitle = "",
  shazamId = null,
  { interactive = true } = {},
) {
  // LRCLIB is the PRIMARY source. A lookup started by the user always begins
  // by asking it, even if an earlier request had tripped the breaker.
  // (Autoplay passes interactive:false so a rate limit is still respected.)
  if (interactive) resetLRCLibHealth();

  const fromLRCLib = async () => {
    // 1) Exact match attempts.
    const candidates = [
      { title: cleanYouTubeTitle(youtubeTitle), artist },
      { title, artist },
    ].filter((x) => x.title);

    for (const candidate of candidates) {
      if (isLRCLibDown()) return null;

      try {
        const result = await fetchLRCLibLyrics(candidate.title, candidate.artist);

        if (
          result?.lyrics?.length &&
          titleLooksRelated(result.title, title) &&
          (!artist || artistsMatch(artist, result.artist))
        ) {
          return result;
        }
      } catch { }
    }

    // 2) Broader LRCLIB searches.
    const queries = [
      `${cleanYouTubeTitle(youtubeTitle)} ${artist}`.trim(),
      `${title} ${artist}`.trim(),
      title.trim(),
    ].filter((q, i, arr) => q && arr.indexOf(q) === i);

    for (const query of queries) {
      if (isLRCLibDown()) return null;

      try {
        const results = await searchLRCLib(query);

        if (!results.length) continue;

        // Only keep results by the requested artist — never lyrics from a
        // different act that merely shares the song title.
        const ranked = results
          .filter((result) => artistsMatch(artist, result.artist))
          .map((result) => {
            const resultTitle = result.title || "";
            const resultArtist = result.artist || "";
            const titleScore = titleLooksRelated(resultTitle, title) ? 1 : 0;
            const artistScore =
              artist && resultArtist.toLowerCase().includes(artist.toLowerCase()) ? 1 : 0;

            return { result, score: titleScore * 100 + artistScore * 50 };
          })
          .sort((a, b) => b.score - a.score);

        // score >= 100 means the title matched (artist already verified above)
        const best = ranked[0]?.score >= 100 ? ranked[0].result : null;

        if (best) {
          const resolved = await resolvePickedSong(best);
          if (resolved?.lyrics?.length) return resolved;
        }
      } catch { }
    }

    return null;
  };

  // Shazam is only a FALLBACK: it runs after LRCLIB has found nothing (or has
  // errored / been rate-limited), and it can never block or replace LRCLIB.
  const fromShazam = async () => {
    try {
      const id = shazamId || (await searchShazamForId(title, artist, youtubeTitle));
      if (!id) return null;

      const lines = await fetchShazamLyrics(id);
      if (!lines?.length) return null;

      return {
        title,
        artist,
        duration: 0,
        lyrics: lines,
        aiGenerated: false,
        source: "shazam",
      };
    } catch {
      return null;
    }
  };

  let fromLrc = null;
  try {
    fromLrc = await fromLRCLib();
  } catch {
    fromLrc = null;
  }

  if (fromLrc) return fromLrc;

  return fromShazam();
}


// Searches Shazam for a song by title+artist and returns the Shazam
// track ID. Used when a typed search / YouTube URL / favourite replay
// reaches LRCLIB with no match — we need an ID before we can fetch
// Shazam's own lyrics for that track.
let shazamSearchPausedUntil = 0;

async function searchShazamForId(title, artist, youtubeTitle = "") {
  const workerBase = import.meta.env.VITE_WORKER_URL;
  if (!workerBase) return null;

  const stripDash = (v = "") => v.replace(/[-–—]+/g, " ").replace(/\s+/g, " ").trim();
  const tokensOf = (v = "") => normName(v).split(" ").filter(Boolean);

  const ytClean = stripDash(cleanYouTubeTitle(youtubeTitle));

  // Several phrasings in parallel: "title artist", the YouTube title, title alone.
  // Max 2 queries: every one is a metered RapidAPI request.
  const queries = [
    stripDash(`${title} ${artist || ""}`),
    ytClean,
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);

  // Everything we know about the song, as words. A Shazam hit is accepted when
  // its title is made of those words (so "advertise winky d" still matches
  // the hit "Advertise").
  const queryTokens = new Set([
    ...tokensOf(title),
    ...tokensOf(artist),
    ...tokensOf(ytClean),
  ]);

  const acceptable = (hit) => {
    if (!hit?.shazamId) return false;
    if (!hit.title) return true; // old Worker shape: nothing to verify

    const hitTitleTokens = tokensOf(
      hit.title.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\b(feat|ft)\b.*$/i, ""),
    );
    if (!hitTitleTokens.length) return false;
    if (!hitTitleTokens.every((w) => queryTokens.has(w))) return false;

    // If the query had words beyond the title, they are the artist: check it.
    const hasExtra = [...queryTokens].some((w) => !hitTitleTokens.includes(w));
    if (hasExtra && hit.artist) {
      return tokensOf(hit.artist).some((w) => queryTokens.has(w));
    }
    return true;
  };

  // If Shazam search is failing upstream, stop asking for 10 minutes.
  if (Date.now() < shazamSearchPausedUntil) return null;

  const lookup = async (q) => {
    try {
      const res = await fetch(`${workerBase}/shazam-search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return null;
      const data = await res.json();

      if (data?.error) {
        const alreadyPaused = Date.now() < shazamSearchPausedUntil;
        shazamSearchPausedUntil = Date.now() + 10 * 60 * 1000;
        if (alreadyPaused) return null;
      }

      if (data?.error) debug.warn("[shazam-search]", data.error);

      const hits = data?.results?.length ? data.results : [data];
      const hit = hits.find(acceptable);
      if (!hit) return null;

      // Shazam/Apple says this song has no lyrics: don't spend a request on it.
      if (hit.hasLyrics === false) {
        debug.info("[shazam] no lyrics published for:", hit.title, "-", hit.artist);
        return null;
      }

      return hit.shazamId;
    } catch {
      return null;
    }
  };

  const found = await Promise.all(queries.map(lookup));
  return found.find(Boolean) || null;
}

// Search candidates using genre-specific terms. iTunes is discovery only;
// a track is playable only after YouTube and lyrics checks succeed.
function titleLooksLikeWrongGenre(genre, title = "", artist = "") {
  const text = `${title} ${artist}`.toLowerCase();

  // Avoid obvious gospel results in non-gospel genres. This is a conservative
  // guard, not a complete genre classifier.
  if (
    genre !== "Gospel" &&
    genre !== "Zimbabwean Gospel" &&
    /\b(gospel|worship|praise|church choir|ministry)\b/i.test(text)
  ) {
    return true;
  }

  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normName = (v = "") =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// iTunes lookup BY ARTIST. A track is only accepted if its artist really is
// the seed artist, so covers / unrelated "genre" matches can't slip in.
async function fetchArtistTracks(artist) {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&attribute=artistTerm&limit=40`,
    );
    if (!res.ok) return [];

    const data = await res.json();
    const want = normName(artist);

    return (data.results || [])
      .filter(
        (t) =>
          t.trackName &&
          t.artistName &&
          normName(t.artistName).includes(want),
      )
      .map((t) => ({ title: t.trackName, artist: t.artistName }));
  } catch {
    return [];
  }
}

async function fetchGenreCandidates(genre, excludeTitles = []) {
  const seeds = GENRE_ARTISTS[genre] || [];
  if (!seeds.length) return [];

  const excluded = new Set(excludeTitles.map((title) => title.toLowerCase()));
  const seen = new Set();
  const collected = [];

  // Query seed artists in random order, 4 at a time, until we have enough.
  const order = shuffleInPlace([...seeds]);

  for (let i = 0; i < order.length && collected.length < 40; i += 4) {
    const batch = await Promise.all(order.slice(i, i + 4).map(fetchArtistTracks));

    for (const track of batch.flat()) {
      const key = track.title.toLowerCase();
      if (excluded.has(key) || seen.has(key)) continue;
      if (titleLooksLikeWrongGenre(genre, track.title, track.artist)) continue;

      seen.add(key);
      collected.push(track);
    }
  }

  return shuffleInPlace(collected);
}


// Shazam (via RapidAPI) lyrics fallback — called when LRCLIB has no
// match. Returns plain-text lines with estimated timestamps (Shazam's
// API gives lyric sections with start offsets) rather than precise
// word-level sync, but it's far better than nothing for recent songs
// LRCLIB hasn't indexed yet.
async function fetchShazamLyrics(shazamId) {
  const workerBase = import.meta.env.VITE_WORKER_URL;
  if (!workerBase || !shazamId) return null;

  try {
    const res = await fetch(
      `${workerBase}/shazam-lyrics?id=${encodeURIComponent(shazamId)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();

    // New Worker shape: { lines: ["line", ...] } — plain text, no timestamps.
    let lines = Array.isArray(data?.lines)
      ? data.lines.map((l) => String(l).trim()).filter(Boolean)
      : [];

    // Old shape (sections with start offsets) — keep working if present.
    const sections = data?.lyrics?.lines || data?.sections || [];
    if (!lines.length && sections.length) {
      const timed = sections
        .map((line) => ({
          t: Math.round((line.startTimeMs ?? line.startMs ?? 0) / 1000),
          l: (line.words ?? line.text ?? "").trim(),
        }))
        .filter((l) => l.l);
      if (timed.length > 1 && timed[timed.length - 1].t > 0) return timed;
      lines = timed.map((l) => l.l);
    }

    if (!lines.length) return null;

    // Shazam gives no timing, so spread the lines evenly across an assumed
    // 3:30 song. It's an estimate — the "Lyric sync" slider fixes drift.
    const START = 8;
    const ASSUMED_LENGTH = 210;
    const step = Math.max(2, (ASSUMED_LENGTH - START - 10) / lines.length);
    return lines.map((l, i) => ({ t: Math.round(START + i * step), l }));
  } catch {
    return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState("search");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Searching…");
  const [pickerResults, setPickerResults] = useState(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [lastPicker, setLastPicker] = useState(null);

  const { theme, toggle: toggleTheme } = useTheme();
  const { recentlyPlayed, add: addRecentlyPlayed } = useRecentlyPlayed();
  const {
    favoriteGenre, setFavoriteGenre,
    autoplayEnabled, setAutoplayEnabled,
  } = useGenrePreference();
  const { favorites, toggle: toggleFav, isFav } = useFavorites();
  const { toast, showToast } = useToast();

  const loadResolvedSong = async ({ title, artist, youtubeVideoId = null, youtubeTitle = "" }) => {
    setLoading(true);

    try {
      setLoadingMsg("Finding the song on YouTube…");

      let youtube = youtubeVideoId
        ? { videoId: youtubeVideoId, title: youtubeTitle || title }
        : await fetchYouTubeVideo(title, artist, true);

      if (!youtube?.videoId) youtube = null;

      setLoadingMsg("Matching lyrics…");

      const result = await getLyricsForSong(title, artist, youtube?.title || "");

      if (!result?.lyrics?.length) {
        showNoLyricsFound(title, artist, youtube?.videoId);
        return;
      }

      await player.loadSong({
        ...result,
        title: result.title || title,
        artist: result.artist || artist || "Unknown",
        genre: "",
        year: "",
        spotify: null,
        youtubeVideoId: youtube?.videoId || null,
        youtubeTitle: youtube?.title || "",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    setPickerResults(null);
    player.loadSong(null);

    let title = query;
    let artist = "";

    // "Song - Artist", "Song -Artist", "Song– Artist" or "Song by Artist"
    const parts = query.split(/\s+[-–—]\s*|\s*[-–—]\s+|\s+by\s+/i).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      [title, artist] = parts;
    }

    setLoading(true);
    setLoadingMsg("Searching…");

    try {
      if (artist) {
        await loadResolvedSong({ title, artist });
        return;
      }

      setLoadingMsg("Searching lyrics database…");

      let results = await searchLRCLib(query);
      if (!results.length) results = await searchLRCLibFuzzy(title, artist);

      if (results.length === 0) {
        await loadResolvedSong({ title, artist });
      } else if (results.length === 1) {
        const pick = results[0];
        await loadResolvedSong({ title: pick.title, artist: pick.artist });
      } else {
        setPickerResults(results);
        setPickerQuery(query);
        setLastPicker({ results, query });
      }
    } catch {
      showToast("Could not reach the music services.");
    } finally {
      setLoading(false);
    }
  };

  const handleArtistSearch = async (artistName) => {
    // "Advertise - Winky d" is a song lookup, not an artist name.
    if (/\s+[-–—]\s*|\s*[-–—]\s+|\s+by\s+/i.test(artistName)) {
      await handleSearch(artistName);
      return;
    }

    setPickerResults(null);
    player.loadSong(null);

    setLoading(true);
    setLoadingMsg(`Finding songs by "${artistName}"…`);

    try {
      const results = await searchLRCLibByArtist(artistName);

      if (!results.length) {
        // LRCLIB empty or rate-limited: fall back to the normal song search,
        // which ends in the Shazam lyrics fallback.
        showToast(`Nothing on LRCLIB for "${artistName}" — trying other sources…`);
        setLoading(false);
        await handleSearch(artistName);
        return;
      }

      setPickerResults(results);
      setPickerQuery(artistName);
      setLastPicker({ results, query: artistName });
    } catch {
      showToast("Could not reach lyrics server.");
    } finally {
      setLoading(false);
    }
  };

  const loadFromPick = async (pick) => {
    setPickerResults(null);
    player.loadSong(null);

    try {
      await loadResolvedSong({ title: pick.title, artist: pick.artist });
    } catch {
      showToast("Could not load that song. Try another.");
    }
  };

  const showNoLyricsFound = (title, artist, youtubeVideoId = null) => {
    showToast("No matching lyrics found for this song.");

    player.loadSong({
      title,
      artist: artist || "Unknown",
      genre: "",
      year: "",
      duration: 0,
      spotify: null,
      youtubeVideoId,
      isPlaceholder: true,
      lyrics: [
        { t: 0, l: "⚠ No lyrics found for this song." },
        { t: 4, l: 'Try "Song Title - Artist Name" format' },
        { t: 8, l: "or switch to \"By artist\" to browse their catalogue." },
      ],
    });
  };

  const handleYoutubeUrlSearch = async (url) => {
    const videoId = extractVideoIdFromUrl(url);

    if (!videoId) {
      showToast("Could not find a video ID in that URL.");
      return;
    }

    setPickerResults(null);
    player.loadSong(null);

    setLoading(true);
    setLoadingMsg("Fetching video info…");

    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      );

      if (!oembedRes.ok) throw new Error("oEmbed failed");

      const oembedData = await oembedRes.json();
      const guessedTitle = oembedData.title || "";
      const guessedArtist = oembedData.author_name || "";

      setLoadingMsg("Matching lyrics…");

      const result = await getLyricsForSong(guessedTitle, guessedArtist, guessedTitle);

      if (result?.lyrics?.length) {
        await player.loadSong({
          ...result,
          genre: "",
          year: "",
          spotify: null,
          youtubeVideoId: videoId,
          youtubeTitle: guessedTitle,
        });
      } else {
        showNoLyricsFound(guessedTitle || "Unknown title", guessedArtist, videoId);
      }
    } catch {
      showToast("Could not fetch information for that video.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!player.song?.lyrics) return;

    const text = player.song.lyrics.map((line) => line.l).join("\n");

    navigator.clipboard
      ?.writeText(text)
      .then(() => showToast("Lyrics copied!"))
      .catch(() => showToast("Copy failed"));
  };

  const handleOpenSpotify = () => {
    if (player.song?.spotify) {
      window.open(player.song.spotify, "_blank");
      return;
    }

    const query = `${player.song?.title || ""} ${player.song?.artist || ""}`.trim();
    const encoded = encodeURIComponent(query);
    const webUrl = `https://open.spotify.com/search/${encoded}/tracks`;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (!isMobile) {
      window.open(webUrl, "_blank");
      return;
    }

    const appUri = `spotify:search:${encoded}`;

    const fallback = setTimeout(() => {
      if (!document.hidden) window.open(webUrl, "_blank");
    }, 1200);

    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(fallback);
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.location.href = appUri;
  };

  const handleBackToResults = () => {
    if (lastPicker) {
      setPickerResults(lastPicker.results);
      setPickerQuery(lastPicker.query);
    }
    player.loadSong(null);
  };

  const handleToggleFav = (songOrTitle) => {
    const title = typeof songOrTitle === "string" ? songOrTitle : songOrTitle.title;
    const wasFav = isFav(title);

    toggleFav(songOrTitle);
    showToast(wasFav ? "Removed from favourites" : "❤ Added to favourites");
  };

  const handleSongIdentified = async ({ title, artist, shazamId }) => {
    // Carry the Shazam ID through so getLyricsForSong can use Shazam's
    // own lyrics as a fallback if LRCLIB doesn't have this song yet.
    const query = artist ? `${title} - ${artist}` : title;

    let titleParsed = title;
    let artistParsed = artist;

    if (query.includes(" - ")) {
      [titleParsed, artistParsed] = query.split(" - ").map((s) => s.trim());
    }

    setPickerResults(null);
    player.loadSong(null);
    setLoading(true);
    setLoadingMsg("Matching lyrics…");

    try {
      let youtube = await fetchYouTubeVideo(titleParsed, artistParsed, true);
      if (!youtube?.videoId) youtube = null;

      const result = await getLyricsForSong(
        titleParsed, artistParsed, youtube?.title || "", shazamId
      );

      if (!result?.lyrics?.length) {
        showNoLyricsFound(titleParsed, artistParsed, youtube?.videoId);
        return;
      }

      await player.loadSong({
        ...result,
        title: result.title || titleParsed,
        artist: result.artist || artistParsed || "Unknown",
        genre: "",
        year: "",
        spotify: null,
        youtubeVideoId: youtube?.videoId || null,
        youtubeTitle: youtube?.title || "",
      });
    } catch {
      showToast("Could not load that song.");
    } finally {
      setLoading(false);
    }
  };


  // Used by the Recently Played / Favourites grids on the Search tab.
  // Songs saved before video IDs were being stored have no
  // youtubeVideoId, and calling player.loadSong directly with those
  // drops straight into iTunes preview mode. This re-resolves the
  // video (and lyrics only if missing) so old entries self-heal
  // instead of staying broken forever.
  const handlePlayFromGrid = async (song) => {
    player.loadSong(null);

    if (song.lyrics?.length > 0 && song.youtubeVideoId) {
      await player.loadSong(song);
      return;
    }

    setLoading(true);
    setLoadingMsg("Finding the song…");

    try {
      await loadResolvedSong({
        title: song.title,
        artist: song.artist,
        youtubeVideoId: song.youtubeVideoId || null,
        youtubeTitle: song.youtubeTitle || "",
      });
    } catch {
      showToast("Could not load that song.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlayFavourite = async (song) => {
    setActiveTab("search");
    player.loadSong(null);

    if (song.lyrics?.length > 0 && song.youtubeVideoId) {
      await player.loadSong(song);
      return;
    }

    setLoading(true);
    setLoadingMsg("Finding the song…");

    try {
      await loadResolvedSong({
        title: song.title,
        artist: song.artist,
        youtubeVideoId: song.youtubeVideoId || null,
        youtubeTitle: song.youtubeTitle || "",
      });
    } catch {
      showToast("Could not load that song.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------
  // Song history (for Previous) + skip / autoplay logic
  // ---------------------------------------------------------------
  const playerRef = useRef(null);
  const historyRef = useRef({ stack: [], index: -1 });
  const navigatingRef = useRef(false);
  const skipBusyRef = useRef(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [, setHistoryTick] = useState(0);

  const handleSongLoad = useCallback(
    (song) => {
      addRecentlyPlayed(song);

      const h = historyRef.current;

      if (navigatingRef.current) {
        navigatingRef.current = false; // came from Prev/Next, history already moved
      } else {
        h.stack = h.stack.slice(0, h.index + 1);
        h.stack.push(song);
        if (h.stack.length > 50) h.stack.shift();
        h.index = h.stack.length - 1;
      }

      setHistoryTick((t) => t + 1);
    },
    [addRecentlyPlayed],
  );

  // Finds a song from the selected genre that has lyrics + a YouTube video and
  // loads it. Returns true on success.
  const playNextFromGenre = useCallback(
    async ({ manual = false } = {}) => {
      if (!favoriteGenre) {
        if (manual) showToast("Pick a genre in the Autoplay panel to skip to new songs.");
        return false;
      }

      showToast(`Finding the next ${favoriteGenre} song…`);

      const excludeTitles = recentlyPlayed
        .slice(0, 20)
        .map((entry) => (entry.title || "").toLowerCase());

      const candidates = await fetchGenreCandidates(favoriteGenre, excludeTitles);

      for (const candidate of candidates.slice(0, 30)) {
        await sleep(400);
        try {
          // Search by the real title + artist (not the genre name) so the
          // YouTube match isn't polluted.
          const youtube = await fetchYouTubeVideo(
            candidate.title,
            candidate.artist,
            true,
          );

          if (!youtube?.videoId) continue;
          if (titleLooksLikeWrongGenre(favoriteGenre, youtube.title || "", candidate.artist)) {
            continue;
          }

          const result = await getLyricsForSong(
            candidate.title,
            candidate.artist,
            youtube.title || "",
            null,
            { interactive: false },
          );

          if (!result?.lyrics?.length) continue;

          const playableSong = {
            ...result,
            title: result.title || candidate.title,
            artist: result.artist || candidate.artist || "Unknown",
            genre: favoriteGenre,
            year: "",
            spotify: null,
            youtubeVideoId: youtube.videoId,
            youtubeTitle: youtube.title || "",
            isPlaceholder: false,
          };

          const loaded = await playerRef.current.loadSong(playableSong);
          if (loaded !== false) {
            showToast(`${favoriteGenre}: ${playableSong.title} — ${playableSong.artist}`);
            return true;
          }
        } catch (err) {
          debug.warn("[autoplay] candidate failed:", candidate.title, err);
        }
      }

      showToast(
        `Couldn't find a ${favoriteGenre} song with both lyrics and a YouTube video.`,
      );
      return false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [favoriteGenre, recentlyPlayed],
  );

  const goNext = useCallback(
    async ({ auto = false } = {}) => {
      if (skipBusyRef.current) return;

      const h = historyRef.current;
      const hasForward = h.index < h.stack.length - 1;

      // Song ended on its own: only continue if autoplay is on (or the user
      // had stepped back and there is a song ahead in history).
      if (auto && !autoplayEnabled && !hasForward) return;

      skipBusyRef.current = true;
      setSkipLoading(true);

      try {
        if (hasForward) {
          const target = h.stack[h.index + 1];
          navigatingRef.current = true;
          const loaded = await playerRef.current.loadSong(target);
          navigatingRef.current = false;
          if (loaded !== false) {
            h.index += 1;
            setHistoryTick((t) => t + 1);
          }
        } else {
          await playNextFromGenre({ manual: !auto });
        }
      } finally {
        skipBusyRef.current = false;
        setSkipLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoplayEnabled, playNextFromGenre],
  );

  const goPrev = useCallback(async () => {
    if (skipBusyRef.current) return;

    const h = historyRef.current;

    // Like Spotify: past the first few seconds, "previous" restarts the song.
    if (playerRef.current.currentSec > 5 || h.index <= 0) {
      playerRef.current.restart();
      playerRef.current.play();
      return;
    }

    skipBusyRef.current = true;
    setSkipLoading(true);

    try {
      const target = h.stack[h.index - 1];
      navigatingRef.current = true;
      const loaded = await playerRef.current.loadSong(target);
      navigatingRef.current = false;
      if (loaded !== false) {
        h.index -= 1;
        setHistoryTick((t) => t + 1);
      }
    } finally {
      skipBusyRef.current = false;
      setSkipLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const player = usePlayer({
    onSongLoad: handleSongLoad,
    onEnded: () => goNext({ auto: true }),
  });
  playerRef.current = player;

  return (
    <>
      <CreditBadge />

      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="main-content">
        <ErrorBoundary message="The player hit a snag. Your other tabs are unaffected.">
          <div
            className={
              activeTab === "search" ? "" : player.song ? "tab-offscreen" : "hidden"
            }
          >
            {activeTab === "search" && (
              <GenrePicker
                favoriteGenre={favoriteGenre}
                onSetGenre={setFavoriteGenre}
                autoplayEnabled={autoplayEnabled}
                onSetAutoplay={setAutoplayEnabled}
              />
            )}
            <SearchTab
              player={player}
              loading={loading}
              loadingMsg={loadingMsg}
              onSearch={handleSearch}
              onArtistSearch={handleArtistSearch}
              pickerResults={pickerResults}
              pickerQuery={pickerQuery}
              onPickSong={loadFromPick}
              onCancelPicker={() => setPickerResults(null)}
              onBackToResults={handleBackToResults}
              isFav={isFav}
              onToggleFav={handleToggleFav}
              onCopy={handleCopy}
              onOpenSpotify={handleOpenSpotify}
              favorites={favorites}
              recentlyPlayed={recentlyPlayed}
              isActiveTab={activeTab === "search"}
              onSongIdentified={handleSongIdentified}
              onYoutubeUrlSearch={handleYoutubeUrlSearch}
              onPlayFromGrid={handlePlayFromGrid}
            />
          </div>
        </ErrorBoundary>

        {activeTab === "about" && (
          <ErrorBoundary message="This page hit a snag.">
            <Suspense
              fallback={
                <div className="loading-state">
                  <div className="spinner" />
                  <p>Loading…</p>
                </div>
              }
            >
              <AboutTab />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === "favourites" && (
          <ErrorBoundary message="This page hit a snag.">
            <FavouritesTab
              favorites={favorites}
              onPlaySong={handlePlayFavourite}
              onRemoveFav={(title) => {
                toggleFav(title);
                showToast("Removed from favourites");
              }}
            />
          </ErrorBoundary>
        )}

        <Footer activeTab={activeTab} onNavigate={setActiveTab} />
      </main>

      <ErrorBoundary message="">
        <SkipControls
          visible={!!player.song && activeTab === "search"}
          onPrev={goPrev}
          onNext={() => goNext()}
          canPrev={historyRef.current.index > 0}
          busy={skipLoading}
        />

        <MiniPlayerBar
          player={player}
          visible={!!player.song && activeTab !== "search"}
          onExpand={() => setActiveTab("search")}
        />
      </ErrorBoundary>

      <Toast message={toast} />

      <Analytics />
    </>
  );
}