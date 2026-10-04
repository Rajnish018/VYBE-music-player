import {
  createPortal,
} from 'react-dom';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useNavigate,
} from 'react-router-dom';

import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';
import PageHeader from '../../components/PageHeader';

import {
  useArtists,
} from '../../hooks/useArtists.js';

import './ManageArtists.css';

const ARTISTS_PER_LOAD = 20;

function ManageArtists({
  token,
}) {
  const navigate = useNavigate();

  const {
    artists,
    loading,
    saving,
    error,
    success,
    search,
    setSearch,
    addArtist,
    updateArtist,
    deleteArtist,
    clearMessages,
  } = useArtists(token);

  // =====================================================
  // MODAL
  // =====================================================

  const [modalMode, setModalMode] =
    useState(null);

  const [editingArtist, setEditingArtist] =
    useState(null);

  const [
    deleteArtistTarget,
    setDeleteArtistTarget,
  ] = useState(null);

  // =====================================================
  // ARTIST FORM
  // =====================================================

  const [artistName, setArtistName] =
    useState('');

  const [
    artistDescription,
    setArtistDescription,
  ] = useState('');

  const [
    artistCoverUrl,
    setArtistCoverUrl,
  ] = useState('');

  // =====================================================
  // IMAGE
  // =====================================================

  const [
    artistImageFile,
    setArtistImageFile,
  ] = useState(null);

  const [
    artistImagePreview,
    setArtistImagePreview,
  ] = useState('');

  // =====================================================
  // SCROLL
  // =====================================================

  const savedScrollPosition =
    useRef(0);

  // =====================================================
  // LAZY LOADING
  // =====================================================

  const [
    visibleCount,
    setVisibleCount,
  ] = useState(
    ARTISTS_PER_LOAD,
  );

  const loadMoreRef =
    useRef(null);

  // =====================================================
  // RESET ON SEARCH
  // =====================================================

  useEffect(() => {
    setVisibleCount(
      ARTISTS_PER_LOAD,
    );
  }, [search]);

  // =====================================================
  // RESET AFTER DATA CHANGE
  // =====================================================

  useEffect(() => {
    setVisibleCount(
      ARTISTS_PER_LOAD,
    );
  }, [artists.length]);

  // =====================================================
  // LOAD MORE
  // =====================================================

  useEffect(() => {
    const element =
      loadMoreRef.current;

    if (!element) {
      return;
    }

    if (
      visibleCount >=
      artists.length
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          const entry =
            entries[0];

          if (
            !entry?.isIntersecting
          ) {
            return;
          }

          setVisibleCount(
            (current) =>
              Math.min(
                current +
                  ARTISTS_PER_LOAD,
                artists.length,
              ),
          );
        },
        {
          root: null,
          rootMargin: '500px',
          threshold: 0,
        },
      );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [
    visibleCount,
    artists.length,
  ]);

  const visibleArtists =
    artists.slice(
      0,
      visibleCount,
    );

  // =====================================================
  // SCROLL POSITION
  // =====================================================

  function saveCurrentScrollPosition() {
    savedScrollPosition.current =
      window.scrollY;
  }

  function restoreScrollPosition() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top:
            savedScrollPosition.current,
          left: 0,
          behavior: 'auto',
        });
      });
    });
  }

  // =====================================================
  // LOCK PAGE SCROLL WHILE MODAL IS OPEN
  // =====================================================

  useEffect(() => {
    if (!modalMode) {
      return;
    }

    const body =
      document.body;

    const html =
      document.documentElement;

    const previousBodyOverflow =
      body.style.overflow;

    const previousHtmlOverflow =
      html.style.overflow;

    const previousBodyPaddingRight =
      body.style.paddingRight;

    const scrollbarWidth =
      window.innerWidth -
      html.clientWidth;

    body.style.overflow =
      'hidden';

    html.style.overflow =
      'hidden';

    if (scrollbarWidth > 0) {
      body.style.paddingRight =
        `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow =
        previousBodyOverflow;

      html.style.overflow =
        previousHtmlOverflow;

      body.style.paddingRight =
        previousBodyPaddingRight;

      restoreScrollPosition();
    };
  }, [modalMode]);

  // =====================================================
  // IMAGE PREVIEW CLEANUP
  // =====================================================

  useEffect(() => {
    return () => {
      if (
        artistImagePreview &&
        artistImagePreview.startsWith(
          'blob:',
        )
      ) {
        URL.revokeObjectURL(
          artistImagePreview,
        );
      }
    };
  }, [artistImagePreview]);

  // =====================================================
  // OPEN ADD ARTIST
  // =====================================================

  function openAddArtist() {
    clearMessages();

    saveCurrentScrollPosition();

    setEditingArtist(null);

    setArtistName('');
    setArtistDescription('');
    setArtistCoverUrl('');

    setArtistImageFile(null);
    setArtistImagePreview('');

    setModalMode('add');
  }

  // =====================================================
  // OPEN EDIT ARTIST
  // =====================================================

  function openEditArtist(
    artist,
    event,
  ) {
    event?.stopPropagation();

    clearMessages();

    saveCurrentScrollPosition();

    setEditingArtist(artist);

    setArtistName(
      artist.name || '',
    );

    setArtistDescription(
      artist.description || '',
    );

    setArtistCoverUrl(
      artist.coverUrl || '',
    );

    // Important:
    // No new file selected initially.
    setArtistImageFile(null);
    setArtistImagePreview('');

    setModalMode('edit');
  }

  // =====================================================
  // OPEN ARTIST DETAIL
  // =====================================================

  function openArtistDetail(
    artist,
  ) {
    if (!artist?.name) {
      return;
    }

    const artistKey =
      artist.name
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase();

    console.log(
      'Navigating to artist detail:',
      artistKey,
    );

    navigate(
      `/artists/${encodeURIComponent(
        artistKey,
      )}`,
    );
  }

  // =====================================================
  // DELETE MODAL
  // =====================================================

  function openDeleteArtistModal(
    artist,
    event,
  ) {
    event?.stopPropagation();

    if (
      !artist?.id ||
      saving
    ) {
      return;
    }

    clearMessages();

    saveCurrentScrollPosition();

    setDeleteArtistTarget(
      artist,
    );
  }

  function closeDeleteArtistModal() {
    if (saving) {
      return;
    }

    setDeleteArtistTarget(null);

    restoreScrollPosition();
  }

  async function confirmDeleteArtist() {
    if (
      !deleteArtistTarget?.id ||
      saving
    ) {
      return;
    }

    console.log(
      '[ARTIST DELETE] Starting:',
      deleteArtistTarget.id,
    );

    const deleted =
      await deleteArtist(
        deleteArtistTarget.id,
      );

    if (!deleted) {
      console.error(
        '[ARTIST DELETE] Failed',
      );

      return;
    }

    console.log(
      '[ARTIST DELETE] Success',
    );

    setDeleteArtistTarget(null);

    setVisibleCount(
      ARTISTS_PER_LOAD,
    );

    restoreScrollPosition();
  }

  // =====================================================
  // IMAGE SELECT
  // =====================================================

  function handleArtistImageChange(
    event,
  ) {
    const file =
      event.target.files?.[0];

    // Allow selecting the same file again.
    event.target.value = '';

    if (!file) {
      console.log(
        '[ARTIST IMAGE] No file selected',
      );

      return;
    }

    console.log(
      '[ARTIST IMAGE] Selected file:',
      {
        name: file.name,
        type: file.type,
        size: file.size,
      },
    );

    if (
      !file.type.startsWith(
        'image/',
      )
    ) {
      console.error(
        '[ARTIST IMAGE] Invalid file type:',
        file.type,
      );

      return;
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      console.error(
        '[ARTIST IMAGE] File too large:',
        file.size,
      );

      return;
    }

    if (
      artistImagePreview &&
      artistImagePreview.startsWith(
        'blob:',
      )
    ) {
      URL.revokeObjectURL(
        artistImagePreview,
      );
    }

    const previewUrl =
      URL.createObjectURL(
        file,
      );

    setArtistImageFile(file);

    setArtistImagePreview(
      previewUrl,
    );

    // New image replaces old preview.
    setArtistCoverUrl('');

    console.log(
      '[ARTIST IMAGE] File stored in React state:',
      file.name,
    );
  }

  // =====================================================
  // CLOSE MODAL
  // =====================================================

  function closeModal() {
    if (saving) {
      return;
    }

    setModalMode(null);

    setEditingArtist(null);

    setArtistName('');
    setArtistDescription('');
    setArtistCoverUrl('');

    setArtistImageFile(null);
    setArtistImagePreview('');

    clearMessages();

    restoreScrollPosition();
  }

  // =====================================================
  // ADD ARTIST
  // =====================================================

  async function handleAdd(
    event,
  ) {
    event.preventDefault();

    clearMessages();

    const name =
      artistName.trim();

    const description =
      artistDescription.trim();

    if (!name) {
      return;
    }

    console.log(
      '[ARTIST ADD] Starting:',
      {
        name,
        description,
        image:
          artistImageFile
            ? {
                name:
                  artistImageFile.name,
                type:
                  artistImageFile.type,
                size:
                  artistImageFile.size,
              }
            : null,
      },
    );

    const artist =
      await addArtist({
        name,

        description,

        // IMPORTANT:
        // Send the actual File.
        coverFile:
          artistImageFile,
      });

    if (!artist) {
      console.error(
        '[ARTIST ADD] Failed',
      );

      return;
    }

    console.log(
      '[ARTIST ADD] Success:',
      artist,
    );

    closeModal();

    setVisibleCount(
      ARTISTS_PER_LOAD,
    );
  }

  // =====================================================
  // UPDATE ARTIST
  // =====================================================

  async function handleUpdate(
    event,
  ) {
    event.preventDefault();

    if (!editingArtist) {
      return;
    }

    clearMessages();

    const name =
      artistName.trim();

    const description =
      artistDescription.trim();

    if (!name) {
      return;
    }

    console.log(
      '[ARTIST UPDATE] Starting:',
      {
        id: editingArtist.id,

        name,

        description,

        image:
          artistImageFile
            ? {
                name:
                  artistImageFile.name,
                type:
                  artistImageFile.type,
                size:
                  artistImageFile.size,
              }
            : null,
      },
    );

    const updated =
      await updateArtist(
        editingArtist.id,
        {
          name,

          description,

          // IMPORTANT:
          // This is the actual File.
          coverFile:
            artistImageFile,
        },
        editingArtist,
      );

    if (!updated) {
      console.error(
        '[ARTIST UPDATE] Failed',
      );

      return;
    }

    console.log(
      '[ARTIST UPDATE] Success:',
      updated,
    );

    closeModal();
  }

  // =====================================================
  // MODAL IMAGE
  // =====================================================

  const modalImage =
    artistImagePreview ||
    artistCoverUrl ||
    '';

  // =====================================================
  // UI
  // =====================================================

  return (
    <section className="manage-artists-page">

      {/* =================================================
          HEADER
      ================================================= */}

      <PageHeader
        eyebrow="Administration"
        title="Manage Artists"
        description="Search, view, edit and manage artists in your music library."
        right={
          <span className="page-header-count">
            {artists.length}{' '}
            {artists.length === 1
              ? 'artist'
              : 'artists'}
          </span>
        }
      />

      {/* =================================================
          SEARCH + ADD
      ================================================= */}

      <div className="manage-artists-toolbar">

        <div className="manage-artist-search">

          <Icon name="search" />

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search artists..."
            aria-label="Search artists"
          />

          {search && (
            <button
              type="button"
              className="manage-artist-search-clear"
              onClick={() =>
                setSearch('')
              }
              aria-label="Clear search"
            >
              ×
            </button>
          )}

        </div>

        <button
          type="button"
          className="add-artist-trigger"
          onClick={
            openAddArtist
          }
        >
          <Icon name="plus" />

          <span>
            Add Artist
          </span>
        </button>

      </div>

      {/* =================================================
          MESSAGES
      ================================================= */}

      {error && (
        <div className="manage-artists-message error">
          {error}
        </div>
      )}

      {success && (
        <div className="manage-artists-message success">
          {success}
        </div>
      )}

      {/* =================================================
          LOADING
      ================================================= */}

      {loading &&
      artists.length === 0 ? (

        <div className="manage-artists-loading">

          <span className="manage-artists-loader" />

          <span>
            Loading artists...
          </span>

        </div>

      ) : artists.length === 0 ? (

        <div className="manage-artists-empty">

          <div className="manage-artists-empty-icon">
            <Icon name="user" />
          </div>

          <h2>
            {search
              ? 'No artists found'
              : 'No artists yet'}
          </h2>

          <p>
            {search
              ? 'Try another artist name.'
              : 'Add an artist to your music library.'}
          </p>

        </div>

      ) : (

        <>

          {/* =================================================
              ARTISTS GRID
          ================================================= */}

          <div className="manage-artists-grid">

            {visibleArtists.map(
              (artist) => (

                <article
                  key={artist.id}
                  className="manage-artist-card"
                  onClick={() =>
                    openArtistDetail(
                      artist,
                    )
                  }
                  role="link"
                  tabIndex={0}
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                        'Enter' ||
                      event.key ===
                        ' '
                    ) {
                      event.preventDefault();

                      openArtistDetail(
                        artist,
                      );
                    }
                  }}
                >

                  {/* =====================================
                      CIRCULAR COVER
                  ===================================== */}

                  <div className="manage-artist-cover">

                    {artist.coverUrl ? (

                      <CoverImage
                        src={
                          artist.coverUrl
                        }
                        token={
                          token
                        }
                      />

                    ) : (

                      <div className="manage-artist-placeholder">
                        <Icon name="user" />
                      </div>

                    )}

                    {/* =================================
                        EDIT
                    ================================= */}

                    <button
                      type="button"
                      className="manage-artist-edit"
                      onClick={(
                        event,
                      ) =>
                        openEditArtist(
                          artist,
                          event,
                        )
                      }
                      disabled={
                        saving
                      }
                      aria-label={`Edit ${artist.name}`}
                      title={`Edit ${artist.name}`}
                    >
                      <Icon name="edit" />
                    </button>

                    {/* =================================
                        DELETE
                    ================================= */}

                    <button
                      type="button"
                      className="manage-artist-delete"
                      onClick={(
                        event,
                      ) =>
                        openDeleteArtistModal(
                          artist,
                          event,
                        )
                      }
                      disabled={
                        saving
                      }
                      aria-label={`Delete ${artist.name}`}
                      title={`Delete ${artist.name}`}
                    >
                      <Icon name="trash" />
                    </button>

                  </div>

                  {/* =====================================
                      ARTIST INFO
                  ===================================== */}

                  <div className="manage-artist-info">

                    <strong
                      className="manage-artist-name"
                      title={
                        artist.name
                      }
                    >
                      {artist.name}
                    </strong>

                    <span className="manage-artist-meta">
                      {artist.trackCount ||
                        0}{' '}
                      {(artist.trackCount ||
                        0) === 1
                        ? 'song'
                        : 'songs'}
                    </span>

                  </div>

                </article>

              ),
            )}

          </div>

          {/* =================================================
              LOAD MORE
          ================================================= */}

          {visibleCount <
            artists.length && (

            <div
              ref={
                loadMoreRef
              }
              className="manage-artists-load-more"
              aria-hidden="true"
            >
              <span className="manage-artists-small-loader" />

              <span>
                Loading more artists...
              </span>
            </div>

          )}

        </>

      )}

      {/* =================================================
          ADD / EDIT MODAL
      ================================================= */}

      {modalMode &&
        createPortal(

          <div
            className="artist-edit-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="artist-modal-title"
            onMouseDown={(
              event,
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeModal();
              }
            }}
          >

            <form
              className="artist-edit-modal"
              onSubmit={
                modalMode ===
                'add'
                  ? handleAdd
                  : handleUpdate
              }
              onMouseDown={(
                event,
              ) =>
                event.stopPropagation()
              }
            >

              {/* =======================================
                  HEADER
              ======================================= */}

              <div className="artist-edit-header">

                <div>

                  <span>
                    Artist
                  </span>

                  <h2 id="artist-modal-title">
                    {modalMode ===
                    'add'
                      ? 'Add Artist'
                      : 'Edit Artist'}
                  </h2>

                </div>

                <button
                  type="button"
                  className="artist-edit-close"
                  onClick={
                    closeModal
                  }
                  disabled={
                    saving
                  }
                  aria-label="Close"
                >
                  ×
                </button>

              </div>

              {/* =======================================
                  IMAGE
              ======================================= */}

              <div
                className="artist-edit-avatar"
                onMouseDown={(
                  event,
                ) =>
                  event.stopPropagation()
                }
              >

                {modalImage ? (

                  <img
                    src={modalImage}
                    alt={
                      artistName ||
                      'Artist'
                    }
                  />

                ) : (

                  <div className="artist-edit-avatar-placeholder">
                    <Icon name="user" />
                  </div>

                )}

                {/* =================================
                    UPLOAD BUTTON
                ================================= */}

                <label
                  htmlFor="artist-image-upload"
                  className="artist-upload-overlay"
                  tabIndex={0}
                  onClick={(
                    event,
                  ) => {
                    event.stopPropagation();
                  }}
                  onMouseDown={(
                    event,
                  ) => {
                    event.stopPropagation();
                  }}
                >
                  <Icon name="upload" />

                  <span>
                    Upload
                  </span>
                </label>

                <input
                  id="artist-image-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  onChange={
                    handleArtistImageChange
                  }
                  onClick={(
                    event,
                  ) => {
                    event.stopPropagation();
                  }}
                  onMouseDown={(
                    event,
                  ) => {
                    event.stopPropagation();
                  }}
                  hidden
                />

              </div>

              {/* =======================================
                  NAME
              ======================================= */}

              <label htmlFor="artist-name">
                Artist Name
              </label>

              <input
                id="artist-name"
                type="text"
                value={
                  artistName
                }
                onChange={(
                  event,
                ) =>
                  setArtistName(
                    event.target.value,
                  )
                }
                placeholder="Artist name"
                maxLength={150}
                required
                disabled={
                  saving
                }
              />

              {/* =======================================
                  DESCRIPTION
              ======================================= */}

              <label htmlFor="artist-description">
                Description
              </label>

              <textarea
                id="artist-description"
                value={
                  artistDescription
                }
                onChange={(
                  event,
                ) =>
                  setArtistDescription(
                    event.target.value,
                  )
                }
                placeholder="Write something about this artist..."
                rows={5}
                maxLength={1000}
                disabled={
                  saving
                }
              />

              {/* =======================================
                  ACTIONS
              ======================================= */}

              <div className="artist-edit-actions">

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    saving
                  }
                  className="artist-edit-cancel"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    saving ||
                    !artistName.trim()
                  }
                  className="artist-edit-save"
                >
                  {saving
                    ? modalMode ===
                      'add'
                      ? 'Adding...'
                      : 'Saving...'
                    : modalMode ===
                      'add'
                      ? 'Add Artist'
                      : 'Save Changes'}
                </button>

              </div>

            </form>

          </div>,

          document.body,
        )}

      {/* =================================================
          DELETE MODAL
      ================================================= */}

      {deleteArtistTarget &&
        createPortal(

          <div
            className="artist-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="artist-delete-title"
            onMouseDown={(
              event,
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeDeleteArtistModal();
              }
            }}
          >

            <div
              className="artist-delete-modal"
              onMouseDown={(
                event,
              ) =>
                event.stopPropagation()
              }
            >

              <div className="artist-delete-icon">
                <Icon name="trash" />
              </div>

              <div className="artist-delete-content">

                <span className="artist-delete-eyebrow">
                  Delete Artist
                </span>

                <h2 id="artist-delete-title">
                  Delete "
                  {
                    deleteArtistTarget.name
                  }
                  "?
                </h2>

                <p>
                  This will remove the
                  artist from your
                  artist library.
                  This action cannot
                  be undone.
                </p>

              </div>

              <div className="artist-delete-actions">

                <button
                  type="button"
                  className="artist-delete-cancel"
                  onClick={
                    closeDeleteArtistModal
                  }
                  disabled={
                    saving
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="artist-delete-confirm"
                  onClick={
                    confirmDeleteArtist
                  }
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? 'Deleting...'
                    : 'Delete Artist'}
                </button>

              </div>

            </div>

          </div>,

          document.body,
        )}

    </section>
  );
}

export default ManageArtists;