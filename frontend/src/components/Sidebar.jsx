import { useEffect, useState } from 'react';
import {
  useLocation,
  useNavigate,
} from 'react-router-dom';

import Icon from './Icons';
import './Sidebar.css';

const navItems = [
  {
    view: 'home',
    label: 'Home',
    icon: 'home',
  },
  {
    view: 'discover',
    label: 'Discover',
    icon: 'search',
  },
  {
    view: 'library',
    label: 'Library',
    icon: 'library',
  },
  {
    view: 'favorites',
    label: 'Favorites',
    icon: 'heart',
  },
  {
    view: 'albums',
    label: 'Albums',
    icon: 'album',
  },
  {
    view: 'artists',
    label: 'Artists',
    icon: 'user',
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: 'settings',
  },
];

function Sidebar({
  view,
  user,
  onNavigate,
  onLogout,
}) {
  const [mobileOpen, setMobileOpen] =
    useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  /*
  |--------------------------------------------------------------------------
  | CURRENT PATH
  |--------------------------------------------------------------------------
  */

  const pathname =
    location.pathname;

  /*
  |--------------------------------------------------------------------------
  | ROUTE DETECTION
  |--------------------------------------------------------------------------
  */

  const isHomeRoute =
    pathname === '/' ||
    pathname === '/dashboard' ||
    pathname === '/home';

  const isAlbumRoute =
    pathname === '/albums' ||
    pathname.startsWith('/albums/');

  const isArtistRoute =
    pathname === '/artists' ||
    pathname.startsWith('/artists/');

  const isDiscoverRoute =
    pathname === '/discover' ||
    pathname.startsWith('/discover/');

  const isLibraryRoute =
    pathname === '/library' ||
    pathname.startsWith('/library/');

  const isFavoritesRoute =
    pathname === '/favorites' ||
    pathname.startsWith('/favorites/');

  const isSettingsRoute =
    pathname === '/settings' ||
    pathname.startsWith('/settings/');

  /*
  |--------------------------------------------------------------------------
  | ADMIN ROUTES
  |--------------------------------------------------------------------------
  */

  const isAdminRoute =
    pathname === '/admin';

  const isManageSongsRoute =
    pathname === '/admin/songs' ||
    pathname === '/manage-songs';

  const isManageArtistsRoute =
    pathname === '/admin/artists';

  /*
  |--------------------------------------------------------------------------
  | ACTIVE NAV CLASS
  |--------------------------------------------------------------------------
  */

  function getNavClass(
    itemView,
  ) {
    if (itemView === 'home') {
      return isHomeRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    if (itemView === 'artists') {
      return isArtistRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    if (itemView === 'albums') {
      return isAlbumRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    if (itemView === 'discover') {
      return isDiscoverRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    if (itemView === 'library') {
      return isLibraryRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    if (itemView === 'favorites') {
      return isFavoritesRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    if (itemView === 'settings') {
      return isSettingsRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    /*
     * Admin Dashboard
     */
    if (itemView === 'admin') {
      return isAdminRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    /*
     * Manage Songs
     */
    if (
      itemView ===
      'manage-songs'
    ) {
      return isManageSongsRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    /*
     * Manage Artists
     */
    if (
      itemView ===
      'manage-artists'
    ) {
      return isManageArtistsRoute
        ? 'nav-item active'
        : 'nav-item';
    }

    return view === itemView
      ? 'nav-item active'
      : 'nav-item';
  }

  /*
  |--------------------------------------------------------------------------
  | NAVIGATION
  |--------------------------------------------------------------------------
  */

  function navigateTo(
    nextView,
  ) {
    setMobileOpen(false);

    /*
     * Real React Router routes
     */
    if (nextView === 'admin') {
      navigate('/admin');
      return;
    }

    if (
      nextView ===
      'manage-artists'
    ) {
      navigate(
        '/admin/artists',
      );
      return;
    }

    /*
     * Existing application-view
     * navigation.
     */
    onNavigate(nextView);
  }

  /*
  |--------------------------------------------------------------------------
  | LOGOUT
  |--------------------------------------------------------------------------
  */

  function handleLogout() {
    setMobileOpen(false);
    onLogout();
  }

  /*
  |--------------------------------------------------------------------------
  | RESPONSIVE SIDEBAR
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    function handleResize() {
      if (
        window.innerWidth > 768
      ) {
        setMobileOpen(false);
      }
    }

    window.addEventListener(
      'resize',
      handleResize,
    );

    return () => {
      window.removeEventListener(
        'resize',
        handleResize,
      );
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | CLOSE MOBILE DRAWER
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  /*
  |--------------------------------------------------------------------------
  | BODY SCROLL LOCK
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      'hidden';

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [mobileOpen]);

  /*
  |--------------------------------------------------------------------------
  | MOBILE PAGE TITLE
  |--------------------------------------------------------------------------
  */

  function getCurrentViewLabel() {
    if (
      isManageArtistsRoute
    ) {
      return 'Manage Artists';
    }

    if (
      isManageSongsRoute
    ) {
      return 'Manage Songs';
    }

    if (isAdminRoute) {
      return 'Admin Dashboard';
    }

    if (isArtistRoute) {
      return 'Artists';
    }

    if (isAlbumRoute) {
      return 'Albums';
    }

    if (isDiscoverRoute) {
      return 'Discover';
    }

    if (isLibraryRoute) {
      return 'Library';
    }

    if (isFavoritesRoute) {
      return 'Favorites';
    }

    if (isSettingsRoute) {
      return 'Settings';
    }

    if (isHomeRoute) {
      return 'Home';
    }

    return (
      navItems.find(
        (item) =>
          item.view === view,
      )?.label || 'Aura'
    );
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <>
      {/* ==================================================
          SIDEBAR
      ================================================== */}

      <aside
        className={`sidebar${
          mobileOpen
            ? ' mobile-open'
            : ''
        }`}
      >
        {/* ==================================================
            HEADER
        ================================================== */}

        <div className="sidebar-header">
          <button
            className="brand brand-button"
            type="button"
            onClick={() =>
              navigateTo('home')
            }
            aria-label="Aura home"
          >
            <span className="brand-mark">
              A
            </span>

            <span className="brand-name">
              Aura
            </span>
          </button>

          <button
            className="sidebar-close"
            type="button"
            onClick={() =>
              setMobileOpen(false)
            }
            aria-label="Close navigation"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* ==================================================
            NAVIGATION
        ================================================== */}

        <nav
          className="nav-list"
          aria-label="Primary"
        >
          <div className="nav-section-label">
            Menu
          </div>

          {navItems.map(
            (item) => (
              <button
                key={item.view}
                type="button"
                className={getNavClass(
                  item.view,
                )}
                onClick={() =>
                  navigateTo(
                    item.view,
                  )
                }
              >
                <Icon
                  name={
                    item.icon
                  }
                />

                <span className="nav-label">
                  {item.label}
                </span>
              </button>
            ),
          )}

          {/* ==================================================
              ADMINISTRATION
          ================================================== */}

          {user?.role ===
          'ADMIN' ? (
            <>
              <div className="nav-section-label admin-section-label">
                Administration
              </div>

              {/* ADMIN DASHBOARD */}

              <button
                type="button"
                className={getNavClass(
                  'admin',
                )}
                onClick={() =>
                  navigateTo(
                    'admin',
                  )
                }
              >
                <Icon name="user" />

                <span className="nav-label">
                  Admin Dashboard
                </span>
              </button>

              {/* MANAGE SONGS */}

              <button
                type="button"
                className={getNavClass(
                  'manage-songs',
                )}
                onClick={() =>
                  navigateTo(
                    'manage-songs',
                  )
                }
              >
                <Icon name="music" />

                <span className="nav-label">
                  Manage Songs
                </span>
              </button>

              {/* MANAGE ARTISTS */}

              <button
                type="button"
                className={getNavClass(
                  'manage-artists',
                )}
                onClick={() =>
                  navigateTo(
                    'manage-artists',
                  )
                }
              >
                <Icon name="user" />

                <span className="nav-label">
                  Manage Artists
                </span>
              </button>
            </>
          ) : null}
        </nav>

        {/* ==================================================
            ACCOUNT
        ================================================== */}

        <div className="account-panel">
          <div
            className="account-avatar"
            aria-hidden="true"
          >
            {(
              user?.email ||
              'U'
            )
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="account-info">
            <small
              title={user?.email}
            >
              {user?.email ||
                'User'}
            </small>

            <span>
              {user?.role ===
              'ADMIN'
                ? 'Administrator'
                : 'Listener'}
            </span>
          </div>

          <button
            className="sign-out-button"
            type="button"
            onClick={
              handleLogout
            }
          >
            <Icon name="logout" />

            <span>
              Sign out
            </span>
          </button>
        </div>
      </aside>

      {/* ==================================================
          MOBILE HEADER
      ================================================== */}

      <header className="mobile-sidebar-bar">
        <button
          className="mobile-menu-button"
          type="button"
          onClick={() =>
            setMobileOpen(true)
          }
          aria-label="Open navigation"
          aria-expanded={
            mobileOpen
          }
        >
          <span />
          <span />
          <span />
        </button>

        <button
          className="mobile-brand"
          type="button"
          onClick={() =>
            navigateTo('home')
          }
          aria-label="Aura home"
        >
          <span className="brand-mark">
            A
          </span>

          <span>
            Aura
          </span>
        </button>

        <span className="mobile-current-view">
          {getCurrentViewLabel()}
        </span>
      </header>

      {/* ==================================================
          MOBILE BACKDROP
      ================================================== */}

      {mobileOpen ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() =>
            setMobileOpen(false)
          }
        />
      ) : null}
    </>
  );
}

export default Sidebar;