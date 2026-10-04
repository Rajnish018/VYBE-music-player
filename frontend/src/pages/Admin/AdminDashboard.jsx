import { useRef } from 'react';
import Icon from '../../components/Icons';
import './AdminDashboard.css';
import PageHeader from '../../components/PageHeader';

function AdminDashboard({
  form,
  state,
  fileName,
  uploading,
  onChange,
  onFileChange,
  onSubmit,
  tracks,
}) {
  const coverInputRef = useRef(null);

  const COVER_TYPES = [
    'Cover (front)',
    'Cover (back)',
    'Cover (inside)',
    'Media (e.g. label side of CD)',
    'Lead artist',
    'Artist',
    'Conductor',
    'Band / Orchestra',
    'Composer',
    'Lyricist',
    'Recording Location',
    'During recording',
    'During performance',
    'Movie / Video screen capture',
    'Illustration',
    'Band / Artist logotype',
    'Publisher / Studio logotype',
  ];

  const artworkSize = Number(form.artworkSize) || 0;
  const artworkSizeKb =
    artworkSize > 0 ? (artworkSize / 1024).toFixed(2) : '0.00';

  const artworkType = form.artworkType || 'Cover (front)';
  const artworkFormat = form.artworkMimeType || 'image/jpeg';

  const cannotUpload =
    uploading ||
    !form.title ||
    !form.artist ||
    !form.duration ||
    !form.hasArtwork;

  function updateField(field, value) {
    onChange({
      ...form,
      [field]: value,
    });
  }

  function handleCoverChange(event) {
    const imageFile = event.target.files?.[0];

    if (!imageFile) return;

    if (!imageFile.type.startsWith('image/')) {
      event.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    const image = new Image();

    image.onload = () => {
      // Revoke the previous temporary preview if it was ours.
      if (
        form.thumbnailUrl &&
        form.thumbnailUrl.startsWith('blob:')
      ) {
        URL.revokeObjectURL(form.thumbnailUrl);
      }

      onChange({
        ...form,
        thumbnailUrl: objectUrl,
        hasArtwork: true,
        artworkMimeType: imageFile.type,
        artworkSize: imageFile.size,
        artworkType:
          'Cover (front)',
        artworkFile: imageFile,
        artworkWidth: image.naturalWidth,
        artworkHeight: image.naturalHeight,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      event.target.value = '';
    };

    image.src = objectUrl;
  }

  function removeAudio() {
    if (uploading) {
      return;
    }

    onFileChange(null);
  }

  function removeCover() {
    if (form.thumbnailUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(form.thumbnailUrl);
    }

    onChange({
      ...form,
      thumbnailUrl: '',
      hasArtwork: false,
      artworkMimeType: '',
      artworkSize: 0,
      artworkType: '',
      artworkFile: null,
      artworkWidth: 0,
      artworkHeight: 0,
    });

    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }
  }

  return (
    <section className="admin-page admin-dashboard-modern">

      <PageHeader
        eyebrow="Administrator"
        title="Admin dashboard"
        description="Upload and manage the audio available in your MEGA-backed library."
      />

      <form className="admin-upload" onSubmit={onSubmit}>
        {/* AUDIO FILE */}
        <div className="upload-dropzone-wrap">
          <label className="upload-dropzone upload-card" htmlFor="admin-audio">
            <input
              id="admin-audio"
              required
              type="file"
              accept="audio/*"
              disabled={uploading}
              onChange={(event) =>
                onFileChange(event.target.files?.[0] || null)
              }
            />

            <span className="upload-file-icon" aria-hidden="true">♫</span>

            <span className="upload-file-copy">
              <span className="upload-select-button">
                {fileName ? 'Change audio file' : 'Choose audio file'}
              </span>
              <strong
                className={`upload-file-name${fileName ? '' : ' empty'}`}
              >
                {fileName || 'No audio file selected'}
              </strong>
              <small>MP3, WAV, FLAC, M4A and other supported formats</small>
            </span>

            <span className="upload-file-arrow" aria-hidden="true">→</span>
          </label>

          {fileName ? (
            <button
              type="button"
              className="audio-remove-button"
              disabled={uploading}
              onClick={removeAudio}
              aria-label="Remove selected audio"
              title="Remove selected audio"
            >
              ×
            </button>
          ) : null}
        </div>

        {fileName ? (
          <>
            {/* METADATA */}
            <section className="panel-card">
              <div className="panel-heading">
                <div>
                  <h2>Track information</h2>
                  <p>Review the metadata detected from the audio file.</p>
                </div>

                <span
                  className={
                    form.title && form.artist && form.duration
                      ? 'status-pill ready'
                      : 'status-pill'
                  }
                >
                  {form.title && form.artist && form.duration
                    ? 'Ready'
                    : 'Reading'}
                </span>
              </div>

              <div className="metadata-grid">
                <div className="field full">
                  <label htmlFor="admin-title">Track title</label>
                  <input
                    id="admin-title"
                    type="text"
                    disabled={uploading}
                    value={form.title || ''}
                    onChange={(event) =>
                      updateField('title', event.target.value)
                    }
                    placeholder="Track title"
                  />
                </div>

                <div className="field">
                  <label htmlFor="admin-artist">Artist</label>
                  <input
                    id="admin-artist"
                    type="text"
                    disabled={uploading}
                    value={form.artist || ''}
                    onChange={(event) =>
                      updateField('artist', event.target.value)
                    }
                    placeholder="Artist name"
                  />
                </div>

                <div className="field">
                  <label htmlFor="admin-album">Album</label>
                  <input
                    id="admin-album"
                    type="text"
                    disabled={uploading}
                    value={form.album || ''}
                    onChange={(event) =>
                      updateField('album', event.target.value)
                    }
                    placeholder="Album"
                  />
                </div>

                <div className="field">
                  <label htmlFor="admin-genre">Genre</label>
                  <input
                    id="admin-genre"
                    type="text"
                    disabled={uploading}
                    value={form.genre || ''}
                    onChange={(event) =>
                      updateField('genre', event.target.value)
                    }
                    placeholder="Genre"
                  />
                </div>

                <div className="field">
                  <label htmlFor="admin-year">Year</label>
                  <input
                    id="admin-year"
                    type="number"
                    min="1900"
                    max="2100"
                    disabled={uploading}
                    value={form.year || ''}
                    onChange={(event) =>
                      updateField('year', event.target.value)
                    }
                    placeholder="Year"
                  />
                </div>

                <div className="field">
                  <label htmlFor="admin-duration">Duration</label>
                  <input
                    id="admin-duration"
                    type="text"
                    inputMode="numeric"
                    disabled={uploading}
                    value={form.duration || ''}
                    onChange={(event) =>
                      updateField(
                        'duration',
                        event.target.value,
                      )
                    }
                    placeholder="0:00"
                    readOnly
                  />
                </div>
              </div>
            </section>

            {/* COVER */}
            <section
              className={`panel-card ${!form.hasArtwork ? 'cover-required' : ''
                }`}
            >
              <div className="panel-heading">
                <div>
                  <h2>Cover artwork</h2>
                  <p>
                    Use the embedded artwork or select a custom cover
                    image.
                  </p>
                </div>

                <span
                  className={
                    form.hasArtwork
                      ? 'status-pill ready'
                      : 'status-pill'
                  }
                >
                  {form.hasArtwork ? 'Cover ready' : 'Cover required'}
                </span>
              </div>

              {!form.hasArtwork ? (
                <div className="required-note">
                  <span>●</span>
                  This track has no embedded cover. Select an image to
                  continue.
                </div>
              ) : null}

              <div className="artwork-layout">
                <div className="artwork-preview">
                  {form.thumbnailUrl ? (
                    <img
                      src={form.thumbnailUrl}
                      alt={
                        form.album
                          ? `${form.album} cover`
                          : 'Album artwork'
                      }
                    />
                  ) : (
                    <div className="artwork-placeholder">
                      <Icon name="image" />
                    </div>
                  )}
                </div>

                <div className="artwork-copy">
                  <h3>
                    {form.hasArtwork
                      ? form.artworkFile
                        ? 'Custom cover selected'
                        : 'Embedded cover detected'
                      : 'No cover selected'}
                  </h3>

                  <p>
                    {form.hasArtwork
                      ? form.artworkFile
                        ? 'This image will be uploaded with the audio file and will replace any embedded artwork.'
                        : 'This image was detected inside the audio file and will be used as the track cover.'
                      : 'Choose a JPG, PNG, WEBP or GIF image. The selected image will be uploaded together with the audio file.'}
                  </p>

                  {form.hasArtwork ? (
                    <div className="artwork-meta">
                      <span>{artworkType}</span>
                      <span>{artworkFormat}</span>
                      <span>{artworkSizeKb} KB</span>
                      {form.artworkWidth && form.artworkHeight ? (
                        <span>
                          {form.artworkWidth} × {form.artworkHeight}
                        </span>
                      ) : null}
                      <span className="success">
                        ✓ {form.artworkFile ? 'Custom cover' : 'Embedded cover'}
                      </span>
                    </div>
                  ) : null}

                  {form.hasArtwork ? (
                    <div className="cover-type-field">
                      <label htmlFor="admin-cover-type">
                        Artwork type
                      </label>

                      <select
                        id="admin-cover-type"
                        value={
                          form.artworkType ||
                          'Cover (front)'
                        }
                        disabled={uploading}
                        onChange={(event) =>
                          updateField(
                            'artworkType',
                            event.target.value,
                          )
                        }
                      >
                        {COVER_TYPES.map((type) => (
                          <option
                            key={type}
                            value={type}
                          >
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="cover-actions">
                    <button
                      className="button primary"
                      type="button"
                      disabled={uploading}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      {form.hasArtwork
                        ? 'Replace cover'
                        : 'Choose cover image'}
                    </button>

                    {form.hasArtwork ? (
                      <button
                        className="button danger"
                        type="button"
                        disabled={uploading}
                        onClick={removeCover}
                      >
                        Remove cover
                      </button>
                    ) : null}
                  </div>

                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={uploading}
                    onChange={handleCoverChange}
                    hidden
                  />
                </div>
              </div>
            </section>

            {/* SUBMIT */}
            <div className="upload-footer">
              <div className="upload-state" aria-live="polite">
                {state ? (
                  <strong>{state}</strong>
                ) : form.hasArtwork ? (
                  <>
                    Audio and cover are ready to upload.
                  </>
                ) : (
                  <>
                    Select a cover image before uploading this track.
                  </>
                )}
              </div>

              <button
                className="upload-submit"
                type="submit"
                disabled={cannotUpload}
              >
                {uploading ? 'Uploading...' : 'Upload to MEGA'}
              </button>
            </div>
          </>
        ) : null}
      </form>

      <div className="admin-library">
        <h2>Playable library</h2>
        <p>
          {tracks.length} tracks currently available to users.
        </p>
      </div>
    </section>
  );
}

export default AdminDashboard;
