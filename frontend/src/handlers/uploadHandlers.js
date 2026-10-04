import { adminApi } from '../api';

import {
  emptyTrackMetadata,
  inferTrackMetadata,
  readEmbeddedMetadata,
} from '../utils/metadata';

/**
 * ============================================================
 * DURATION
 * ============================================================
 *
 * Frontend:
 *   "3:33"
 *
 * Backend:
 *   213
 *
 * Keep the UI value as M:SS.
 * Convert to seconds ONLY when creating FormData.
 */

function durationToSeconds(value) {
  if (!value) {
    return 0;
  }

  const text = String(value).trim();

  const parts = text.split(':');

  if (parts.length !== 2) {
    return 0;
  }

  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);

  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds >= 60
  ) {
    return 0;
  }

  return minutes * 60 + seconds;
}

/**
 * ============================================================
 * HANDLE AUDIO FILE SELECTION
 * ============================================================
 */

export async function handleAdminFileChange({
  file,
  setUploadFile,
  setUploadForm,
  setUploadState,
}) {
  /*
   * Store selected file.
   */
  setUploadFile(file);

  /*
   * No file selected.
   */
  if (!file) {
    setUploadForm({
      ...emptyTrackMetadata,
    });

    setUploadState('');

    return;
  }

  /*
   * Clear old metadata immediately.
   */
  setUploadForm({
    ...emptyTrackMetadata,
  });

  setUploadState(
    'Reading embedded audio metadata...',
  );

  /*
   * Filename metadata is ONLY the fallback.
   *
   * Embedded metadata is handled by metadata.js.
   */
  const fallbackMetadata =
    inferTrackMetadata(file);

  try {
    /*
     * IMPORTANT:
     *
     * Do not parse the audio here.
     *
     * metadata.js is the single source of truth
     * for metadata extraction and cleaning.
     */
    const metadata =
      await readEmbeddedMetadata(file);

    /*
     * Embedded metadata gets priority.
     */
    setUploadForm({
      ...fallbackMetadata,

      title:
        metadata.title ||
        fallbackMetadata.title,

      artist:
        metadata.artist ||
        fallbackMetadata.artist,

      album:
        metadata.album ||
        fallbackMetadata.album ||
        'Single',

      genre:
        metadata.genre || '',

      year:
        metadata.year || '',

      /*
       * IMPORTANT:
       *
       * metadata.duration should already be:
       *
       * "3:33"
       *
       * Do NOT convert it here.
       */
      duration:
        metadata.duration ||
        fallbackMetadata.duration,

      thumbnailUrl:
        metadata.thumbnailUrl || '',

      hasArtwork:
        Boolean(metadata.hasArtwork),

      artworkMimeType:
        metadata.artworkMimeType || '',

      artworkSize:
        metadata.artworkSize || 0,

      artworkType:
        metadata.artworkType || '',

      artworkFile:
        null,

      artworkWidth:
        metadata.artworkWidth || 0,

      artworkHeight:
        metadata.artworkHeight || 0,
    });

    /*
     * Status message.
     */
    if (metadata.hasArtwork) {
      const sizeKB =
        Number(metadata.artworkSize || 0) /
        1024;

      setUploadState(
        `Metadata detected • Embedded cover art found (${sizeKB.toFixed(
          2,
        )} KB). Ready to upload.`,
      );
    } else {
      setUploadState(
        'Metadata detected • No embedded cover art found. Ready to upload.',
      );
    }
  } catch (error) {
    console.error(
      '[ADMIN METADATA] FAILED:',
      error,
    );

    /*
     * Parser failed.
     *
     * Use filename metadata.
     */
    setUploadForm(
      fallbackMetadata,
    );

    setUploadState(
      'Could not read embedded metadata. Using filename information.',
    );

    /*
     * Browser duration fallback.
     */
    const audio = new Audio();

    const objectUrl =
      URL.createObjectURL(file);

    audio.preload = 'metadata';
    audio.src = objectUrl;

    audio.onloadedmetadata = () => {
      const totalSeconds = Math.max(
        1,
        Math.round(audio.duration || 0),
      );

      const minutes =
        Math.floor(totalSeconds / 60);

      const seconds =
        totalSeconds % 60;

      /*
       * Keep frontend format as M:SS.
       */
      const formatted =
        `${minutes}:${String(seconds).padStart(
          2,
          '0',
        )}`;

      URL.revokeObjectURL(objectUrl);

      setUploadForm((current) => ({
        ...current,
        duration: formatted,
      }));

      setUploadState(
        'Metadata detected. Ready to upload.',
      );
    };

    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      setUploadState(
        'Could not read audio metadata. Try another audio file.',
      );
    };

    audio.load();
  }
}

/**
 * ============================================================
 * UPLOAD TRACK
 * ============================================================
 */

