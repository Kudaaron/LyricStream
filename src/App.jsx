import { useState, lazy, Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";

import Navbar from "./components/Navbar";
import FavouritesTab from "./components/FavouritesTab";
import SearchTab from "./components/SearchTab";
import Toast from "./components/Toast";
import MiniPlayerBar from "./components/MiniPlayerBar";
import Footer from "./components/Footer";
import CreditBadge from "./components/CreditBadge";
import ErrorBoundary from "./components/ErrorBoundary";

const AboutTab = lazy(() => import("./components/AboutTab"));

import { useTheme } from "./hooks/useTheme";
import { usePlayer } from "./hooks/usePlayer";
import { useFavorites } from "./hooks/useFavorites";
import { useRecentlyPlayed } from "./hooks/useRecentlyPlayed";
import { useToast } from "./hooks/useToast";

import {
  fetchLRCLibLyrics,
  searchLRCLib,
  searchLRCLibByArtist,
  searchLRCLibFuzzy,
  resolvePickedSong,
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

async function getLyricsForSong(title, artist, youtubeTitle = "") {
  const candidates = [
    {
      title: cleanYouTubeTitle(youtubeTitle),
      artist,
    },
    {
      title,
      artist,
    },
  ].filter((x) => x.title);

  for (const candidate of candidates) {
    try {
      const result = await fetchLRCLibLyrics(
        candidate.title,
        candidate.artist,
      );

      if (
        result?.lyrics?.length &&
        titleLooksRelated(result.title, title) &&
        (!artist ||
          result.artist
            ?.toLowerCase()
            .includes(artist.toLowerCase().split(" - ")[0]))
      ) {
        return result;
      }
    } catch { }
  }

  const queries = [
    `${cleanYouTubeTitle(youtubeTitle)} ${artist}`.trim(),
    `${title} ${artist}`.trim(),
    title.trim(),
  ].filter(Boolean);

  for (const query of queries) {
    try {
      const results = await searchLRCLib(query);

      if (!results.length) continue;

      const ranked = results
        .map((result) => {
          const resultTitle = result.title || "";
          const resultArtist = result.artist || "";

          const titleScore = titleLooksRelated(
            resultTitle,
            title,
          )
            ? 1
            : 0;

          const artistScore =
            artist &&
              resultArtist
                .toLowerCase()
                .includes(artist.toLowerCase())
              ? 1
              : 0;

          return {
            result,
            score: titleScore * 100 + artistScore * 50,
          };
        })
        .sort((a, b) => b.score - a.score);

      const best = ranked[0]?.result;

      if (best) {
        const resolved = await resolvePickedSong(best);

        if (resolved?.lyrics?.length) {
          return resolved;
        }
      }
    } catch { }
  }

  return null;
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
  const player = usePlayer({ onSongLoad: addRecentlyPlayed });
  const { favorites, toggle: toggleFav, isFav } = useFavorites();
  const { toast, showToast } = useToast();

  const loadResolvedSong = async ({
    title,
    artist,
    youtubeVideoId = null,
    youtubeTitle = "",
  }) => {
    setLoading(true);

    try {
      setLoadingMsg("Finding the song on YouTube…");

      let youtube = youtubeVideoId
        ? {
          videoId: youtubeVideoId,
          title: youtubeTitle || title,
        }
        : await fetchYouTubeVideo(title, artist, true);

      if (!youtube?.videoId) {
        youtube = null;
      }

      setLoadingMsg("Matching lyrics…");

      const result = await getLyricsForSong(
        title,
        artist,
        youtube?.title || "",
      );

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

    if (query.includes(" - ")) {
      [title, artist] = query.split(" - ").map((s) => s.trim());
    } else if (query.includes(" by ")) {
      [title, artist] = query.split(" by ").map((s) => s.trim());
    }

    setLoading(true);
    setLoadingMsg("Searching…");

    try {
      if (artist) {
        await loadResolvedSong({
          title,
          artist,
        });

        return;
      }

      setLoadingMsg("Searching lyrics database…");

      let results = await searchLRCLib(query);

      if (!results.length) {
        results = await searchLRCLibFuzzy(title, artist);
      }

      if (results.length === 0) {
        showNoLyricsFound(title, artist);
      } else if (results.length === 1) {
        const pick = results[0];

        await loadResolvedSong({
          title: pick.title,
          artist: pick.artist,
        });
      } else {
        setPickerResults(results);
        setPickerQuery(query);
        setLastPicker({
          results,
          query,
        });
      }
    } catch {
      showToast("Could not reach the music services.");
    } finally {
      setLoading(false);
    }
  };

  const handleArtistSearch = async (artistName) => {
    setPickerResults(null);
    player.loadSong(null);

    setLoading(true);
    setLoadingMsg(`Finding songs by "${artistName}"…`);

    try {
      const results = await searchLRCLibByArtist(artistName);

      if (!results.length) {
        showToast(
          `No songs found for "${artistName}" on LRCLIB.`,
        );
      } else {
        setPickerResults(results);
        setPickerQuery(artistName);
        setLastPicker({
          results,
          query: artistName,
        });
      }
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
      await loadResolvedSong({
        title: pick.title,
        artist: pick.artist,
      });
    } catch {
      showToast("Could not load that song. Try another.");
    }
  };

  const showNoLyricsFound = (
    title,
    artist,
    youtubeVideoId = null,
  ) => {
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
        {
          t: 0,
          l: "⚠ No lyrics found for this song.",
        },
        {
          t: 4,
          l: 'Try "Song Title - Artist Name" format',
        },
        {
          t: 8,
          l: "or switch to \"By artist\" to browse their catalogue.",
        },
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
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${videoId}`,
        )}&format=json`,
      );

      if (!oembedRes.ok) {
        throw new Error("oEmbed failed");
      }

      const oembedData = await oembedRes.json();

      const guessedTitle = oembedData.title || "";
      const guessedArtist = oembedData.author_name || "";

      setLoadingMsg("Matching lyrics…");

      const result = await getLyricsForSong(
        guessedTitle,
        guessedArtist,
        guessedTitle,
      );

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
        showNoLyricsFound(
          guessedTitle || "Unknown title",
          guessedArtist,
          videoId,
        );
      }
    } catch {
      showToast(
        "Could not fetch information for that video.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!player.song?.lyrics) return;

    const text = player.song.lyrics
      .map((line) => line.l)
      .join("\n");

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

    const query =
      `${player.song?.title || ""} ${player.song?.artist || ""}`.trim();

    const encoded = encodeURIComponent(query);
    const webUrl =
      `https://open.spotify.com/search/${encoded}/tracks`;

    const isMobile =
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (!isMobile) {
      window.open(webUrl, "_blank");
      return;
    }

    const appUri = `spotify:search:${encoded}`;

    const fallback = setTimeout(() => {
      if (!document.hidden) {
        window.open(webUrl, "_blank");
      }
    }, 1200);

    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(fallback);
        document.removeEventListener(
          "visibilitychange",
          onVisibility,
        );
      }
    };

    document.addEventListener(
      "visibilitychange",
      onVisibility,
    );

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
    const title =
      typeof songOrTitle === "string"
        ? songOrTitle
        : songOrTitle.title;

    const wasFav = isFav(title);

    toggleFav(songOrTitle);

    showToast(
      wasFav
        ? "Removed from favourites"
        : "❤ Added to favourites",
    );
  };

  const handleSongIdentified = async ({ title, artist }) => {
    const query = artist
      ? `${title} - ${artist}`
      : title;

    await handleSearch(query);
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
              activeTab === "search"
                ? ""
                : player.song
                  ? "tab-offscreen"
                  : "hidden"
            }
          >
            <SearchTab
              player={player}
              loading={loading}
              loadingMsg={loadingMsg}
              onSearch={handleSearch}
              onArtistSearch={handleArtistSearch}
              pickerResults={pickerResults}
              pickerQuery={pickerQuery}
              onPickSong={loadFromPick}
              onCancelPicker={() =>
                setPickerResults(null)
              }
              onBackToResults={handleBackToResults}
              isFav={isFav}
              onToggleFav={handleToggleFav}
              onCopy={handleCopy}
              onOpenSpotify={handleOpenSpotify}
              favorites={favorites}
              recentlyPlayed={recentlyPlayed}
              isActiveTab={activeTab === "search"}
              onSongIdentified={handleSongIdentified}
              onYoutubeUrlSearch={
                handleYoutubeUrlSearch
              }
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
                showToast(
                  "Removed from favourites",
                );
              }}
            />
          </ErrorBoundary>
        )}

        <Footer
          activeTab={activeTab}
          onNavigate={setActiveTab}
        />
      </main>

      <ErrorBoundary message="">
        <MiniPlayerBar
          player={player}
          visible={
            !!player.song &&
            activeTab !== "search"
          }
          onExpand={() =>
            setActiveTab("search")
          }
        />
      </ErrorBoundary>

      <Toast message={toast} />

      <Analytics />
    </>
  );
}