import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from './Icons';
import './Sidebar.css';

const navItems = [
  { view: 'home', label: 'Home', icon: 'home' },
  { view: 'discover', label: 'Discover', icon: 'search' },
  { view: 'library', label: 'Library', icon: 'library' },
  { view: 'favorites', label: 'Favorites', icon: 'heart' },
  { view: 'albums', label: 'Albums', icon: 'album' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
];

function Sidebar({ view, user, onNavigate, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  /*
   * Albums has two types of routes:
   *
   * /albums
   * /albums/:albumKey
   *
   * Both should keep "Albums" active in the sidebar.
   */
  const isAlbumRoute =
    location.pathname === '/albums' ||
    location.pathname.startsWith('/albums/');

  function getNavClass(itemView) {
  // Dynamic album pages must belong only to Albums.
  if (isAlbumRoute) {
    return itemView === 'albums'
      ? 'nav-item active'
      : 'nav-item';
  }

  return view === itemView
    ? 'nav-item active'
    : 'nav-item';
}

  function navigateTo(nextView) {
    setMobileOpen(false);
    onNavigate(nextView);
  }

  function handleLogout() {
    setMobileOpen(false);
    onLogout();
  }

  // Close mobile drawer after route change or when viewport becomes desktop.
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth > 768) {
        setMobileOpen(false);
      }
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener(
        'resize',
        handleResize
      );
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [mobileOpen]);

  /*
   * Determine the current mobile page title.
   */
  function getCurrentViewLabel() {
    if (isAlbumRoute) {
      return 'Albums';
    }

    if (view === 'manage-songs') {
      return 'Manage Songs';
    }

    if (view === 'admin') {
      return 'Admin Dashboard';
    }

    return (
      navItems.find(
        (item) => item.view === view
      )?.label || 'Aura'
    );
  }

  return (
    <>
      <aside
        className={`sidebar${
          mobileOpen ? ' mobile-open' : ''
        }`}
      >
        <div className="sidebar-header">
          <button
            className="brand brand-button"
            type="button"
            onClick={() => navigateTo('home')}
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

        <nav
          className="nav-list"
          aria-label="Primary"
        >
          <div className="nav-section-label">
            Menu
          </div>

          {navItems.map((item) => (
            <button
              key={item.view}
              type="button"
              className={getNavClass(
                item.view
              )}
              onClick={() =>
                navigateTo(item.view)
              }
            >
              <Icon name={item.icon} />

              <span className="nav-label">
                {item.label}
              </span>
            </button>
          ))}

          {user?.role === 'ADMIN' ? (
            <>
              <div className="nav-section-label admin-section-label">
                Administration
              </div>

              <button
                type="button"
                className={getNavClass(
                  'admin'
                )}
                onClick={() =>
                  navigateTo('admin')
                }
              >
                <Icon name="user" />

                <span className="nav-label">
                  Admin Dashboard
                </span>
              </button>

              <button
                type="button"
                className={getNavClass(
                  'manage-songs'
                )}
                onClick={() =>
                  navigateTo('manage-songs')
                }
              >
                <Icon name="music" />

                <span className="nav-label">
                  Manage Songs
                </span>
              </button>
            </>
          ) : null}
        </nav>

        <div className="account-panel">
          <div
            className="account-avatar"
            aria-hidden="true"
          >
            {(user?.email || 'U')
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="account-info">
            <small title={user?.email}>
              {user?.email || 'User'}
            </small>

            <span>
              {user?.role === 'ADMIN'
                ? 'Administrator'
                : 'Listener'}
            </span>
          </div>

          <button
            className="sign-out-button"
            type="button"
            onClick={handleLogout}
          >
            <Icon name="logout" />

            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <header className="mobile-sidebar-bar">
        <button
          className="mobile-menu-button"
          type="button"
          onClick={() =>
            setMobileOpen(true)
          }
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
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

          <span>Aura</span>
        </button>

        <span className="mobile-current-view">
          {getCurrentViewLabel()}
        </span>
      </header>

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