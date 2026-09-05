import Icon from '../components/Icons';
import TrackList from '../components/TrackList';

function Favorites({
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
        <p className="eyebrow">Favorites</p>
        <h1>Your repeat listens</h1>
        <p>{tracks.length} favorite tracks loaded from your account.</p>
      </header>

      <section className="library-header">
        <div>
          <h2>Favorite tracks</h2>
          <p>{tracks.length} matching tracks</p>
        </div>
        <label className="search-box">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search favorites"
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
        emptyTitle={query ? 'No matching favorites' : 'No favorites yet'}
        emptyCopy={query ? 'Try another search.' : 'Tap the heart beside a library track to keep it here.'}
      />
    </>
  );
}

export default Favorites;
