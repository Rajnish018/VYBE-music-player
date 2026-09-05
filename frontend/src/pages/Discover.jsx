import Icon from '../components/Icons';
import TrackList from '../components/TrackList';

function Discover({
  query,
  source,
  results,
  isSearching,
  error,
  onQueryChange,
  onSourceChange,
  activeTrack,
  isPlaying,
  favoriteIds,
  onSelectTrack,
  onToggleFavorite,
  token,
}) {
  const isYoutube = source === 'youtube';

  return (
    <>
      <header className="page-heading compact-heading">
        <p className="eyebrow">Discover</p>
        <h1>Search music</h1>
        <p>{isYoutube ? 'Explore YouTube metadata through the backend discovery API.' : 'Search tracks that are already playable in your library.'}</p>
      </header>

      <section className="discover-toolbar">
        <label className="search-box discover-search">
          <Icon name="search" />
          <input
            type="search"
            placeholder={isYoutube ? 'Search YouTube' : 'Search your playable catalog'}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <div className="segmented-control" aria-label="Search source">
          <button className={!isYoutube ? 'active' : ''} type="button" onClick={() => onSourceChange('library')}>Library</button>
          <button className={isYoutube ? 'active' : ''} type="button" onClick={() => onSourceChange('youtube')}>YouTube</button>
        </div>
      </section>

      {error ? (
        <div className="error-state">
          <span>{error}</span>
        </div>
      ) : null}

      <section className={isSearching ? 'library-header searching-header' : 'library-header'}>
        <div>
          <h2>{isSearching ? 'Searching...' : 'Results'}</h2>
          <p>{results.length} results returned by the API</p>
        </div>
      </section>

      {isSearching ? (
        <div className="search-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      <TrackList
        tracks={results}
        queueTracks={results}
        activeTrack={activeTrack}
        isPlaying={isPlaying}
        favoriteIds={favoriteIds}
        onSelectTrack={onSelectTrack}
        onToggleFavorite={onToggleFavorite}
        token={token}
        emptyTitle={query ? 'No results found' : 'Start typing to discover tracks'}
        emptyCopy={query ? 'Try a different title, artist, or source.' : 'Search runs through the backend and updates this page as you type.'}
        showSource
      />
    </>
  );
}

export default Discover;
