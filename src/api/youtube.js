const WORKER_URL = import.meta.env.VITE_WORKER_URL;

// ── Hardcoded verified IDs (instant, no network) ────────────────────────────
const KNOWN_IDS = {
  "shape of you ed sheeran": "JGwWNGJdvx8",
  "perfect ed sheeran": "2Vv-BfVoq4g",
  "thinking out loud ed sheeran": "lp-EO5I60KA",
  "photograph ed sheeran": "nSDgHBa_B7Y",
  "castle on the hill ed sheeran": "jGflUbPQfW8",
  "bad habits ed sheeran": "orJSJGHjBLI",
  "shivers ed sheeran": "Il4cOEBCvpk",
  "blinding lights the weeknd": "XXYlFuWEuKI",
  "save your tears the weeknd": "LIIDh-qI9oI",
  "starboy the weeknd": "dqrVPZZPCHk",
  "call out my name the weeknd": "vV9KRQO-oF4",
  "levitating dua lipa": "TlV5sOwP5e0",
  "dont start now dua lipa": "oygrmJFjeYg",
  "physical dua lipa": "EzjHskLOSmA",
  "future nostalgia dua lipa": "hrBM02ZUGMU",
  "watermelon sugar harry styles": "E07s5ZYygMg",
  "as it was harry styles": "H5v3kku4y6Q",
  "adore you harry styles": "VF-r5TtlT9w",
  "sign of the times harry styles": "qN4ooNx77u0",
  "flowers miley cyrus": "G7KNmW9a75Y",
  "wrecking ball miley cyrus": "My2FRPA3Gf8",
  "anti-hero taylor swift": "b1kbLwvqugk",
  "shake it off taylor swift": "nfWlot6h_JM",
  "blank space taylor swift": "e-ORhEE9VVg",
  "love story taylor swift": "8xg3vE8Ie_E",
  "cruel summer taylor swift": "ic8j13piAhQ",
  "cardigan taylor swift": "K-a8s8OLBSE",
  "drivers license olivia rodrigo": "ZmDBbnmKpqQ",
  "good 4 u olivia rodrigo": "gNi_6U5Pm_o",
  "brutal olivia rodrigo": "gkRaLpFAeZ0",
  "traitor olivia rodrigo": "4Jbkb68r50s",
  "bad guy billie eilish": "DyDfgMOUjCI",
  "happier than ever billie eilish": "5GJWxDKyk3A",
  "lovely billie eilish": "NGSBJMmB4-g",
  "gods plan drake": "xpVfcZ0ZcFM",
  "one dance drake": "qL5v3LNgjAo",
  "hotline bling drake": "uxpDa-c-4Mc",
  "in my feelings drake": "gkOAhfxoabA",
  "sorry justin bieber": "fRh_vgS2dFE",
  "love yourself justin bieber": "oyEuk8j8imI",
  "peaches justin bieber": "tQ0yjYMDFf0",
  "stay the kid laroi": "ambAHGiyaFk",
  "thank u next ariana grande": "gl1aHhXnN1k",
  "7 rings ariana grande": "QYh6mYIJG2Y",
  "positions ariana grande": "tcYodQoapMg",
  "dynamite bts": "gdZLi9oWNZg",
  "butter bts": "WMweEpGlu_U",
  "boy with luv bts": "XsX3ATc3FbA",
  "bohemian rhapsody queen": "fJ9rUzIMcZQ",
  "dont stop me now queen": "HgzGwKwLmgM",
  "somebody to love queen": "kijpcUv-b8M",
  "heat waves glass animals": "mRD0-GxqHVo",
  "montero lil nas x": "6swmTBVI83k",
  "old town road lil nas x": "r7qovpFAGrQ",
  "believer imagine dragons": "7wtfhZwyrcc",
  "thunder imagine dragons": "fKopy74weus",
  "radioactive imagine dragons": "ktvTqknDobU",
  "demons imagine dragons": "mWRsgZuwf_8",
  "sunflower post malone": "ApXoWvfEYVU",
  "circles post malone": "wXhTHyIgQ_U",
  "rockstar post malone": "UceaB4D0jpo",
  "say so doja cat": "pok8J_QdX0Y",
  "kiss me more doja cat": "0EVVKs6NiK0",
  "without you the kid laroi": "BI0-XbU_yxI",
};

const CACHE_KEY = "ls_yt_cache";

function getCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
function setCache(key, videoId) {
  try {
    const c = getCache();
    c[key] = videoId;
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {}
}
function makeKey(title, artist) {
  return `${title} ${artist}`
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/\s+/g, " ");
}

// Fallback mirrors — used only if the Worker URL isn't configured or fails.
// These are unreliable (CORS/SSL/DNS issues vary by instance and over time).
const INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.privacyredirect.com",
  "https://iv.ggtyler.dev",
];