export async function uploadTrack({
  event,
  token,
  uploadFile,
  uploadForm,
  uploading,
  setUploading,
  setUploadState,
  setUploadForm,
  setUploadFile,
  refreshLibrary,
  onTrackUploaded,
  logout,
}) {
  event.preventDefault();

  /*
   * Prevent double submission.
   */
  if (uploading) {
    return;
  }

  const formElement =
    event.currentTarget;

  /*
   * ==========================================================
   * BASIC VALIDATION
   * ==========================================================
   */

  if (!token || !uploadFile) {
    setUploadState(
      'Choose an audio file to upload.',
    );

    return;
  }

  if (
    !uploadForm.title ||
    !uploadForm.artist ||
    !uploadForm.duration
  ) {
    setUploadState(
      'Still reading song details. Try again in a moment.',
    );

    return;
  }

  /*
   * ==========================================================
   * CONVERT FRONTEND DURATION
   * ==========================================================
   *
   * Frontend:
   *
   *   "3:33"
   *
   * Backend:
   *
   *   213
   */

  const durationSeconds =
    durationToSeconds(
      uploadForm.duration,
    );

  if (!durationSeconds) {
    setUploadState(
      'Invalid duration. Please wait for the audio metadata to finish reading.',
    );

    return;
  }

  /*
   * ==========================================================
   * START UPLOAD
   * ==========================================================
   */

  setUploading(true);

  setUploadState(
    'Uploading to MEGA...',
  );

  /*
   * IMPORTANT:
   *
   * FormData MUST be created BEFORE formData.append().
   */
  const formData =
    new FormData();

  /*
   * ==========================================================
   * PREVIEW-ONLY FIELDS
   * ==========================================================
   */

  const previewOnlyFields =
    new Set([
      'thumbnailUrl',
      'hasArtwork',
      'artworkMimeType',
      'artworkSize',
      'artworkType',
      'artworkFile',
      'artworkWidth',
      'artworkHeight',
    ]);

  /*
   * ==========================================================
   * ADD METADATA
   * ==========================================================
   */

  Object.entries(uploadForm).forEach(
    ([key, value]) => {
      /*
       * Ignore frontend-only artwork fields.
       */
      if (
        previewOnlyFields.has(key)
      ) {
        return;
      }

      /*
       * Duration is the special case.
       *
       * Frontend:
       *   "3:33"
       *
       * Backend:
       *   "213"
       */
      if (key === 'duration') {
        formData.append(
          'duration',
          String(durationSeconds),
        );

        return;
      }

      /*
       * Ignore empty values.
       */
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
      ) {
        formData.append(
          key,
          String(value),
        );
      }
    },
  );

  /*
   * ==========================================================
   * AUDIO
   * ==========================================================
   */

  formData.append(
    'audio',
    uploadFile,
  );

  /*
   * ==========================================================
   * CUSTOM COVER
   * ==========================================================
   *
   * If user selected a custom cover,
   * send it as "cover".
   *
   * Otherwise backend uses embedded artwork.
   */

  if (
    uploadForm.artworkFile instanceof File
  ) {
    formData.append(
      'cover',
      uploadForm.artworkFile,
    );

    console.log(
      '[UPLOAD] Custom cover attached:',
      {
        name:
          uploadForm.artworkFile.name,

        type:
          uploadForm.artworkFile.type,

        size:
          uploadForm.artworkFile.size,
      },
    );
  }

  /*
   * ==========================================================
   * DEBUG
   * ==========================================================
   */

  console.log(
    '[UPLOAD] Final metadata being sent:',
    {
      title:
        uploadForm.title,

      artist:
        uploadForm.artist,

      album:
        uploadForm.album,

      genre:
        uploadForm.genre,

      year:
        uploadForm.year,

      /*
       * What user sees.
       */
      durationDisplay:
        uploadForm.duration,

      /*
       * What backend receives.
       */
      durationSeconds,

      hasEmbeddedArtwork:
        uploadForm.hasArtwork,

      hasCustomArtwork:
        Boolean(
          uploadForm.artworkFile,
        ),
    },
  );

  /*
   * ==========================================================
   * SEND TO BACKEND
   * ==========================================================
   */

  try {
    const result =
      await adminApi.uploadTrack(
        formData,
        token,
      );

    /*
     * Add returned track immediately.
     */
    if (result?.track) {
      onTrackUploaded?.(
        result.track,
      );
    } else {
      await refreshLibrary();
    }

    /*
     * Reset form.
     */
    setUploadForm({
      ...emptyTrackMetadata,
    });

    setUploadFile(null);

    formElement?.reset();

    setUploadState(
      'Uploaded and ready to play.',
    );
  } catch (error) {
    /*
     * ========================================================
     * AUTHENTICATION
     * ========================================================
     */

    if (error?.status === 401) {
      logout();
      return;
    }

    /*
     * ========================================================
     * DUPLICATE TRACK
     * ========================================================
     */

    if (
      error?.status === 409 &&
      error?.code ===
        'DUPLICATE_TRACK'
    ) {
      setUploadState(
        'This song is already in your library.',
      );

      return;
    }

    /*
     * ========================================================
     * OPERATION IN PROGRESS
     * ========================================================
     */

    if (
      error?.status === 409 &&
      error?.code ===
        'TRACK_OPERATION_IN_PROGRESS'
    ) {
      setUploadState(
        'Another operation is already in progress for this track.',
      );

      return;
    }

    /*
     * ========================================================
     * BAD REQUEST
     * ========================================================
     */

    if (error?.status === 400) {
      setUploadState(
        error.message ||
          'Please check the track details.',
      );

      return;
    }

    /*
     * ========================================================
     * FORBIDDEN
     * ========================================================
     */

    if (error?.status === 403) {
      setUploadState(
        'You do not have permission to upload tracks.',
      );

      return;
    }

    /*
     * ========================================================
     * FILE TOO LARGE
     * ========================================================
     */

    if (error?.status === 413) {
      setUploadState(
        'File is too large.',
      );

      return;
    }

    /*
     * ========================================================
     * SERVER ERROR
     * ========================================================
     */

    if (
      error?.status >= 500
    ) {
      setUploadState(
        'Upload failed. Please try again.',
      );

      return;
    }

    /*
     * ========================================================
     * OTHER ERROR
     * ========================================================
     */

    setUploadState(
      error?.message ||
        'Upload failed.',
    );
  } finally {
    setUploading(false);
  }
}