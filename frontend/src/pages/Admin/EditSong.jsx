import {
  useEffect,
  useRef,
  useState,
} from 'react';

import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';

import './EditSong.css';

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

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'm4a',
  'aac',
  'flac',
  'ogg',
  'oga',
  'opus',
]);

const MAX_COVER_SIZE =
  10 * 1024 * 1024;

function relationNames(
  items,
  relationKey,
) {
  if (!Array.isArray(items)) {
    return typeof items === 'string'
      ? items
      : '';
  }

  return items
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      const relation =
        item?.[relationKey];

      if (
        typeof relation === 'string'
      ) {
        return relation;
      }

      return (
        relation?.name ??
        item?.name ??
        ''
      );
    })
    .filter(Boolean)
    .join(', ');
}

function toForm(track) {
  return {
    title:
      typeof track?.title === 'string'
        ? track.title
        : '',

    artist:
      typeof track?.artist === 'string'
        ? track.artist
        : '',

    album:
      typeof track?.album === 'string'
        ? track.album
        : '',

    albumArtist:
      typeof track?.albumArtist ===
      'string'
        ? track.albumArtist
        : '',

    movie:
      typeof track?.movie === 'string'
        ? track.movie
        : '',

    releaseYear:
      track?.releaseYear ?? '',

    releaseDate:
      track?.releaseDate
        ? String(
            track.releaseDate,
          ).slice(0, 10)
        : '',

    language:
      typeof track?.language === 'string'
        ? track.language
        : '',

    explicit:
      Boolean(track?.explicit),

    composer:
      typeof track?.composer ===
      'string'
        ? track.composer
        : '',

    copyright:
      typeof track?.copyright ===
      'string'
        ? track.copyright
        : '',

    publisher:
      typeof track?.publisher ===
      'string'
        ? track.publisher
        : '',

    description:
      typeof track?.description ===
      'string'
        ? track.description
        : '',

    trackNumber:
      track?.trackNumber ?? '',

    discNumber:
      track?.discNumber ?? '',

    duration:
      track?.duration ?? '',

    genres: relationNames(
      track?.genres,
      'genre',
    ),

    tags: relationNames(
      track?.tags,
      'tag',
    ),
  };
}

