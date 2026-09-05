import Icon from '../components/Icons';
import TrackList from '../components/TrackList';

function Library({
  tracks,
  query,
  onQueryChange,
  activeTrack,
  isPlaying,
  favoriteIds,
  onSelectTrack,
  onToggleFavorite,
  token,
}) {
  return (
    <>
      <header className="page-heading compact-heading">
        <p className="eyebrow">Library</p>
        <h1>All saved music</h1>
        <p>{tracks.length} tracks available from your backend library.</p>
      </header>

      <section className="library-header">
        <div>
          <h2>Tracks</h2>
          <p>{tracks.length} matching tracks</p>
        </div>
        <label className="search-box">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search title, artist, or album"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
      </section>

      <TrackList
        tracks={tracks}
        queueTracks={tracks}
        activeTrack={activeTrack}
        isPlaying={isPlaying}
        favoriteIds={favoriteIds}
        onSelectTrack={onSelectTrack}
        onToggleFavorite={onToggleFavorite}
        token={token}
        emptyTitle={query ? 'No matching tracks' : 'Your library is empty'}
        emptyCopy={query ? 'Try a different title or artist.' : 'Upload an audio file from the admin panel to start listening.'}
      />
    </>
  );
}

export default Library;
