# LyricStream (React + Vite)

A lyrics finder built with React 18 and Vite. Search songs, view synced lyrics that scroll as the track plays, save favourites, and toggle dark mode.

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| UI          | React 18                          |
| Build tool  | Vite 5                            |
| Styling     | CSS3 custom properties (no framework) |
| Icons       | Tabler Icons (CDN)                |
| AI lyrics   | Anthropic Claude API              |
| Persistence | localStorage (theme + favourites) |

## Project Structure

```
lyricstream-react/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx              ← entry point
    ├── App.jsx               ← root — wires all hooks + tabs
    ├── api/
    │   └── anthropic.js      ← Claude API for AI lyrics
    ├── data/
    │   └── songs.js          ← built-in song library
    ├── hooks/
    │   ├── usePlayer.js      ← playback state + timer
    │   ├── useTheme.js       ← dark/light toggle
    │   ├── useFavorites.js   ← localStorage favourites
    │   └── useToast.js       ← ephemeral notifications
    ├── components/
    │   ├── Navbar.jsx
    │   ├── SearchBar.jsx     ← input + suggestions dropdown
    │   ├── SearchTab.jsx     ← search page layout
    │   ├── LyricsPanel.jsx   ← song header + synced lyrics
    │   ├── PlayerCard.jsx    ← controls, progress, speed
    │   ├── SongCard.jsx      ← favourites grid card
    │   ├── AboutTab.jsx
    │   └── Toast.jsx
    └── styles/
        └── main.css          ← all styles (light + dark)
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open http://localhost:5173
```

## Enable AI Lyrics (optional)

For songs not in the built-in library, LyricStream calls the Anthropic Claude API.

1. Get a free key at https://console.anthropic.com
2. Open `src/api/anthropic.js`
3. Replace the placeholder:

```js
const ANTHROPIC_API_KEY = 'sk-ant-your-key-here';
```

Without a key the 6 built-in songs all work normally.

## Built-in Songs

- Blinding Lights — The Weeknd
- Shape of You — Ed Sheeran
- Bohemian Rhapsody — Queen
- Stay — The Kid LAROI & Justin Bieber
- Levitating — Dua Lipa
- Watermelon Sugar — Harry Styles

## Adding More Songs

Open `src/data/songs.js` and add to `SONG_LIBRARY`:

```js
"your song key": {
  title: "Song Title",
  artist: "Artist Name",
  genre: "Genre",
  year: "2024",
  spotify: "https://open.spotify.com/track/TRACK_ID",
  duration: 210,
  lyrics: [
    { t: 0,  l: "First lyric line" },
    { t: 5,  l: "Second lyric line" },
  ],
},
```

Also add an alias in `SEARCH_ALIASES` so it surfaces in the suggestions dropdown.

## Build for Production

```bash
npm run build
# Output in dist/
```
