
export async function fetchItunesPreview(title, artist) {
  const query = encodeURIComponent(`${title} ${artist}`);
  const url = `https://itunes.apple.com/search?term=${query}&entity=song&limit=5&media=music`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.results?.length) return null;
    const titleLow = title.toLowerCase();
    const match =
      data.results.find((r) => r.trackName?.toLowerCase().includes(titleLow)) ||
      data.results[0];
    return match?.previewUrl || null;
  } catch {
    return null;
  }
}
