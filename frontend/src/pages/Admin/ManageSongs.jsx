import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';

import './ManageSongs.css';

const EMPTY_FORM = {
  title: '',
  artist: '',
  album: '',
  albumArtist: '',
  movie: '',
  releaseYear: '',
  releaseDate: '',
  language: '',
  explicit: false,
  composer: '',
  copyright: '',
  publisher: '',
  description: '',
  trackNumber: '',
  discNumber: '',
  duration: '',
  genres: '',
  tags: '',
};

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_COVER_SIZE = 10 * 1024 * 1024;

function relationNames(items, relationKey) {
  if (!Array.isArray(items)) {
    return typeof items === 'string' ? items : '';
  }

  return items
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      const relation = item?.[relationKey];

      if (typeof relation === 'string') {
        return relation;
      }

      return relation?.name ?? item?.name ?? '';
    })
    .filter(Boolean)
    .join(', ');
}

function toForm(track) {
  return {
    title: typeof track?.title === 'string' ? track.title : '',
    artist: typeof track?.artist === 'string' ? track.artist : '',
    album: typeof track?.album === 'string' ? track.album : '',
    albumArtist:
      typeof track?.albumArtist === 'string' ? track.albumArtist : '',
    movie: typeof track?.movie === 'string' ? track.movie : '',
    releaseYear: track?.releaseYear ?? '',
    releaseDate: track?.releaseDate
      ? String(track.releaseDate).slice(0, 10)
      : '',
    language: typeof track?.language === 'string' ? track.language : '',
    explicit: Boolean(track?.explicit),
    composer: typeof track?.composer === 'string' ? track.composer : '',
    copyright:
      typeof track?.copyright === 'string' ? track.copyright : '',
    publisher: typeof track?.publisher === 'string' ? track.publisher : '',
    description:
      typeof track?.description === 'string' ? track.description : '',
    trackNumber: track?.trackNumber ?? '',
    discNumber: track?.discNumber ?? '',
    duration: track?.duration ?? '',
    genres: relationNames(track?.genres, 'genre'),
    tags: relationNames(track?.tags, 'tag'),
  };
}

