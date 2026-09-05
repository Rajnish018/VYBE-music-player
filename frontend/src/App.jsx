import { useCallback, useMemo } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import './index.css';

import Sidebar from './components/Sidebar';
import Player from './components/Player';

import Home from './pages/Home';
import LoginPage from './pages/Auth/LoginPage';
import SignupPage from './pages/Auth/SignupPage';
import AdminPage from './pages/Admin/AdminPage';
import Discover from './pages/Discover';
import Favorites from './pages/Favorites';
import Library from './pages/Library';
import Albums from './pages/Albums/Albums';
import SettingsPage from './pages/Settings/SettingsPage';
import ManageSongs from './pages/Admin/ManageSongs';

import { toggleFavorite as toggleFavoriteHandler } from './handlers/favoriteHandlers';

import { useAdmin } from './hooks/useAdmin';
import { useAuth } from './hooks/useAuth';
import { useDiscover } from './hooks/useDiscover';
import { useFavorites } from './hooks/useFavorites';
import { useLibrary } from './hooks/useLibrary';
import { useSettings } from './hooks/useSettings';

import {
  PlayerProvider,
  usePlayer,
} from './context/PlayerContext';

import AdminRoute from './routes/AdminRoute';
import PrivateRoute from './routes/PrivateRoute';
import PublicRoute from './routes/PublicRoute';

import { routeToView } from './utils/route';
import AlbumDetail from './pages/Albums/AlbumDetail';


function AppRoutes() {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const view = routeToView(location.pathname);

  /*
   * Settings owns volume persistence and theme.
   */
  const {
    volume,
    setVolume,
    theme,
    setTheme,
  } = useSettings();

  const navigate = useCallback(
    (nextRoute, options = {}) => {
      routerNavigate(nextRoute, {
        replace: options.replace,
      });
    },
    [routerNavigate],
  );

  /*
   * Authentication
   */
  const {
    token,
    user,
    loading,
    authForm,
    authError,
    authLoading,
    setAuthForm,
    clearSession,
    logout,
    submitLogin,
    submitSignup,
  } = useAuth({ navigate });

  const authReady = !loading && Boolean(token && user);

  /*
   * Library
   *
   * tracks + activeIndex remain owned by useLibrary.
   * PlayerProvider uses them as the current playback queue.
   */
  const {
    tracks,
    setTracks,
    libraryTracks,
    activeIndex,
    setActiveIndex,
    isLoadingLibrary,
    query,
    setQuery,
    apiState,
    dataError,
    featuredTracks,
    recentlyAddedTracks,
    filteredLibraryTracks,
    refreshLibrary,
  } = useLibrary({
    token,
    authReady,
    clearSession,
  });

  /*
   * Favorites
   */
  const {
    favoriteTracks,
    setFavoriteTracks,
    favoriteIds,
    normalizedFavoriteTracks,
  } = useFavorites({
    token,
    authReady,
    clearSession,
  });

  /*
   * Discover
   */
  const {
    discoverQuery,
    discoverSource,
    discoverResults,
    discoverLoading,
    discoverError,
    setDiscoverQuery,
    setDiscoverSource,
    clearDiscoverError,
  } = useDiscover({
    token,
    authReady,
    view,
    clearSession,
  });

  /*
   * Player
   *
   * PlayerProvider is mounted below and owns the single
   * persistent audio element.
   */
  return (
    <PlayerProvider
      tracks={tracks}
      setTracks={setTracks}
      activeIndex={activeIndex}
      setActiveIndex={setActiveIndex}
      token={token}
      volume={volume}
      setVolume={setVolume}
    >
      <AuthenticatedApp
        location={location}
        view={view}
        navigate={navigate}
        token={token}
        user={user}
        loading={loading}
        authForm={authForm}
        authError={authError}
        authLoading={authLoading}
        setAuthForm={setAuthForm}
        submitLogin={submitLogin}
        submitSignup={submitSignup}
        clearSession={clearSession}
        logout={logout}
        isLoadingLibrary={isLoadingLibrary}
        query={query}
        setQuery={setQuery}
        apiState={apiState}
        dataError={dataError}
        featuredTracks={featuredTracks}
        recentlyAddedTracks={recentlyAddedTracks}
        filteredLibraryTracks={filteredLibraryTracks}
        favoriteTracks={favoriteTracks}
        favoriteIds={favoriteIds}
        normalizedFavoriteTracks={normalizedFavoriteTracks}
        setFavoriteTracks={setFavoriteTracks}
        discoverQuery={discoverQuery}
        discoverSource={discoverSource}
        discoverResults={discoverResults}
        discoverLoading={discoverLoading}
        discoverError={discoverError}
        setDiscoverQuery={setDiscoverQuery}
        setDiscoverSource={setDiscoverSource}
        clearDiscoverError={clearDiscoverError}
        libraryTracks={libraryTracks}
        setTracks={setTracks}
        refreshLibrary={refreshLibrary}
        theme={theme}
        setTheme={setTheme}
        volume={volume}
        setVolume={setVolume}
      />
    </PlayerProvider>
  );
}