// ── Main export ────────────────────────────────────────────────────────────
export async function fetchYouTubeVideoId(
  title,
  artist,
  confirmedExists = false,
) {
  const key = makeKey(title, artist);

  // 1. Hardcoded verified map
  if (KNOWN_IDS[key]) return KNOWN_IDS[key];
  const titleKey = title.toLowerCase().trim().replace(/['']/g, "");
  const titleMatch = Object.entries(KNOWN_IDS).find(([k]) =>
    k.startsWith(titleKey),
  );
  if (titleMatch) return titleMatch[1];

  // 2. localStorage cache
  const cache = getCache();
  if (cache[key]) return cache[key];

  const queries = [
    `${title} ${artist} official audio`,
    `${title} ${artist} official video`,
    `${artist} ${title}`,
    `${title} ${artist}`,
  ];

  // 3. Cloudflare Worker — primary, reliable, no CORS issues (server-side fetch)
  if (isWorkerConfigured()) {
    for (const q of queries) {
      const id = await searchViaWorker(q, title, artist, true);
      if (id) {
        setCache(key, id);
        return id;
      }
    }
    if (confirmedExists) {
      for (const q of queries) {
        const id = await searchViaWorker(q, title, artist, false);
        if (id) {
          setCache(key, id);
          return id;
        }
      }
    }
  }

  // 4. Invidious fallback (best-effort, may fail due to CORS/cert issues)
  const strictId = await raceInvidious(queries, title, artist, true);
  if (strictId) {
    setCache(key, strictId);
    return strictId;
  }

  if (confirmedExists) {
    const looseId = await raceInvidious(queries, title, artist, false);
    if (looseId) {
      setCache(key, looseId);
      return looseId;
    }
  }

  return null;
}

function isWorkerConfigured() {
  return WORKER_URL && !WORKER_URL.includes("YOUR-WORKER-NAME");
}

// ── Cloudflare Worker search (primary, reliable) ───────────────────────────
async function searchViaWorker(query, songTitle, artist, strict) {
  try {
    const res = await fetch(`${WORKER_URL}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results;
    if (!Array.isArray(results) || !results.length) return null;

    const candidates = results.filter(
      (r) =>
        !/(cover|reaction|remix|karaoke|instrumental|tutorial|live at|concert)/i.test(
          r.title,
        ),
    );
    if (!candidates.length) return null;

    const goodMatch = candidates.find((r) =>
      isGoodMatch(r.title, songTitle, artist),
    );
    if (goodMatch) return goodMatch.videoId;

    if (!strict && candidates[0]) return candidates[0].videoId;
    return null;
  } catch {
    return null;
  }
}

// ── Invidious fallback (best-effort) ────────────────────────────────────────
async function raceInvidious(queries, title, artist, strict) {
  const attempts = [];
  for (const query of queries) {
    for (const instance of INVIDIOUS) {
      attempts.push(searchInvidious(instance, query, title, artist, strict));
    }
  }
  return new Promise((resolve) => {
    let remaining = attempts.length;
    let settled = false;
    if (remaining === 0) {
      resolve(null);
      return;
    }

    attempts.forEach((p) => {
      p.then((result) => {
        remaining--;
        if (!settled && result) {
          settled = true;
          resolve(result);
        } else if (!settled && remaining === 0) {
          settled = true;
          resolve(null);
        }
      }).catch(() => {
        remaining--;
        if (!settled && remaining === 0) {
          settled = true;
          resolve(null);
        }
      });
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 5000);
  });
}

async function searchInvidious(instance, query, songTitle, artist, strict) {
  try {
    const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title&page=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    const candidates = data.filter(
      (r) =>
        !/(cover|reaction|remix|karaoke|instrumental|tutorial|live at|concert)/i.test(
          r.title,
        ),
    );
    if (!candidates.length) return null;

    const goodMatch = candidates.find((r) =>
      isGoodMatch(r.title, songTitle, artist),
    );
    if (goodMatch) return goodMatch.videoId;

    if (!strict && candidates[0]?.videoId) return candidates[0].videoId;
    return null;
  } catch {
    return null;
  }
}

// ── Validate that a result actually matches the intended song ──────────────
function isGoodMatch(videoTitle, songTitle, artist) {
  if (!videoTitle) return false;
  const vt = videoTitle.toLowerCase();
  const st = songTitle.toLowerCase();
  const ar = artist.toLowerCase();

  const titleWords = st.split(" ").filter((w) => w.length > 2);
  const artistWords = ar.split(" ").filter((w) => w.length > 2);

  const titleMatch = titleWords.some((w) => vt.includes(w));
  const artistMatch = artistWords.some((w) => vt.includes(w));

  return titleMatch || artistMatch;
}

// ── Extract video ID from a pasted URL (manual override, still available) ──
export function extractVideoIdFromUrl(input) {
  if (!input) return null;
  input = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /shorts\/([A-Za-z0-9_-]{11})/,
    /embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}
