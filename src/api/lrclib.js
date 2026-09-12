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

async function requestJson(url) {
  const res = await fetch(url);

  if (!res.ok) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchLRCLibLyrics(title, artist) {
  if (!title) return null;

  try {
    const getUrl =
      `${BASE}/get?artist_name=${encodeURIComponent(artist || "")}` +
      `&track_name=${encodeURIComponent(title)}`;

    const getData = await requestJson(getUrl);

    if (getData && isAcceptableTrack(getData, title, artist)) {
      return trackToSong(getData, title, artist);
    }

    const searchUrl =
      `${BASE}/search?track_name=${encodeURIComponent(title)}` +
      `&artist_name=${encodeURIComponent(artist || "")}`;

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
    console.warn("LRCLIB fetch failed:", err.message);
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
    console.warn("LRCLIB search failed:", err.message);
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

  for (const query of attempts) {
    const results = await searchLRCLib(query);

    if (results.length) {
      collected.push(...results);
    }
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
