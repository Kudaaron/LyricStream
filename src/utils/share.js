const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const clean = (value) =>
  (value || "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 120);

// https://your-site/?song=Title&artist=Artist&v=<youtubeVideoId>
export function buildShareUrl(song) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("song", song.title);
  if (song.artist) url.searchParams.set("artist", song.artist);
  if (VIDEO_ID.test(song.youtubeVideoId || "")) {
    url.searchParams.set("v", song.youtubeVideoId);
  }
  return url.toString();
}

// Reads a shared link. Everything is length-limited and the video id is
// validated, because it comes straight from the address bar.
export function readShareParams() {
  const params = new URLSearchParams(window.location.search);
  const title = clean(params.get("song"));
  if (!title) return null;

  const videoId = params.get("v") || "";

  return {
    title,
    artist: clean(params.get("artist")),
    youtubeVideoId: VIDEO_ID.test(videoId) ? videoId : null,
  };
}

// Returns "shared" | "copied" | "cancelled" | "failed"
export async function shareSong(song) {
  const url = buildShareUrl(song);

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${song.title} — ${song.artist || "LyricStream"}`,
        text: `Synced lyrics for ${song.title} on LyricStream`,
        url,
      });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      // fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
