import { useRef } from 'react';
import Icon from '../../components/Icons';

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
        artworkType: 'Cover (front)',
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
      <style>{`
        .admin-dashboard-modern {
          width: 100%;
          max-width: none;
          margin: 0;
          padding: 34px 38px 110px;
          box-sizing: border-box;
        }

        .admin-dashboard-modern *,
        .admin-dashboard-modern *::before,
        .admin-dashboard-modern *::after {
          box-sizing: border-box;
        }

        .admin-dashboard-modern .page-heading {
          margin: 0 0 28px;
        }

        .admin-dashboard-modern .eyebrow {
          margin: 0 0 7px;
          color: #e7b94e;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .admin-dashboard-modern .page-heading h1 {
          margin: 0;
          color: #f4f0e8;
          font-size: clamp(38px, 5vw, 58px);
          line-height: .98;
          letter-spacing: -.045em;
        }

        .admin-dashboard-modern .page-heading p:last-child {
          max-width: 650px;
          margin: 12px 0 0;
          color: #969795;
          font-size: 14px;
          line-height: 1.6;
        }

        .admin-dashboard-modern .admin-upload {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .admin-dashboard-modern .upload-card,
        .admin-dashboard-modern .panel-card {
          border: 1px solid #303230;
          border-radius: 12px;
          background: #181a19;
          box-shadow: 0 10px 30px rgba(0,0,0,.16);
        }

        .admin-dashboard-modern .upload-dropzone {
          position: relative;
          display: flex;
          align-items: center;
          gap: 18px;
          min-height: 108px;
          width: 100%;
          padding: 20px 22px;
          border: 1px dashed #454843;
          border-radius: 12px;
          outline: none;
          color: #e9e6de;
          background: #181a19;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
          cursor: pointer;
          transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
          text-align: left;
          text-decoration: none;
        }

        .admin-dashboard-modern .upload-dropzone:focus-within {
          border-color: #e7b94e;
          box-shadow: 0 0 0 3px rgba(231,185,78,.08);
        }

        .admin-dashboard-modern .upload-dropzone:hover {
          border-color: #e7b94e;
          background: #20221f;
        }

        .admin-dashboard-modern .upload-dropzone input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }

        .admin-dashboard-modern .upload-file-icon {
          display: grid;
          place-items: center;
          flex: 0 0 50px;
          width: 50px;
          height: 50px;
          border: 1px solid rgba(231,185,78,.38);
          border-radius: 10px;
          background: rgba(231,185,78,.12);
          color: #e7b94e;
          font-size: 22px;
          font-weight: 900;
        }

        .admin-dashboard-modern .upload-file-copy {
          min-width: 0;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 5px;
        }

        .admin-dashboard-modern .upload-select-button {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 0 11px;
          border: 1px solid rgba(231,185,78,.42);
          border-radius: 7px;
          color: #e7b94e;
          background: rgba(231,185,78,.08);
          font-size: 11px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
        }

        .admin-dashboard-modern .upload-file-name {
          display: block;
          width: 100%;
          overflow: hidden;
          color: #f1eee7;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.3;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-dashboard-modern .upload-file-name.empty {
          color: #a2a49f;
          font-weight: 600;
        }

        .admin-dashboard-modern .upload-file-copy small {
          display: block;
          color: #6f726e;
          font-size: 11px;
          line-height: 1.35;
        }

        .admin-dashboard-modern .upload-file-arrow {
          flex: 0 0 auto;
          color: #777a75;
          font-size: 18px;
          transition: color .18s ease, transform .18s ease;
        }

        .admin-dashboard-modern .upload-dropzone:hover .upload-file-arrow {
          color: #e7b94e;
          transform: translateX(2px);
        }

        .admin-dashboard-modern .panel-card {
          padding: 22px;
        }

        .admin-dashboard-modern .panel-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        .admin-dashboard-modern .panel-heading h2 {
          margin: 0;
          color: #eeeae1;
          font-size: 16px;
          font-weight: 800;
        }

        .admin-dashboard-modern .panel-heading p {
          margin: 5px 0 0;
          color: #777a77;
          font-size: 12px;
          line-height: 1.5;
        }

        .admin-dashboard-modern .status-pill {
          flex: 0 0 auto;
          padding: 6px 10px;
          border: 1px solid #3b3e3a;
          border-radius: 999px;
          color: #a7aaa4;
          background: #20221f;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .admin-dashboard-modern .status-pill.ready {
          border-color: rgba(91, 214, 151, .3);
          color: #65d99a;
          background: rgba(91, 214, 151, .08);
        }

        .admin-dashboard-modern .metadata-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .admin-dashboard-modern .field {
          min-width: 0;
        }

        .admin-dashboard-modern .field.full {
          grid-column: 1 / -1;
        }

        .admin-dashboard-modern .field label {
          display: block;
          margin: 0 0 7px;
          color: #9b9d98;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .admin-dashboard-modern .field input {
          width: 100%;
          height: 44px;
          padding: 0 13px;
          border: 1px solid #353735;
          border-radius: 8px;
          outline: none;
          color: #eeeae2;
          background: #111312;
          font: inherit;
          font-size: 13px;
          transition: border-color .18s ease, box-shadow .18s ease;
        }

        .admin-dashboard-modern .field input:focus {
          border-color: #c99d3d;
          box-shadow: 0 0 0 3px rgba(231,185,78,.09);
        }

        .admin-dashboard-modern .field input:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .admin-dashboard-modern .artwork-layout {
          display: grid;
          grid-template-columns: 150px minmax(0, 1fr);
          gap: 22px;
          align-items: center;
        }

        .admin-dashboard-modern .artwork-preview {
          position: relative;
          width: 150px;
          aspect-ratio: 1;
          overflow: hidden;
          border: 1px solid #373a36;
          border-radius: 10px;
          background: #101210;
        }

        .admin-dashboard-modern .artwork-preview img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .admin-dashboard-modern .artwork-placeholder {
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          color: #5e625d;
        }

        .admin-dashboard-modern .artwork-placeholder svg {
          width: 38px;
          height: 38px;
        }

        .admin-dashboard-modern .artwork-copy {
          min-width: 0;
        }

        .admin-dashboard-modern .artwork-copy h3 {
          margin: 0 0 6px;
          color: #eeeae2;
          font-size: 15px;
          font-weight: 800;
        }

        .admin-dashboard-modern .artwork-copy p {
          max-width: 600px;
          margin: 0 0 14px;
          color: #777a77;
          font-size: 12px;
          line-height: 1.55;
        }

        .admin-dashboard-modern .artwork-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 15px;
        }

        .admin-dashboard-modern .artwork-meta span {
          padding: 5px 8px;
          border: 1px solid #343733;
          border-radius: 6px;
          color: #92958f;
          background: #121412;
          font-size: 10px;
        }

        .admin-dashboard-modern .artwork-meta .success {
          border-color: rgba(91,214,151,.25);
          color: #65d99a;
        }

        .admin-dashboard-modern .cover-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }

        .admin-dashboard-modern .button {
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid #3a3d38;
          border-radius: 7px;
          color: #dedbd3;
          background: #242724;
          font: inherit;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: transform .12s ease, background .18s ease, border-color .18s ease;
        }

        .admin-dashboard-modern .button:hover:not(:disabled) {
          border-color: #777a70;
          background: #2c302b;
          transform: translateY(-1px);
        }

        .admin-dashboard-modern .button.primary {
          border-color: #e7b94e;
          color: #171815;
          background: #e7b94e;
        }

        .admin-dashboard-modern .button.primary:hover:not(:disabled) {
          border-color: #f0c862;
          background: #f0c862;
        }

        .admin-dashboard-modern .button.danger {
          color: #d2a1a1;
        }

        .admin-dashboard-modern .button:disabled {
          opacity: .45;
          cursor: not-allowed;
          transform: none;
        }

        .admin-dashboard-modern .cover-required {
          border-color: rgba(231,185,78,.38);
          background: linear-gradient(135deg, rgba(231,185,78,.07), #181a19);
        }

        .admin-dashboard-modern .cover-required .artwork-preview {
          border-color: rgba(231,185,78,.3);
        }

        .admin-dashboard-modern .required-note {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 12px;
          color: #e7b94e;
          font-size: 11px;
          font-weight: 800;
        }

        .admin-dashboard-modern .upload-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-top: 2px;
        }

        .admin-dashboard-modern .upload-state {
          min-width: 0;
          color: #858882;
          font-size: 12px;
          line-height: 1.45;
        }

        .admin-dashboard-modern .upload-state strong {
          color: #d9d6ce;
        }

        .admin-dashboard-modern .upload-submit {
          min-width: 190px;
          height: 46px;
          padding: 0 22px;
          border: 0;
          border-radius: 8px;
          color: #171815;
          background: #e7b94e;
          font: inherit;
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
          transition: transform .12s ease, filter .18s ease, opacity .18s ease;
        }

        .admin-dashboard-modern .upload-submit:hover:not(:disabled) {
          filter: brightness(1.06);
          transform: translateY(-1px);
        }

        .admin-dashboard-modern .upload-submit:disabled {
          opacity: .42;
          cursor: not-allowed;
          transform: none;
        }

        .admin-dashboard-modern .admin-library {
          margin-top: 28px;
          padding: 20px 22px;
          border-top: 1px solid #2b2e2b;
        }

        .admin-dashboard-modern .admin-library h2 {
          margin: 0;
          color: #dcd9d1;
          font-size: 14px;
        }

        .admin-dashboard-modern .admin-library p {
          margin: 5px 0 0;
          color: #71746f;
          font-size: 12px;
        }

        @media (max-width: 760px) {
          .admin-dashboard-modern {
            padding: 24px 18px 100px;
          }

          .admin-dashboard-modern .upload-dropzone {
            min-height: 96px;
            padding: 16px;
          }

          .admin-dashboard-modern .metadata-grid {
            grid-template-columns: 1fr;
          }

          .admin-dashboard-modern .field.full {
            grid-column: auto;
          }

          .admin-dashboard-modern .artwork-layout {
            grid-template-columns: 110px minmax(0, 1fr);
            gap: 16px;
          }

          .admin-dashboard-modern .artwork-preview {
            width: 110px;
          }

          .admin-dashboard-modern .upload-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .admin-dashboard-modern .upload-submit {
            width: 100%;
          }
        }

        @media (max-width: 500px) {
          .admin-dashboard-modern .artwork-layout {
            grid-template-columns: 1fr;
          }

          .admin-dashboard-modern .artwork-preview {
            width: 130px;
          }

          .admin-dashboard-modern .panel-card {
            padding: 17px;
          }
        }
      `}</style>

      <header className="page-heading">
        <p className="eyebrow">Administrator</p>
        <h1>Admin dashboard</h1>
        <p>
          Upload and manage the audio available in your MEGA-backed
          library.
        </p>
      </header>

      <form className="admin-upload" onSubmit={onSubmit}>
        {/* AUDIO FILE */}
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
                    type="number"
                    min="1"
                    disabled={uploading}
                    value={form.duration || ''}
                    onChange={(event) =>
                      updateField('duration', event.target.value)
                    }
                    placeholder="Seconds"
                  />
                </div>
              </div>
            </section>

            {/* COVER */}
            <section
              className={`panel-card ${
                !form.hasArtwork ? 'cover-required' : ''
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
