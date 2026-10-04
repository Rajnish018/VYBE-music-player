import Icon from '../components/Icons';
import TrackList from '../components/TrackList';
import  PageHeader  from '../components/PageHeader';

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
      <PageHeader
        eyebrow="Favorites"
        title="Favorite Tracks"
        description="Browse your favorite tracks."
      />
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