function getCoverSrc(track, token, version) {
  if (!track?.thumbnailUrl) {
    return '';
  }

  const base = track.thumbnailUrl.startsWith('/api/')
    ? track.thumbnailUrl
    : `/api/tracks/${track.id}/cover`;

  const separator = base.includes('?') ? '&' : '?';

  return `${base}${separator}v=${version}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(response, fallback) {
  return response
    .json()
    .catch(() => ({}))
    .then((body) => body?.message || body?.error || fallback);
}

function ManageSongs({
  tracks = [],
  token,
  onTracksChange,
  onRefresh,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [message, setMessage] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverVersion, setCoverVersion] = useState(Date.now());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const coverInputRef = useRef(null);
  const objectUrlRef = useRef('');
  const savedFormRef = useRef(EMPTY_FORM);

  const filteredTracks = useMemo(() => {
    const clean = query.trim().toLowerCase();

    if (!clean) {
      return tracks;
    }

    return tracks.filter((track) =>
      `${track.title || ''} ${track.artist || ''} ${track.album || ''}`
        .toLowerCase()
        .includes(clean),
    );
  }, [tracks, query]);

  const selectedTrack = useMemo(
    () =>
      tracks.find((track) => track.id === selectedId) || null,
    [tracks, selectedId],
  );

  useEffect(() => {
    if (!selectedId && tracks.length > 0) {
      setSelectedId(tracks[0].id);
    }

    if (
      selectedId &&
      tracks.length > 0 &&
      !tracks.some((track) => track.id === selectedId)
    ) {
      setSelectedId(tracks[0].id);
    }
  }, [tracks, selectedId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedTrack() {
      if (!selectedId) {
        setForm(EMPTY_FORM);
        return;
      }

      const localTrack = tracks.find(
        (track) => track.id === selectedId,
      );

      if (localTrack) {
        const localForm = toForm(localTrack);
        setForm(localForm);
        savedFormRef.current = localForm;
        setCoverFile(null);
        revokePreview();
      }

      setLoadingTrack(true);
      setMessage(null);

      try {
        const response = await fetch(
          `/api/tracks/${selectedId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.status === 401) {
          throw new Error('Your session has expired.');
        }

        if (!response.ok) {
          throw new Error(
            await getErrorMessage(
              response,
              'Unable to load song details.',
            ),
          );
        }

        const detail = await response.json();

        if (!cancelled) {
          const detailForm = toForm(detail);
          setForm(detailForm);
          savedFormRef.current = detailForm;
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({
            type: 'error',
            text:
              error?.message ||
              'Unable to load song details.',
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingTrack(false);
        }
      }
    }

    loadSelectedTrack();

    return () => {
      cancelled = true;
    };
  }, [selectedId, token, tracks]);

  useEffect(
    () => () => {
      revokePreview();
    },
    [],
  );

  function revokePreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    }

    setCoverPreview('');
  }

  function updateField(event) {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  function selectTrack(id) {
    setSelectedId(id);
    setConfirmDelete(false);
  }

  function validateCover(file) {
    if (!file) {
      return 'Please choose an image.';
    }

    if (!IMAGE_TYPES.has(file.type)) {
      return 'Only JPEG, PNG, and WebP cover images are supported.';
    }

    if (file.size > MAX_COVER_SIZE) {
      return 'Cover image must be 10 MB or smaller.';
    }

    return '';
  }

  function handleCoverSelect(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const error = validateCover(file);

    if (error) {
      setMessage({
        type: 'error',
        text: error,
      });
      event.target.value = '';
      return;
    }

    revokePreview();

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    setCoverFile(file);
    setCoverPreview(url);
    setMessage(null);
  }

  function normalizeMetadataForm(value) {
    const source = value || EMPTY_FORM;

    return {
      title: String(source.title ?? '').trim(),
      artist: String(source.artist ?? '').trim(),
      album: String(source.album ?? '').trim(),
      albumArtist: String(source.albumArtist ?? '').trim(),
      movie: String(source.movie ?? '').trim(),
      releaseYear:
        source.releaseYear === '' || source.releaseYear == null
          ? null
          : Number(source.releaseYear),
      releaseDate: source.releaseDate
        ? String(source.releaseDate).slice(0, 10)
        : '',
      language: String(source.language ?? '').trim(),
      explicit: Boolean(source.explicit),
      composer: String(source.composer ?? '').trim(),
      copyright: String(source.copyright ?? '').trim(),
      publisher: String(source.publisher ?? '').trim(),
      description: String(source.description ?? '').trim(),
      trackNumber:
        source.trackNumber === '' || source.trackNumber == null
          ? null
          : Number(source.trackNumber),
      discNumber:
        source.discNumber === '' || source.discNumber == null
          ? null
          : Number(source.discNumber),
      duration:
        source.duration === '' || source.duration == null
          ? null
          : Number(source.duration),
      genres: String(source.genres ?? '').trim(),
      tags: String(source.tags ?? '').trim(),
    };
  }

  function metadataChanged() {
    return (
      JSON.stringify(normalizeMetadataForm(form)) !==
      JSON.stringify(normalizeMetadataForm(savedFormRef.current))
    );
  }

  async function saveMetadata(event) {
    event.preventDefault();

    if (!selectedTrack) {
      return;
    }

    const normalized = normalizeMetadataForm(form);

    if (!normalized.title || !normalized.artist) {
      setMessage({
        type: 'error',
        text: 'Title and artist are required.',
      });
      return;
    }

    // Do not make an API request when the form is already identical to the
    // last server-synced version.
    if (!metadataChanged()) {
      setMessage({
        type: 'success',
        text: 'No metadata changes to save.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        ...normalized,
        album: normalized.album || null,
        albumArtist: normalized.albumArtist || null,
        movie: normalized.movie || null,
        language: normalized.language || null,
        composer: normalized.composer || null,
        copyright: normalized.copyright || null,
        publisher: normalized.publisher || null,
        description: normalized.description || null,
        genres: normalized.genres,
        tags: normalized.tags,
      };

      const response = await fetch(
        `/api/admin/tracks/${selectedTrack.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.status === 401) {
        throw new Error('Your session has expired.');
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to save metadata.',
          ),
        );
      }

      const result = await response.json();
      const updatedTrack = result.track || result.result?.track;

      if (!updatedTrack) {
        throw new Error('The server did not return the updated song.');
      }

      const updatedForm = toForm(updatedTrack);
      savedFormRef.current = updatedForm;
      setForm(updatedForm);

      onTracksChange?.((current) =>
        current.map((track) =>
          track.id === updatedTrack.id
            ? { ...track, ...updatedTrack }
            : track,
        ),
      );

      // Fetch the canonical record after PATCH so relations, normalized
      // values, and any server-generated fields are immediately reflected.
      try {
        const refreshResponse = await fetch(
          `/api/tracks/${selectedTrack.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (refreshResponse.ok) {
          const refreshedTrack = await refreshResponse.json();
          const refreshedForm = toForm(refreshedTrack);

          savedFormRef.current = refreshedForm;
          setForm(refreshedForm);

          onTracksChange?.((current) =>
            current.map((track) =>
              track.id === refreshedTrack.id
                ? { ...track, ...refreshedTrack }
                : track,
            ),
          );
        }
      } catch {
        // PATCH succeeded, so keep the successful local/server response even
        // if the optional immediate refresh fails.
      }

      setMessage({
        type: 'success',
        text: 'Song metadata saved successfully.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          'Unable to save metadata.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function uploadCover() {
    if (!selectedTrack || !coverFile) {
      return;
    }

    const validationError = validateCover(coverFile);

    if (validationError) {
      setMessage({
        type: 'error',
        text: validationError,
      });
      return;
    }

    setCoverSaving(true);
    setMessage(null);

    try {
      const body = new FormData();
      body.append('cover', coverFile, coverFile.name);

      const response = await fetch(
        `/api/admin/tracks/${selectedTrack.id}/cover`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body,
        },
      );

      if (response.status === 401) {
        throw new Error('Your session has expired.');
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to upload cover image.',
          ),
        );
      }

      const result = await response.json();

      const updatedTrack =
        result.track || {
          ...selectedTrack,
          thumbnailUrl: `/api/tracks/${selectedTrack.id}/cover`,
        };

      onTracksChange?.((current) =>
        current.map((track) =>
          track.id === updatedTrack.id
            ? { ...track, ...updatedTrack }
            : track,
        ),
      );

      revokePreview();
      setCoverFile(null);
      setCoverVersion(Date.now());

      if (coverInputRef.current) {
        coverInputRef.current.value = '';
      }

      setMessage({
        type: 'success',
        text: 'Cover image updated successfully.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          'Unable to upload cover image.',
      });
    } finally {
      setCoverSaving(false);
    }
  }

  async function deleteCover() {
    if (!selectedTrack) {
      return;
    }

    setCoverSaving(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/tracks/${selectedTrack.id}/cover`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status === 401) {
        throw new Error('Your session has expired.');
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to remove cover image.',
          ),
        );
      }

      const result = await response.json();

      const updatedTrack =
        result.track || {
          ...selectedTrack,
          thumbnailUrl: null,
        };

      onTracksChange?.((current) =>
        current.map((track) =>
          track.id === updatedTrack.id
            ? { ...track, ...updatedTrack }
            : track,
        ),
      );

      setCoverVersion(Date.now());

      setMessage({
        type: 'success',
        text: 'Cover image removed.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          'Unable to remove cover image.',
      });
    } finally {
      setCoverSaving(false);
    }
  }

  async function deleteTrack() {
    if (!selectedTrack) {
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/tracks/${selectedTrack.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status === 401) {
        throw new Error('Your session has expired.');
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to delete song.',
          ),
        );
      }

      const deletedId = selectedTrack.id;

      onTracksChange?.((current) =>
        current.filter(
          (track) => track.id !== deletedId,
        ),
      );

      setSelectedId(null);
      setConfirmDelete(false);
      setMessage({
        type: 'success',
        text: 'Song deleted successfully.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          'Unable to delete song.',
      });
    } finally {
      setDeleting(false);
    }
  }

  function resetForm() {
    if (selectedTrack) {
      const resetValue = toForm(selectedTrack);
      setForm(resetValue);
      savedFormRef.current = resetValue;
    }

    revokePreview();
    setCoverFile(null);

    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }

    setMessage(null);
  }

  const coverSrc = selectedTrack
    ? getCoverSrc(
        selectedTrack,
        token,
        coverVersion,
      )
    : '';

  return (
    <section className="manage-songs-page">
      <header className="manage-songs-header">
        <div>
          <p className="eyebrow">
            Administrator
          </p>

          <h1>Manage Songs</h1>

          <p className="manage-songs-subtitle">
            Edit metadata, manage artwork, and
            maintain your production music library.
          </p>
        </div>

        <div className="manage-songs-count">
          <strong>{tracks.length}</strong>
          <span>songs</span>
        </div>
      </header>

      {message ? (
        <div
          className={`manage-message ${message.type}`}
          role="status"
        >
          <span>{message.text}</span>

          <button
            type="button"
            onClick={() => setMessage(null)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="manage-songs-layout">
        {/* =================================================
            SONG LIST
            ================================================= */}

        <aside className="songs-panel">
          <div className="songs-panel-header">
            <div>
              <span className="section-kicker">
                Library
              </span>
              <h2>All songs</h2>
            </div>

            <span className="songs-total">
              {filteredTracks.length}
            </span>
          </div>

          <div className="song-search">
            <Icon name="search" />

            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search songs..."
              aria-label="Search songs"
            />
          </div>

          <div className="songs-list">
            {filteredTracks.length === 0 ? (
              <div className="songs-empty">
                <span>No songs found</span>
                <small>
                  Try a different search.
                </small>
              </div>
            ) : (
              filteredTracks.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  className={`song-list-item ${
                    selectedId === track.id
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    selectTrack(track.id)
                  }
                >
                  <div className="song-list-cover">
                    <CoverImage
                      src={track.thumbnailUrl}
                      token={token}
                    />
                  </div>

                  <span className="song-list-info">
                    <strong>
                      {track.title ||
                        'Untitled track'}
                    </strong>

                    <small>
                      {track.artist ||
                        'Unknown Artist'}
                    </small>
                  </span>

                  <span className="song-list-arrow">
                    ›
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* =================================================
            EDITOR
            ================================================= */}

        <main className="song-editor">
          {!selectedTrack ? (
            <div className="editor-empty">
              <div className="editor-empty-icon">
                <Icon name="music" />
              </div>

              <h2>Select a song</h2>

              <p>
                Choose a song from the library to
                edit its metadata and artwork.
              </p>
            </div>
          ) : (
            <>
              <div className="editor-top">
                <div>
                  <span className="section-kicker">
                    Song editor
                  </span>

                  <h2>
                    {selectedTrack.title ||
                      'Untitled track'}
                  </h2>

                  <p>
                    ID: {selectedTrack.id}
                  </p>
                </div>

                <div className="editor-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={resetForm}
                    disabled={
                      saving ||
                      coverSaving ||
                      deleting ||
                      loadingTrack
                    }
                  >
                    Reset
                  </button>

                  <button
                    type="submit"
                    form="song-metadata-form"
                    className="primary-action"
                    disabled={
                      saving ||
                      coverSaving ||
                      deleting ||
                      loadingTrack
                    }
                  >
                    {saving
                      ? 'Saving...'
                      : metadataChanged()
                        ? 'Save changes'
                        : 'No changes'}
                  </button>
                </div>
              </div>

              {loadingTrack ? (
                <div className="editor-loading">
                  Loading song details...
                </div>
              ) : null}

              <div className="editor-grid">
                

                {/* =================================================
                    METADATA
                    ================================================= */}

                <form
                  id="song-metadata-form"
                  className="editor-card metadata-card"
                  onSubmit={saveMetadata}
                >
                  <div className="card-heading">
                    <div>
                      <span className="section-kicker">
                        Metadata
                      </span>
                      <h3>Song information</h3>
                    </div>
                  </div>

                  <div className="form-grid">
                    <label className="field field-wide">
                      <span>Title *</span>
                      <input
                        name="title"
                        value={form.title}
                        onChange={updateField}
                        required
                        maxLength={200}
                        placeholder="Song title"
                      />
                    </label>

                    <label className="field">
                      <span>Artist *</span>
                      <input
                        name="artist"
                        value={form.artist}
                        onChange={updateField}
                        required
                        maxLength={200}
                        placeholder="Artist"
                      />
                    </label>

                    <label className="field">
                      <span>Album</span>
                      <input
                        name="album"
                        value={form.album}
                        onChange={updateField}
                        maxLength={200}
                        placeholder="Album"
                      />
                    </label>

                    <label className="field">
                      <span>Album artist</span>
                      <input
                        name="albumArtist"
                        value={form.albumArtist}
                        onChange={updateField}
                        maxLength={200}
                        placeholder="Album artist"
                      />
                    </label>

                    <label className="field">
                      <span>Movie / soundtrack</span>
                      <input
                        name="movie"
                        value={form.movie}
                        onChange={updateField}
                        maxLength={200}
                        placeholder="Movie or soundtrack"
                      />
                    </label>

                    <label className="field">
                      <span>Language</span>
                      <input
                        name="language"
                        value={form.language}
                        onChange={updateField}
                        maxLength={80}
                        placeholder="e.g. Hindi"
                      />
                    </label>

                    <label className="field">
                      <span>Release year</span>
                      <input
                        name="releaseYear"
                        type="number"
                        min="0"
                        max="9999"
                        value={form.releaseYear}
                        onChange={updateField}
                        placeholder="2026"
                      />
                    </label>

                    <label className="field">
                      <span>Release date</span>
                      <input
                        name="releaseDate"
                        type="date"
                        value={form.releaseDate}
                        onChange={updateField}
                      />
                    </label>

                    <label className="field">
                      <span>Composer</span>
                      <input
                        name="composer"
                        value={form.composer}
                        onChange={updateField}
                        maxLength={200}
                        placeholder="Composer"
                      />
                    </label>

                    <label className="field">
                      <span>Publisher</span>
                      <input
                        name="publisher"
                        value={form.publisher}
                        onChange={updateField}
                        maxLength={200}
                        placeholder="Publisher"
                      />
                    </label>

                    <label className="field">
                      <span>Copyright</span>
                      <input
                        name="copyright"
                        value={form.copyright}
                        onChange={updateField}
                        maxLength={300}
                        placeholder="Copyright"
                      />
                    </label>

                    <label className="field">
                      <span>Track number</span>
                      <input
                        name="trackNumber"
                        type="number"
                        min="1"
                        value={form.trackNumber}
                        onChange={updateField}
                        placeholder="1"
                      />
                    </label>

                    <label className="field">
                      <span>Disc number</span>
                      <input
                        name="discNumber"
                        type="number"
                        min="1"
                        value={form.discNumber}
                        onChange={updateField}
                        placeholder="1"
                      />
                    </label>

                    <label className="field">
                      <span>Duration (seconds)</span>
                      <input
                        name="duration"
                        type="number"
                        min="1"
                        value={form.duration}
                        onChange={updateField}
                        placeholder="240"
                      />
                    </label>

                    <label className="field field-wide">
                      <span>Genres</span>
                      <input
                        name="genres"
                        value={form.genres}
                        onChange={updateField}
                        placeholder="Romance, Bollywood, Acoustic"
                      />
                      <small>
                        Separate multiple genres with commas.
                      </small>
                    </label>

                    <label className="field field-wide">
                      <span>Tags</span>
                      <input
                        name="tags"
                        value={form.tags}
                        onChange={updateField}
                        placeholder="romantic, female vocal, soundtrack"
                      />
                      <small>
                        Add searchable production tags.
                      </small>
                    </label>

                    <label className="field field-wide">
                      <span>Description</span>
                      <textarea
                        name="description"
                        value={form.description}
                        onChange={updateField}
                        rows="4"
                        maxLength={2000}
                        placeholder="Song description..."
                      />
                    </label>

                    <label className="explicit-field field-wide">
                      <input
                        name="explicit"
                        type="checkbox"
                        checked={form.explicit}
                        onChange={updateField}
                      />

                      <span>
                        <strong>Explicit content</strong>
                        <small>
                          Mark this track as containing explicit
                          content.
                        </small>
                      </span>
                    </label>
                  </div>
                </form>
                {/* =================================================
                    ARTWORK
                    ================================================= */}

                <section className="editor-card artwork-card">
                  <div className="card-heading">
                    <div>
                      <span className="section-kicker">
                        Artwork
                      </span>
                      <h3>Cover image</h3>
                    </div>

                    {coverFile ? (
                      <span className="pending-badge">
                        Unsaved
                      </span>
                    ) : null}
                  </div>

                  <div className="artwork-manager">
                    <div className="artwork-preview">
                      {coverPreview ? (
                        <img
                          src={coverPreview}
                          alt="New cover preview"
                        />
                      ) : coverSrc ? (
                        <CoverImage
                          src={coverSrc}
                          token={token}
                        />
                      ) : (
                        <div className="artwork-placeholder">
                          <Icon name="music" />
                          <span>
                            No cover
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="artwork-details">
                      <strong>
                        {coverFile
                          ? coverFile.name
                          : selectedTrack.thumbnailUrl
                            ? 'Current cover'
                            : 'No cover image'}
                      </strong>

                      <span>
                        {coverFile
                          ? formatBytes(
                              coverFile.size,
                            )
                          : 'JPEG, PNG or WebP · max 10 MB'}
                      </span>

                      <div className="artwork-actions">
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() =>
                            coverInputRef.current?.click()
                          }
                          disabled={
                            coverSaving ||
                            saving ||
                            deleting
                          }
                        >
                          {coverFile
                            ? 'Choose another'
                            : 'Choose cover'}
                        </button>

                        {coverFile ? (
                          <button
                            type="button"
                            className="primary-action"
                            onClick={uploadCover}
                            disabled={
                              coverSaving ||
                              saving ||
                              deleting
                            }
                          >
                            {coverSaving
                              ? 'Uploading...'
                              : 'Upload cover'}
                          </button>
                        ) : selectedTrack.thumbnailUrl ? (
                          <button
                            type="button"
                            className="danger-action"
                            onClick={deleteCover}
                            disabled={
                              coverSaving ||
                              saving ||
                              deleting
                            }
                          >
                            {coverSaving
                              ? 'Removing...'
                              : 'Remove cover'}
                          </button>
                        ) : null}
                      </div>

                      <input
                        ref={coverInputRef}
                        className="visually-hidden"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={
                          handleCoverSelect
                        }
                      />
                    </div>
                  </div>
                </section>
              </div>

              {/* =================================================
                  DANGER ZONE
                  ================================================= */}

              <section className="danger-zone">
                <div>
                  <span className="section-kicker">
                    Danger zone
                  </span>

                  <h3>Delete this song</h3>

                  <p>
                    Permanently removes the track,
                    audio file, artwork, and database
                    record. This cannot be undone.
                  </p>
                </div>

                {!confirmDelete ? (
                  <button
                    type="button"
                    className="danger-action"
                    onClick={() =>
                      setConfirmDelete(true)
                    }
                    disabled={
                      saving ||
                      coverSaving ||
                      deleting
                    }
                  >
                    Delete song
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <span>
                      Are you sure?
                    </span>

                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() =>
                        setConfirmDelete(false)
                      }
                      disabled={deleting}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="danger-action"
                      onClick={deleteTrack}
                      disabled={deleting}
                    >
                      {deleting
                        ? 'Deleting...'
                        : 'Yes, delete'}
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </section>
  );
}

export default ManageSongs;