function formatDuration(seconds) {
  if (
    seconds === '' ||
    seconds === null ||
    seconds === undefined
  ) {
    return '';
  }

  const value = Number(seconds);

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return '—';
  }

  const totalSeconds =
    Math.round(value);

  const minutes =
    Math.floor(
      totalSeconds / 60,
    );

  const remainingSeconds =
    totalSeconds % 60;

  return `${minutes}:${String(
    remainingSeconds,
  ).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

async function getErrorMessage(
  response,
  fallback,
) {
  try {
    const body =
      await response.json();

    return (
      body?.message ||
      body?.error ||
      fallback
    );
  } catch {
    return fallback;
  }
}

function EditSong({
  track,
  token,
  onTracksChange,
  onBack,
}) {
  const [form, setForm] =
    useState(EMPTY_FORM);

  const [loadingTrack, setLoadingTrack] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [audioFile, setAudioFile] =
    useState(null);

  const [audioSaving, setAudioSaving] =
    useState(false);

  const [coverFile, setCoverFile] =
    useState(null);

  const [coverPreview, setCoverPreview] =
    useState('');

  const [coverVersion, setCoverVersion] =
    useState(Date.now());

  const [coverSaving, setCoverSaving] =
    useState(false);

  const [message, setMessage] =
    useState(null);

  const [deleting, setDeleting] =
    useState(false);

  const [confirmDelete, setConfirmDelete] =
    useState(false);

  const audioInputRef =
    useRef(null);

  const coverInputRef =
    useRef(null);

  const objectUrlRef =
    useRef('');

  const savedFormRef =
    useRef(EMPTY_FORM);

  useEffect(() => {
    let cancelled = false;

    async function loadTrack() {
      if (!track?.id) {
        setForm(EMPTY_FORM);
        return;
      }

      const localForm =
        toForm(track);

      setForm(localForm);
      savedFormRef.current =
        localForm;

      setLoadingTrack(true);
      setMessage(null);

      try {
        const response =
          await fetch(
            `/api/tracks/${track.id}`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          );

        if (
          response.status === 401
        ) {
          throw new Error(
            'Your session has expired.',
          );
        }

        if (!response.ok) {
          throw new Error(
            await getErrorMessage(
              response,
              'Unable to load song details.',
            ),
          );
        }

        const detail =
          await response.json();

        if (cancelled) {
          return;
        }

        const detailForm =
          toForm(detail);

        setForm(detailForm);
        savedFormRef.current =
          detailForm;

        onTracksChange?.(
          (current) =>
            current.map(
              (item) =>
                item.id === detail.id
                  ? {
                      ...item,
                      ...detail,
                    }
                  : item,
            ),
        );
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

    loadTrack();

    return () => {
      cancelled = true;
    };
  }, [
    track?.id,
    token,
  ]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(
          objectUrlRef.current,
        );
      }
    };
  }, []);

  function clearCoverPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(
        objectUrlRef.current,
      );

      objectUrlRef.current = '';
    }

    setCoverPreview('');
  }

  function updateField(event) {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setForm((current) => ({
      ...current,
      [name]:
        type === 'checkbox'
          ? checked
          : value,
    }));
  }

  function normalizeForm(value) {
    const source =
      value || EMPTY_FORM;

    return {
      title: String(
        source.title ?? '',
      ).trim(),

      artist: String(
        source.artist ?? '',
      ).trim(),

      album: String(
        source.album ?? '',
      ).trim(),

      albumArtist: String(
        source.albumArtist ?? '',
      ).trim(),

      movie: String(
        source.movie ?? '',
      ).trim(),

      releaseYear:
        source.releaseYear === '' ||
        source.releaseYear == null
          ? null
          : Number(
              source.releaseYear,
            ),

      releaseDate:
        source.releaseDate
          ? String(
              source.releaseDate,
            ).slice(0, 10)
          : '',

      language: String(
        source.language ?? '',
      ).trim(),

      explicit:
        Boolean(source.explicit),

      composer: String(
        source.composer ?? '',
      ).trim(),

      copyright: String(
        source.copyright ?? '',
      ).trim(),

      publisher: String(
        source.publisher ?? '',
      ).trim(),

      description: String(
        source.description ?? '',
      ).trim(),

      trackNumber:
        source.trackNumber === '' ||
        source.trackNumber == null
          ? null
          : Number(
              source.trackNumber,
            ),

      discNumber:
        source.discNumber === '' ||
        source.discNumber == null
          ? null
          : Number(
              source.discNumber,
            ),

      duration:
        source.duration === '' ||
        source.duration == null
          ? null
          : Number(
              source.duration,
            ),

      genres: String(
        source.genres ?? '',
      ).trim(),

      tags: String(
        source.tags ?? '',
      ).trim(),
    };
  }

  function metadataChanged() {
    return (
      JSON.stringify(
        normalizeForm(form),
      ) !==
      JSON.stringify(
        normalizeForm(
          savedFormRef.current,
        ),
      )
    );
  }

  async function saveMetadata(
    event,
  ) {
    event.preventDefault();

    if (!track?.id) {
      return;
    }

    const normalized =
      normalizeForm(form);

    if (
      !normalized.title ||
      !normalized.artist
    ) {
      setMessage({
        type: 'error',
        text:
          'Title and artist are required.',
      });

      return;
    }

    if (!metadataChanged()) {
      setMessage({
        type: 'success',
        text:
          'No metadata changes to save.',
      });

      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        ...normalized,

        album:
          normalized.album || null,

        albumArtist:
          normalized.albumArtist ||
          null,

        movie:
          normalized.movie || null,

        language:
          normalized.language || null,

        composer:
          normalized.composer || null,

        copyright:
          normalized.copyright || null,

        publisher:
          normalized.publisher || null,

        description:
          normalized.description ||
          null,
      };

      const response =
        await fetch(
          `/api/admin/tracks/${track.id}`,
          {
            method: 'PATCH',

            headers: {
              Authorization:
                `Bearer ${token}`,
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              payload,
            ),
          },
        );

      if (
        response.status === 401
      ) {
        throw new Error(
          'Your session has expired.',
        );
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to save metadata.',
          ),
        );
      }

      const result =
        await response.json();

      const updatedTrack =
        result.track ||
        result.result?.track;

      if (!updatedTrack) {
        throw new Error(
          'The server did not return the updated song.',
        );
      }

      const updatedForm =
        toForm(updatedTrack);

      setForm(updatedForm);
      savedFormRef.current =
        updatedForm;

      onTracksChange?.(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              updatedTrack.id
                ? {
                    ...item,
                    ...updatedTrack,
                  }
                : item,
          ),
      );

      setMessage({
        type: 'success',
        text:
          'Song metadata saved successfully.',
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

  function validateAudio(file) {
    if (!file) {
      return 'Please choose an audio file.';
    }

    const extension =
      file.name
        .split('.')
        .pop()
        ?.toLowerCase();

    if (
      !AUDIO_EXTENSIONS.has(
        extension,
      )
    ) {
      return (
        'Supported formats: MP3, WAV, M4A, AAC, FLAC, OGG, OGA and OPUS.'
      );
    }

    if (file.size <= 0) {
      return 'The selected audio file is empty.';
    }

    return '';
  }

  function handleAudioSelect(
    event,
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const error =
      validateAudio(file);

    if (error) {
      setMessage({
        type: 'error',
        text: error,
      });

      event.target.value = '';
      return;
    }

    setAudioFile(file);
    setMessage(null);
  }

  function clearAudioSelection() {
    setAudioFile(null);

    if (audioInputRef.current) {
      audioInputRef.current.value =
        '';
    }

    setMessage(null);
  }

  async function replaceAudio() {
    if (
      !track?.id ||
      !audioFile
    ) {
      return;
    }

    const error =
      validateAudio(audioFile);

    if (error) {
      setMessage({
        type: 'error',
        text: error,
      });

      return;
    }

    setAudioSaving(true);
    setMessage(null);

    try {
      const body =
        new FormData();

      body.append(
        'audio',
        audioFile,
        audioFile.name,
      );

      const response =
        await fetch(
          `/api/admin/tracks/${track.id}/audio`,
          {
            method: 'POST',

            headers: {
              Authorization:
                `Bearer ${token}`,
            },

            body,
          },
        );

      if (
        response.status === 401
      ) {
        throw new Error(
          'Your session has expired.',
        );
      }

      if (
        response.status === 409
      ) {
        throw new Error(
          await getErrorMessage(
            response,
            'Another operation is already in progress for this track or the audio already exists.',
          ),
        );
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to replace audio file.',
          ),
        );
      }

      const result =
        await response.json();

      const updatedTrack =
        result.track ||
        result.result?.track;

      if (updatedTrack) {
        const updatedForm =
          toForm(updatedTrack);

        setForm(updatedForm);
        savedFormRef.current =
          updatedForm;

        onTracksChange?.(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                updatedTrack.id
                  ? {
                      ...item,
                      ...updatedTrack,
                    }
                  : item,
            ),
        );
      }

      clearAudioSelection();

      setMessage({
        type: 'success',
        text:
          'Audio replaced successfully.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          'Unable to replace audio file.',
      });
    } finally {
      setAudioSaving(false);
    }
  }

  function validateCover(file) {
    if (!file) {
      return 'Please choose an image.';
    }

    if (
      !IMAGE_TYPES.has(file.type)
    ) {
      return (
        'Only JPEG, PNG and WebP images are supported.'
      );
    }

    if (
      file.size > MAX_COVER_SIZE
    ) {
      return (
        'Cover image must be 10 MB or smaller.'
      );
    }

    return '';
  }

  function handleCoverSelect(
    event,
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const error =
      validateCover(file);

    if (error) {
      setMessage({
        type: 'error',
        text: error,
      });

      event.target.value = '';
      return;
    }

    clearCoverPreview();

    const url =
      URL.createObjectURL(file);

    objectUrlRef.current = url;

    setCoverFile(file);
    setCoverPreview(url);
    setMessage(null);
  }

  async function uploadCover() {
    if (
      !track?.id ||
      !coverFile
    ) {
      return;
    }

    const error =
      validateCover(coverFile);

    if (error) {
      setMessage({
        type: 'error',
        text: error,
      });

      return;
    }

    setCoverSaving(true);
    setMessage(null);

    try {
      const body =
        new FormData();

      body.append(
        'cover',
        coverFile,
        coverFile.name,
      );

      const response =
        await fetch(
          `/api/admin/tracks/${track.id}/cover`,
          {
            method: 'POST',

            headers: {
              Authorization:
                `Bearer ${token}`,
            },

            body,
          },
        );

      if (
        response.status === 401
      ) {
        throw new Error(
          'Your session has expired.',
        );
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to upload cover image.',
          ),
        );
      }

      const result =
        await response.json();

      const updatedTrack =
        result.track || {
          ...track,

          thumbnailUrl:
            `/api/tracks/${track.id}/cover`,
        };

      onTracksChange?.(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              updatedTrack.id
                ? {
                    ...item,
                    ...updatedTrack,
                  }
                : item,
          ),
      );

      clearCoverPreview();
      setCoverFile(null);

      setCoverVersion(
        Date.now(),
      );

      if (coverInputRef.current) {
        coverInputRef.current.value =
          '';
      }

      setMessage({
        type: 'success',
        text:
          'Cover image updated successfully.',
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
    if (!track?.id) {
      return;
    }

    setCoverSaving(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          `/api/admin/tracks/${track.id}/cover`,
          {
            method: 'DELETE',

            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          },
        );

      if (
        response.status === 401
      ) {
        throw new Error(
          'Your session has expired.',
        );
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to remove cover image.',
          ),
        );
      }

      const result =
        await response.json();

      const updatedTrack =
        result.track || {
          ...track,
          thumbnailUrl: null,
        };

      onTracksChange?.(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              updatedTrack.id
                ? {
                    ...item,
                    ...updatedTrack,
                  }
                : item,
          ),
      );

      setCoverVersion(
        Date.now(),
      );

      setMessage({
        type: 'success',
        text:
          'Cover image removed.',
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

  async function deleteSong() {
    if (
      !track?.id ||
      deleting
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${track.title || 'this song'}" permanently?\n\nThis will remove the audio, artwork, and database record.`,
      );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          `/api/admin/tracks/${track.id}`,
          {
            method: 'DELETE',

            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          },
        );

      if (
        response.status === 401
      ) {
        throw new Error(
          'Your session has expired.',
        );
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to delete song.',
          ),
        );
      }

      onTracksChange?.(
        (current) =>
          current.filter(
            (item) =>
              item.id !== track.id,
          ),
      );

      onBack?.();
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
    const reset =
      toForm(track);

    setForm(reset);

    savedFormRef.current =
      reset;

    clearCoverPreview();

    setCoverFile(null);
    setAudioFile(null);

    if (coverInputRef.current) {
      coverInputRef.current.value =
        '';
    }

    if (audioInputRef.current) {
      audioInputRef.current.value =
        '';
    }

    setConfirmDelete(false);
    setMessage(null);
  }

  const coverSrc =
    track?.thumbnailUrl
      ? `${
          track.thumbnailUrl.startsWith(
            '/api/',
          )
            ? track.thumbnailUrl
            : `/api/tracks/${track.id}/cover`
        }${
          track.thumbnailUrl?.includes(
            '?',
          )
            ? '&'
            : '?'
        }v=${coverVersion}`
      : '';

  return (
    <div className="edit-song-page">

      <div className="edit-song-header">

        <div className="edit-song-heading">

          <button
            type="button"
            className="back-button"
            onClick={onBack}
            disabled={
              saving ||
              audioSaving ||
              coverSaving ||
              deleting
            }
          >
            ←
            <span>
              All Songs
            </span>
          </button>

          <span className="section-kicker">
            Song Editor
          </span>

          <h2>
            {track?.title ||
              'Untitled'}
          </h2>

          <p>
            {track?.artist ||
              'Unknown Artist'}
          </p>
        </div>

        <div className="edit-song-actions">

          <button
            type="button"
            className="secondary-action"
            onClick={resetForm}
            disabled={
              saving ||
              audioSaving ||
              coverSaving ||
              deleting
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
              audioSaving ||
              coverSaving ||
              deleting ||
              loadingTrack
            }
          >
            {saving
              ? 'Saving...'
              : 'Save changes'}
          </button>

        </div>
      </div>

      {message ? (
        <div
          className={`edit-message ${message.type}`}
        >
          <span>
            {message.text}
          </span>

          <button
            type="button"
            onClick={() =>
              setMessage(null)
            }
            aria-label="Close message"
          >
            ×
          </button>
        </div>
      ) : null}

      {loadingTrack ? (
        <div className="edit-loading">
          Loading song details...
        </div>
      ) : null}

      <div className="edit-song-grid">

        <form
          id="song-metadata-form"
          className="editor-card metadata-card"
          onSubmit={saveMetadata}
        >

          <div className="card-heading">
            <span className="section-kicker">
              Metadata
            </span>

            <h3>
              Song Information
            </h3>
          </div>

          <div className="form-grid">

            <label className="field field-wide">
              <span>
                Title *
              </span>

              <input
                name="title"
                value={form.title}
                onChange={updateField}
                required
                maxLength={200}
              />
            </label>

            <label className="field">
              <span>
                Artist *
              </span>

              <input
                name="artist"
                value={form.artist}
                onChange={updateField}
                required
                maxLength={200}
              />
            </label>

            <label className="field">
              <span>
                Album
              </span>

              <input
                name="album"
                value={form.album}
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Album Artist
              </span>

              <input
                name="albumArtist"
                value={
                  form.albumArtist
                }
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Movie / Soundtrack
              </span>

              <input
                name="movie"
                value={form.movie}
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Language
              </span>

              <input
                name="language"
                value={
                  form.language
                }
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Release Year
              </span>

              <input
                name="releaseYear"
                type="number"
                value={
                  form.releaseYear
                }
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Release Date
              </span>

              <input
                name="releaseDate"
                type="date"
                value={
                  form.releaseDate
                }
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Composer
              </span>

              <input
                name="composer"
                value={
                  form.composer
                }
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Publisher
              </span>

              <input
                name="publisher"
                value={
                  form.publisher
                }
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Track Number
              </span>

              <input
                name="trackNumber"
                type="number"
                min="1"
                value={
                  form.trackNumber
                }
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Disc Number
              </span>

              <input
                name="discNumber"
                type="number"
                min="1"
                value={
                  form.discNumber
                }
                onChange={updateField}
              />
            </label>

            <label className="field">
              <span>
                Duration
              </span>

              <input
                value={formatDuration(
                  form.duration,
                )}
                readOnly
              />
            </label>

            <label className="field field-wide">
              <span>
                Copyright
              </span>

              <input
                name="copyright"
                value={
                  form.copyright
                }
                onChange={updateField}
              />
            </label>

            <label className="field field-wide">
              <span>
                Genres
              </span>

              <input
                name="genres"
                value={form.genres}
                onChange={updateField}
                placeholder="Rock, Pop, Bollywood"
              />
            </label>

            <label className="field field-wide">
              <span>
                Tags
              </span>

              <input
                name="tags"
                value={form.tags}
                onChange={updateField}
                placeholder="Hindi, Romantic, 2026"
              />
            </label>

            <label className="field field-wide">
              <span>
                Description
              </span>

              <textarea
                name="description"
                value={
                  form.description
                }
                onChange={updateField}
              />
            </label>

            <label className="explicit-field field-wide">
              <input
                name="explicit"
                type="checkbox"
                checked={
                  form.explicit
                }
                onChange={updateField}
              />

              <span>
                <strong>
                  Explicit content
                </strong>

                <small>
                  Mark this song as
                  explicit.
                </small>
              </span>
            </label>

          </div>
        </form>

        <div className="editor-side">

          <section className="editor-card audio-card">

            <div className="card-heading">
              <span className="section-kicker">
                Audio
              </span>

              <h3>
                Replace Audio
              </h3>
            </div>

            <div className="audio-manager">

              <div className="audio-details">

                <strong>
                  {audioFile
                    ? audioFile.name
                    : 'Current audio file'}
                </strong>

                <span>
                  {audioFile
                    ? formatBytes(
                        audioFile.size,
                      )
                    : 'Choose a new audio file to replace the current track.'}
                </span>

              </div>

              <div className="audio-actions">

                <button
                  type="button"
                  className="secondary-action"
                  onClick={() =>
                    audioInputRef.current?.click()
                  }
                  disabled={
                    audioSaving ||
                    saving ||
                    coverSaving ||
                    deleting
                  }
                >
                  {audioFile
                    ? 'Choose another'
                    : 'Choose audio'}
                </button>

                {audioFile ? (
                  <>
                    <button
                      type="button"
                      className="primary-action"
                      onClick={
                        replaceAudio
                      }
                      disabled={
                        audioSaving ||
                        saving ||
                        coverSaving ||
                        deleting
                      }
                    >
                      {audioSaving
                        ? 'Replacing...'
                        : 'Replace audio'}
                    </button>

                    <button
                      type="button"
                      className="secondary-action"
                      onClick={
                        clearAudioSelection
                      }
                      disabled={
                        audioSaving
                      }
                    >
                      Cancel
                    </button>
                  </>
                ) : null}

              </div>

              <input
                ref={
                  audioInputRef
                }
                className="visually-hidden"
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus"
                onChange={
                  handleAudioSelect
                }
              />

            </div>
          </section>

          <section className="editor-card artwork-card">

            <div className="card-heading">

              <div>
                <span className="section-kicker">
                  Artwork
                </span>

                <h3>
                  Cover Image
                </h3>
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
                    : track?.thumbnailUrl
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
                      audioSaving ||
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
                      onClick={
                        uploadCover
                      }
                      disabled={
                        coverSaving ||
                        saving ||
                        audioSaving ||
                        deleting
                      }
                    >
                      {coverSaving
                        ? 'Uploading...'
                        : 'Upload cover'}
                    </button>
                  ) : track?.thumbnailUrl ? (
                    <button
                      type="button"
                      className="danger-action"
                      onClick={
                        deleteCover
                      }
                      disabled={
                        coverSaving ||
                        saving ||
                        audioSaving ||
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
                  ref={
                    coverInputRef
                  }
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
      </div>

      <section className="danger-zone">

        <div>
          <span className="section-kicker">
            Danger Zone
          </span>

          <h3>
            Delete this song
          </h3>

          <p>
            Permanently removes the track,
            audio file, artwork, and database
            record.
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
              audioSaving ||
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
              onClick={deleteSong}
              disabled={deleting}
            >
              {deleting
                ? 'Deleting...'
                : 'Yes, delete'}
            </button>

          </div>
        )}

      </section>
    </div>
  );
}

export default EditSong;