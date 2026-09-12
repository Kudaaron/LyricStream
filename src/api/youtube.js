const WORKER_URL = import.meta.env.VITE_WORKER_URL;

const CACHE_PREFIX = "lyricstream_yt_";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function normalize(value = "") {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(
      /\b(official|audio|video|lyrics|lyric|hd|hq|4k|visualizer|topic)\b/gi,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value = "") {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function similarity(a, b) {
  const aa = tokens(a);
  const bb = tokens(b);

  if (!aa.size || !bb.size) return 0;

  let matches = 0;

  for (const word of aa) {
    if (bb.has(word)) matches++;
  }

  return matches / Math.max(aa.size, bb.size);
}

function scoreResult(result, title, artist) {
  const resultTitle = result.title || "";

  const wantedTitle = normalize(title);
  const wantedArtist = normalize(artist);
  const actualTitle = normalize(resultTitle);

  let score = 0;

  if (wantedTitle && actualTitle === wantedTitle) {
    score += 100;
  } else {
    score += similarity(title, resultTitle) * 70;
  }

  if (wantedArtist) {
    const artistScore = similarity(artist, resultTitle);

    if (artistScore > 0) {
      score += artistScore * 30;
    }

    const titleAndArtist = normalize(`${title} ${artist}`);

    if (actualTitle.includes(titleAndArtist)) {
      score += 40;
    }

    if (
      actualTitle.includes(wantedTitle) &&
      actualTitle.includes(wantedArtist)
    ) {
      score += 50;
    }
  }

  return score;
}

function getCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);

    if (!raw) return null;

    const cached = JSON.parse(raw);

    if (Date.now() - cached.time > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    return cached.data;
  } catch {
    return null;
  }
}

function setCache(key, data) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({
        time: Date.now(),
        data,
      }),
    );
  } catch {}
}

async function searchYouTube(query) {
  if (!WORKER_URL) {
    throw new Error("VITE_WORKER_URL is not configured.");
  }

  const baseUrl = WORKER_URL.endsWith("/search")
    ? WORKER_URL
    : `${WORKER_URL}/search`;

  const cacheKey = query.trim().toLowerCase();

  const cached = getCache(cacheKey);

  if (cached) {
    return cached;
  }

  const url = `${baseUrl}?q=${encodeURIComponent(query)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`YouTube search failed: ${response.status}`);
  }

  const data = await response.json();

  const results = Array.isArray(data?.results)
    ? data.results.filter((r) => r?.videoId)
    : [];

  setCache(cacheKey, results);

  return results;
}

export async function fetchYouTubeVideo(
  title,
  artist = "",
  confirmedExists = false,
) {
  const queries = [
    `${title} ${artist}`.trim(),
    `"${title}" ${artist}`.trim(),
    `${title}`.trim(),
  ].filter(Boolean);

  const allResults = [];
  const seen = new Set();

  for (const query of queries) {
    try {
      const results = await searchYouTube(query);

      for (const result of results) {
        if (!result.videoId || seen.has(result.videoId)) continue;

        seen.add(result.videoId);
        allResults.push(result);
      }
    } catch {
      continue;
    }

    if (allResults.length >= 10) break;
  }

  if (!allResults.length) {
    return null;
  }

  const ranked = allResults
    .map((result) => ({
      ...result,
      score: scoreResult(result, title, artist),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best) return null;

  const minimumScore = confirmedExists ? 20 : 30;

  if (best.score < minimumScore) {
    return null;
  }

  return {
    videoId: best.videoId,
    title: best.title || title,
    score: best.score,
  };
}

export async function fetchYouTubeVideoId(
  title,
  artist = "",
  confirmedExists = false,
) {
  const result = await fetchYouTubeVideo(title, artist, confirmedExists);

  return result?.videoId || null;
}

export function extractVideoIdFromUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }

    if (
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname.includes("youtube-nocookie.com")
    ) {
      const id = parsed.searchParams.get("v");

      if (id) return id;

      const parts = parsed.pathname.split("/").filter(Boolean);

      if (parts[0] === "shorts" && parts[1]) {
        return parts[1];
      }

      if (parts[0] === "embed" && parts[1]) {
        return parts[1];
      }
    }
  } catch {}

  const fallback = String(url).match(
    /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/,
  );

  return fallback?.[1] || null;
}

export function clearYouTubeCache() {
  try {
    const keys = Object.keys(localStorage);

    for (const key of keys) {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}