/*
 * This component is inside PlayerProvider,
 * so it can safely use usePlayer().
 */
function AuthenticatedApp({
  location,
  view,
  navigate,
  token,
  user,
  loading,
  authForm,
  authError,
  authLoading,
  setAuthForm,
  submitLogin,
  submitSignup,
  logout,
  isLoadingLibrary,
  query,
  setQuery,
  apiState,
  dataError,
  featuredTracks,
  recentlyAddedTracks,
  filteredLibraryTracks,
  favoriteTracks,
  favoriteIds,
  normalizedFavoriteTracks,
  setFavoriteTracks,
  discoverQuery,
  discoverSource,
  discoverResults,
  discoverLoading,
  discoverError,
  setDiscoverQuery,
  setDiscoverSource,
  clearDiscoverError,
  libraryTracks,
  setTracks,
  refreshLibrary,
  theme,
  setTheme,
  volume,
  setVolume,
}) {
  const {
    activeTrack,
    activeIndex,
    isPlaying,
    isLoadingAudio,
    playbackError,
    progressMax,
    progressValue,
    setPlaybackError,
    setIsPlaying,
    selectTrack,
    playTrackAt,
    togglePlayback,
    seekTo,
    nextTrack,
    previousTrack,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    queue,
    updateQueue,
  } = usePlayer();

  const handleLogout = useCallback(() => {
    /*
     * Stop the player before logging out.
     */
    setIsPlaying(false);
    logout();
  }, [setIsPlaying, logout]);

  const admin = useAdmin({
    token,
    refreshLibrary,
    logout: handleLogout,
  });

  const filteredFavoriteTracks = useMemo(
    () =>
      normalizedFavoriteTracks.filter((track) => {
        const cleanQuery = query.trim().toLowerCase();

        if (!cleanQuery) {
          return true;
        }

        return `${track.title} ${track.artist} ${track.album}`
          .toLowerCase()
          .includes(cleanQuery);
      }),
    [normalizedFavoriteTracks, query],
  );

  function changeView(nextView) {
    setQuery('');

    if (nextView !== 'discover') {
      clearDiscoverError();
    }

    navigate(
      nextView === 'home'
        ? '/dashboard'
        : `/${nextView}`,
    );
  }

  function switchToSignup() {
    navigate('/register');
  }

  function switchToLogin() {
    navigate('/login');
  }

  function toggleFavorite(trackId) {
    return toggleFavoriteHandler({
      trackId,
      token,
      favoriteIds,
      setFavoriteTracks,
      setPlaybackError,
      logout: handleLogout,
    });
  }

  function renderShell(content) {
    return (
      <div className="app-shell">
        {/*
         * IMPORTANT:
         * Never mount <audio> inside this route shell.
         * PlayerProvider owns the single persistent audio
         * element so route changes do not recreate playback.
         */}

        <Sidebar
          view={
            location.pathname === '/admin'
              ? 'admin'
              : view
          }
          user={user}
          onNavigate={changeView}
          onLogout={handleLogout}
        />

        <main className="content">
          {content}
        </main>

        <Player
          activeTrack={activeTrack}
          activeIndex={activeIndex}
          isPlaying={isPlaying}
          isLoading={isLoadingAudio}
          playbackError={playbackError}
          progressMax={progressMax}
          progressValue={progressValue}
          volume={volume}
          onPlayTrackAt={playTrackAt}
          onTogglePlayback={togglePlayback}
          onSeek={seekTo}
          onVolumeChange={setVolume}
          onNextTrack={nextTrack}
          onPreviousTrack={previousTrack}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeat}
          shuffle={shuffle}
          repeat={repeat}
          token={token}
        />
      </div>
    );
  }

  return (
    <Routes>
      {/* =========================
          PUBLIC ROUTES
      ========================== */}

      <Route
        element={
          <PublicRoute
            user={user}
            loading={loading}
          />
        }
      >
        <Route
          path="/login"
          element={
            <LoginPage
              form={authForm}
              loading={authLoading}
              error={authError}
              onChange={setAuthForm}
              onSubmit={submitLogin}
              onSwitch={switchToSignup}
            />
          }
        />

        <Route
          path="/register"
          element={
            <SignupPage
              form={authForm}
              loading={authLoading}
              error={authError}
              onChange={setAuthForm}
              onSubmit={submitSignup}
              onSwitch={switchToLogin}
            />
          }
        />
      </Route>

      {/* =========================
          PRIVATE ROUTES
      ========================== */}

      <Route
        element={
          <PrivateRoute
            user={user}
            loading={loading}
          />
        }
      >
        {/* DASHBOARD */}

        <Route
          path="/dashboard"
          element={renderShell(
            <Home
              apiState={apiState}
              dataError={dataError}
              onRetry={() => window.location.reload()}
              activeTrack={activeTrack}
              isPlaying={isPlaying}
              isLoading={
                isLoadingLibrary || isLoadingAudio
              }
              onTogglePlayback={togglePlayback}
              featuredTracks={featuredTracks}
              recentlyAddedTracks={recentlyAddedTracks}
              favoriteCount={favoriteTracks.length}
              favoriteIds={favoriteIds}
              onSelectTrack={selectTrack}
              onToggleFavorite={toggleFavorite}
              token={token}
            />,
          )}
        />

        {/* DISCOVER */}

        <Route
          path="/discover"
          element={renderShell(
            <Discover
              query={discoverQuery}
              source={discoverSource}
              results={discoverResults}
              isSearching={discoverLoading}
              error={discoverError}
              onQueryChange={setDiscoverQuery}
              onSourceChange={setDiscoverSource}
              activeTrack={activeTrack}
              isPlaying={isPlaying}
              favoriteIds={favoriteIds}
              onSelectTrack={selectTrack}
              onToggleFavorite={toggleFavorite}
              token={token}
            />,
          )}
        />

        {/* LIBRARY */}

        <Route
          path="/library"
          element={renderShell(
            <Library
              tracks={filteredLibraryTracks}
              query={query}
              onQueryChange={setQuery}
              activeTrack={activeTrack}
              isPlaying={isPlaying}
              favoriteIds={favoriteIds}
              onSelectTrack={selectTrack}
              onToggleFavorite={toggleFavorite}
              token={token}
            />,
          )}
        />
        <Route
          path="/albums"
          element={renderShell(
            <Albums
              tracks={libraryTracks}
              token={token}
              activeTrack={activeTrack}
              isPlaying={isPlaying}
            />,
          )}
        />

        <Route
          path="/albums/:albumKey"
          element={renderShell(
            <AlbumDetail
              tracks={libraryTracks}
              token={token}
              activeTrack={activeTrack}
              isPlaying={isPlaying}
              onPlay={(track, albumTracks) => {
                selectTrack(
                  track.id,
                  albumTracks,
                  true,
                );
              }}
              onTogglePlayback={togglePlayback}
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
            />,
          )}
        />

        {/* SETTINGS */}

        <Route
          path="/settings"
          element={renderShell(
            <SettingsPage
              user={user}
              volume={volume}
              onVolumeChange={setVolume}
              theme={theme}
              onThemeChange={setTheme}
              onLogout={handleLogout}
            />,
          )}
        />

        {/* FAVORITES */}

        <Route
          path="/favorites"
          element={renderShell(
            <Favorites
              tracks={filteredFavoriteTracks}
              query={query}
              onQueryChange={setQuery}
              activeTrack={activeTrack}
              isPlaying={isPlaying}
              favoriteIds={favoriteIds}
              onSelectTrack={selectTrack}
              onToggleFavorite={toggleFavorite}
              token={token}
            />,
          )}
        />
      </Route>

      {/* =========================
          ADMIN ROUTE
      ========================== */}

      <Route
        element={
          <AdminRoute
            user={user}
            loading={loading}
          />
        }
      >
        <Route
          path="/admin"
          element={renderShell(
            <AdminPage
              admin={admin}
              tracks={libraryTracks}
            />,
          )}
        />
        <Route
          path="/manage-songs"
          element={renderShell(
            <ManageSongs
              tracks={libraryTracks}
              token={token}
              onTracksChange={setTracks}
              onRefresh={refreshLibrary}
            />,
          )}
        />
      </Route>

      {/* =========================
          FALLBACK ROUTES
      ========================== */}

      <Route
        path="/"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />
    </Routes>
  );
}


function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;