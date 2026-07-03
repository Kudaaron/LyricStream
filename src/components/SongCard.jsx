export default function SongCard({ song, onClick }) {
  return (
    <div className="result-card" onClick={() => onClick(song)}>
      <div className="result-card-art">
        <i className="ti ti-music" />
      </div>
      <div className="result-card-title">{song.title}</div>
      <div className="result-card-artist">{song.artist}</div>
    </div>
  );
}
