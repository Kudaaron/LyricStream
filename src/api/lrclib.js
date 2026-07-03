const BASE = import.meta.env.VITE_LRCLIB_URL;

export async function fetchLRCLibLyrics(title, artist) {
  try {
    const getUrl = `${BASE}/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    const getRes = await fetch(getUrl);

    let track = null;
    if (getRes.ok) {
      const data = await getRes.json();
      if (data?.syncedLyrics || data?.plainLyrics) track = data;
    }

    if (!track) {
      const searchUrl = `${BASE}/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
      const searchRes = await fetch(searchUrl);
      if (searchRes.ok) {
        const results = await searchRes.json();
        track =
          results.find((r) => r.syncedLyrics) ||
          results.find((r) => r.plainLyrics) ||
          results[0] ||
          null;
      }
    }

    if (!track) return null;
    return trackToSong(track, title, artist);
  } catch (err) {
    console.warn("LRCLIB fetch failed:", err.message);
    return null;
  }
}

/**
 * Search LRCLIB by a free-text query (song name, artist name, or both).
 * Returns a deduplicated list of { title, artist, album, duration, hasSynced }
 * for the user to pick from — does NOT fetch full lyrics yet.
 */
export async function searchLRCLib(query) {
  try {
    const url = `${BASE}/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const results = await res.json();
    if (!Array.isArray(results)) return [];

    // Dedupe by title+artist, prefer entries with synced lyrics
    const seen = new Map();
    for (const r of results) {
      if (!r.trackName || !r.artistName) continue;
      const key = `${r.trackName.toLowerCase()}::${r.artistName.toLowerCase()}`;
      const existing = seen.get(key);
      if (!existing || (!existing.hasSynced && r.syncedLyrics)) {
        seen.set(key, {
          title: r.trackName,
          artist: r.artistName,
          album: r.albumName || "",
          duration: r.duration || 0,
          hasSynced: !!r.syncedLyrics,
          _raw: r, // keep raw for direct use, avoids a second fetch
        });
      }
    }
    return [...seen.values()].slice(0, 20);
  } catch (err) {
    console.warn("LRCLIB search failed:", err.message);
    return [];
  }
}

/**
 * Search specifically by artist name — returns all their songs found in LRCLIB.
 */
export async function searchLRCLibByArtist(artistName) {
  const results = await searchLRCLib(artistName);
  // Filter to results where artist name closely matches
  const artistLower = artistName.toLowerCase().trim();
  const filtered = results.filter(
    (r) =>
      r.artist.toLowerCase().includes(artistLower) ||
      artistLower.includes(r.artist.toLowerCase()),
  );
  return filtered.length ? filtered : results;
}

/**
 * Convert a picked search result directly into a playable song,
 * using the cached raw data when available (skips an extra fetch).
 */
export async function resolvePickedSong(pick) {
  if (pick._raw) {
    return trackToSong(pick._raw, pick.title, pick.artist);
  }
  return fetchLRCLibLyrics(pick.title, pick.artist);
}

function trackToSong(track, fallbackTitle, fallbackArtist) {
  let lyrics = [];
  if (track.syncedLyrics) {
    lyrics = parseLRC(track.syncedLyrics);
  } else if (track.plainLyrics) {
    const lines = track.plainLyrics.split("\n").filter((l) => l.trim());
    const dur = track.duration || lines.length * 5;
    lyrics = lines.map((l, i) => ({
      t: Math.round((i / lines.length) * dur),
      l,
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
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match;
  while ((match = regex.exec(lrc)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = parseInt(match[3].padEnd(3, "0"), 10);
    const t = minutes * 60 + seconds + ms / 1000;
    const l = match[4].trim();
    if (l) lines.push({ t, l });
  }
  return lines.sort((a, b) => a.t - b.t);
}

/**
 * Try several query variations when an exact search returns nothing.
 * Helps with regional artists, alt spellings, or extra band names in the query.
 */
export async function searchLRCLibFuzzy(title, artist) {
  const attempts = [
    `${title} ${artist}`,
    title,
    artist,
    // Strip common suffixes like "& The Band", "feat. X"
    artist.replace(/&.*$/, "").trim(),
    artist.replace(/feat\..*/i, "").trim(),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i); // dedupe + drop empty

  for (const q of attempts) {
    const results = await searchLRCLib(q);
    if (results.length > 0) return results;
  }
  return [];
}
