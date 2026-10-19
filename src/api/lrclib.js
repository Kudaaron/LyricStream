const BASE = import.meta.env.VITE_LRCLIB_URL;

function normalize(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|featuring)\.?\b.*$/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value = "") {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);

  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const aw = words(a);
  const bw = words(b);

  if (!aw.size || !bw.size) return 0;

  let common = 0;
  for (const word of aw) {
    if (bw.has(word)) common++;
  }

  return common / Math.max(aw.size, bw.size);
}

function artistMatches(requested, returned) {
  const a = normalize(requested);
  const b = normalize(returned);

  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  return similarity(a, b) >= 0.6;
}

function scoreTrack(track, requestedTitle, requestedArtist) {
  const titleScore = similarity(requestedTitle, track.trackName);
  const artistScore = similarity(requestedArtist, track.artistName);

  let score = titleScore * 70;

  if (requestedArtist) {
    score += artistScore * 30;
  }

  if (normalize(requestedTitle) === normalize(track.trackName)) {
    score += 20;
  }

  if (
    requestedArtist &&
    normalize(requestedArtist) === normalize(track.artistName)
  ) {
    score += 15;
  }

  return {
    score,
    titleScore,
    artistScore,
  };
}

function isAcceptableTrack(track, requestedTitle, requestedArtist) {
  if (!track?.trackName || !track?.artistName) return false;
  if (!track.syncedLyrics && !track.plainLyrics) return false;

  const { score, titleScore, artistScore } = scoreTrack(
    track,
    requestedTitle,
    requestedArtist,
  );

  if (titleScore < 0.55) return false;

  if (requestedArtist && artistScore < 0.45) return false;

  return score >= 55;
}

function rankTracks(results, requestedTitle, requestedArtist) {
  return results
    .filter((track) => track?.trackName && track?.artistName)
    .map((track) => ({
      track,
      ...scoreTrack(track, requestedTitle, requestedArtist),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      if (!!b.track.syncedLyrics !== !!a.track.syncedLyrics) {
        return b.track.syncedLyrics ? 1 : -1;
      }

      return 0;
    })
    .map((item) => item.track);
}

// ------------------------------------------------------------------
// LRCLIB health breaker.
// The moment LRCLIB answers 429 / 5xx (or the browser blocks the response,
// which is how a CORS-less 429 shows up), we mark it "down" for a while.
// While it is down every call returns null / [] INSTANTLY with no network
// request, so the app can hand over to Shazam without waiting or retrying.
// ------------------------------------------------------------------
const REQUEST_TIMEOUT_MS = 4000;
let downUntil = 0;
let failures = 0;

export function isLRCLibDown() {
  return Date.now() < downUntil;
}

// Lets the caller force one more LRCLIB attempt (e.g. when Shazam found nothing).
export function resetLRCLibHealth() {
  downUntil = 0;
  failures = 0;
}

// A single 503 / timeout is usually one bad query, not an outage, so only
// trip the breaker after 2 failures in a row. 429 is global, so trip at once.
function recordFailure(ms) {
  failures += 1;
  if (failures >= 2) {
    downUntil = Date.now() + ms;
    failures = 0;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One HTTP attempt, classified so the caller knows what to do next.
async function requestOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (res.status === 429) {
      return {
        kind: "rate_limited",
        retryAfter: Number(res.headers.get("Retry-After")),
      };
    }

    if (res.status >= 500) return { kind: "retry" };

    if (!res.ok) return { kind: "notfound" }; // 400 / 404: genuinely no match

    try {
      return { kind: "ok", data: await res.json() };
    } catch {
      return { kind: "notfound" };
    }
  } catch {
    // timeout, network error, or a 429 the browser blocked (no CORS headers)
    return { kind: "retry" };
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(url) {
  if (isLRCLibDown()) return null;

  let result = await requestOnce(url);

  // A single 503 / timeout is usually momentary: retry that request once.
  if (result.kind === "retry") {
    await sleep(350);
    result = await requestOnce(url);
  }

  if (result.kind === "ok") {
    failures = 0;
    return result.data;
  }

  if (result.kind === "notfound") {
    failures = 0; // the server answered normally
    return null;
  }

  if (result.kind === "rate_limited") {
    const wait =
      result.retryAfter > 0 ? Math.min(result.retryAfter, 10) * 1000 : 8000;
    downUntil = Date.now() + wait;
    failures = 0;
    return null;
  }

  recordFailure(15000); // failed twice in a row: counts toward tripping the breaker
  return null;
}

export async function fetchLRCLibLyrics(title, artist) {
  if (!title) return null;

  try {
    // LRCLIB's /get needs an artist; without one it just answers 400.
    if (artist) {
      const getUrl =
        `${BASE}/get?artist_name=${encodeURIComponent(artist)}` +
        `&track_name=${encodeURIComponent(title)}`;

      const getData = await requestJson(getUrl);

      if (getData && isAcceptableTrack(getData, title, artist)) {
        return trackToSong(getData, title, artist);
      }
    }

    const searchUrl =
      `${BASE}/search?track_name=${encodeURIComponent(title)}` +
      (artist ? `&artist_name=${encodeURIComponent(artist)}` : "");

    const searchData = await requestJson(searchUrl);

    if (!Array.isArray(searchData) || searchData.length === 0) {
      return null;
    }

    const ranked = rankTracks(searchData, title, artist);

    const best = ranked.find((track) =>
      isAcceptableTrack(track, title, artist),
    );

    return best ? trackToSong(best, title, artist) : null;
  } catch (err) {
    debug.warn("LRCLIB fetch failed:", err.message);
    return null;
  }
}

export async function searchLRCLib(query) {
  if (!query?.trim()) return [];

  try {
    const url = `${BASE}/search?q=${encodeURIComponent(query)}`;
    const results = await requestJson(url);

    if (!Array.isArray(results)) return [];

    const seen = new Map();

    for (const r of results) {
      if (!r?.trackName || !r?.artistName) continue;

      const key = `${normalize(r.trackName)}::${normalize(r.artistName)}`;

      const existing = seen.get(key);

      if (!existing || (!existing.hasSynced && r.syncedLyrics)) {
        seen.set(key, {
          title: r.trackName,
          artist: r.artistName,
          album: r.albumName || "",
          duration: r.duration || 0,
          hasSynced: !!r.syncedLyrics,
          _raw: r,
        });
      }
    }

    return [...seen.values()].slice(0, 20);
  } catch (err) {
    debug.warn("LRCLIB search failed:", err.message);
    return [];
  }
}

export async function searchLRCLibByArtist(artistName) {
  const results = await searchLRCLib(artistName);

  const artist = normalize(artistName);

  const filtered = results.filter((r) => artistMatches(artist, r.artist));

  return filtered.length ? filtered : results;
}

export async function resolvePickedSong(pick) {
  if (!pick) return null;

  if (pick._raw) {
    const track = pick._raw;

    if (!isAcceptableTrack(track, pick.title, pick.artist)) {
      return null;
    }

    return trackToSong(track, pick.title, pick.artist);
  }

  return fetchLRCLibLyrics(pick.title, pick.artist);
}

export async function searchLRCLibFuzzy(title, artist) {
  const attempts = [
    artist ? `${title} ${artist}` : title,
    title,
    artist,
    artist?.replace(/&.*$/, "").trim(),
    artist?.replace(/feat\..*/i, "").trim(),
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  const collected = [];

  // Run the (max 3) variants in parallel instead of one after another.
  const batches = await Promise.all(
    attempts.slice(0, 3).map((query) => searchLRCLib(query)),
  );

  for (const results of batches) {
    if (results.length) collected.push(...results);
  }

  if (!collected.length) return [];

  const unique = new Map();

  for (const result of collected) {
    const key = `${normalize(result.title)}::${normalize(result.artist)}`;

    if (!unique.has(key)) {
      unique.set(key, result);
    }
  }

  const ranked = [...unique.values()].sort((a, b) => {
    const aScore = scoreTrack(
      { trackName: a.title, artistName: a.artist },
      title,
      artist,
    ).score;

    const bScore = scoreTrack(
      { trackName: b.title, artistName: b.artist },
      title,
      artist,
    ).score;

    return bScore - aScore;
  });

  return ranked.slice(0, 20);
}

function trackToSong(track, fallbackTitle, fallbackArtist) {
  let lyrics = [];

  if (track.syncedLyrics) {
    lyrics = parseLRC(track.syncedLyrics);
  } else if (track.plainLyrics) {
    const lines = track.plainLyrics
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const duration =
      track.duration > 0 ? track.duration : Math.max(lines.length * 5, 1);

    lyrics = lines.map((line, index) => ({
      t: Math.round((index / Math.max(lines.length - 1, 1)) * duration),
      l: line,
    }));
  }

  return {
    title: track.trackName || fallbackTitle,
    artist: track.artistName || fallbackArtist,
    album: track.albumName || "",
    duration: track.duration || 0,
    lyrics,
  };
}

function parseLRC(lrc) {
  const lines = [];
  const regex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\](.*)/g;

  let match;

  while ((match = regex.exec(lrc)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const fraction = match[3] || "0";

    let milliseconds;

    if (fraction.length === 1) {
      milliseconds = parseInt(fraction, 10) * 100;
    } else if (fraction.length === 2) {
      milliseconds = parseInt(fraction, 10) * 10;
    } else {
      milliseconds = parseInt(fraction, 10);
    }

    const t = minutes * 60 + seconds + milliseconds / 1000;

    const l = match[4].trim();

    if (l) {
      lines.push({ t, l });
    }
  }

  return lines.sort((a, b) => a.t - b.t);
}
