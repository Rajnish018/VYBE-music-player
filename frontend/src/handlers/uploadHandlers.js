import {
  parseBlob,
  selectCover,
} from 'music-metadata';

import { adminApi } from '../api';

import {
  emptyTrackMetadata,
  inferTrackMetadata,
} from '../utils/metadata';

/**
 * Convert embedded artwork bytes to a browser
 * previewable data URL.
 */
function bytesToDataUrl(data, mimeType) {
  if (!data || !data.length) {
    return '';
  }

  const bytes =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data);

  let binary = '';

  const chunkSize = 0x8000;

  for (
    let index = 0;
    index < bytes.length;
    index += chunkSize
  ) {
    const chunk = bytes.subarray(
      index,
      Math.min(
        index + chunkSize,
        bytes.length,
      ),
    );

    binary += String.fromCharCode(
      ...chunk,
    );
  }

  return `data:${
    mimeType || 'image/jpeg'
  };base64,${btoa(binary)}`;
}

/**
 * Read actual embedded metadata from
 * the selected audio file.
 */
async function readEmbeddedMetadata(file) {
  console.log(
    '[AUDIO METADATA] Reading:',
    file.name,
  );

  const metadata = await parseBlob(
    file,
    {
      duration: true,

      /*
       * IMPORTANT:
       * We need embedded pictures.
       */
      skipCovers: false,
    },
  );

  console.log(
    '[AUDIO METADATA] Full:',
    metadata,
  );

  console.log(
    '[AUDIO METADATA] Common:',
    metadata.common,
  );

  console.log(
    '[AUDIO METADATA] Pictures:',
    metadata.common?.picture,
  );

  const common =
    metadata?.common || {};

  const format =
    metadata?.format || {};

  /*
   * Select the best available cover.
   *
   * For your MP3 this should select
   * the Front Cover / APIC artwork.
   */
  const cover = selectCover(
    common.picture || [],
  );

  console.log(
    '[AUDIO METADATA] Selected cover:',
    cover,
  );

  /*
   * =============================
   * TEXT METADATA
   * =============================
   */

  const title =
    common.title?.trim() || '';

  const artist =
    common.artist?.trim() ||
    common.artists?.[0]?.trim() ||
    '';

  const album =
    common.album?.trim() || '';

  const genre =
    Array.isArray(common.genre)
      ? common.genre[0]?.trim() || ''
      : common.genre?.trim() || '';

  const year =
    common.year
      ? String(common.year)
      : '';

  const duration =
    Number.isFinite(format.duration)
      ? String(
          Math.max(
            1,
            Math.round(
              format.duration,
            ),
          ),
        )
      : '';

  /*
   * =============================
   * EMBEDDED ARTWORK
   * =============================
   */

  const artworkData =
    cover?.data || null;

  const artworkMimeType =
    cover?.format || '';

  const artworkSize =
    artworkData?.byteLength || 0;

  const thumbnailUrl =
    artworkData && artworkMimeType
      ? bytesToDataUrl(
          artworkData,
          artworkMimeType,
        )
      : '';

  const artworkType =
    cover?.type ||
    'Cover (front)';

  const hasArtwork =
    Boolean(
      artworkData &&
      artworkData.length > 0,
    );

  console.log(
    '[AUDIO ARTWORK]',
    {
      hasArtwork,
      type: artworkType,
      format: artworkMimeType,
      size: artworkSize,
    },
  );

  return {
    title,
    artist,
    album,
    genre,
    year,
    duration,

    thumbnailUrl,

    hasArtwork,

    artworkMimeType,

    artworkSize,

    artworkType,

    /*
     * No custom file yet.
     */
    artworkFile: null,

    artworkWidth: 0,
    artworkHeight: 0,
  };
}

/**
 * Handle selecting an audio file.
 */
export async function handleAdminFileChange({
  file,
  setUploadFile,
  setUploadForm,
  setUploadState,
}) {
  setUploadFile(file);

  if (!file) {
    setUploadForm(
      emptyTrackMetadata,
    );

    setUploadState('');

    return;
  }

  /*
   * Filename fallback.
   *
   * Used only when embedded metadata
   * does not contain a value.
   */
  const fallbackMetadata =
    inferTrackMetadata(file);

  setUploadForm(
    fallbackMetadata,
  );

  setUploadState(
    'Reading audio metadata...',
  );

  try {
    /*
     * Read actual ID3 / MP4 metadata.
     */
    const metadata =
      await readEmbeddedMetadata(
        file,
      );

    /*
     * Embedded metadata takes priority
     * over filename metadata.
     */
    setUploadForm((current) => ({
      ...current,

      title:
        metadata.title ||
        current.title,

      artist:
        metadata.artist ||
        current.artist,

      album:
        metadata.album ||
        current.album ||
        'Single',

      genre:
        metadata.genre ||
        '',

      year:
        metadata.year ||
        '',

      duration:
        metadata.duration ||
        current.duration,

      thumbnailUrl:
        metadata.thumbnailUrl ||
        '',

      hasArtwork:
        metadata.hasArtwork,

      artworkMimeType:
        metadata.artworkMimeType ||
        '',

      artworkSize:
        metadata.artworkSize ||
        0,

      artworkType:
        metadata.artworkType ||
        '',

      artworkFile:
        null,

      artworkWidth: 0,

      artworkHeight: 0,
    }));

    /*
     * =============================
     * STATUS
     * =============================
     */

    if (metadata.hasArtwork) {
      const sizeKB =
        metadata.artworkSize /
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
      '[ADMIN METADATA]',
      error,
    );

    /*
     * Parser failed.
     *
     * Keep filename metadata.
     */
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
      const seconds = Math.max(
        1,
        Math.round(
          audio.duration || 0,
        ),
      );

      URL.revokeObjectURL(
        objectUrl,
      );

      setUploadForm((current) => ({
        ...current,

        duration:
          String(seconds),
      }));

      setUploadState(
        'Metadata detected. Ready to upload.',
      );
    };

    audio.onerror = () => {
      URL.revokeObjectURL(
        objectUrl,
      );

      setUploadState(
        'Could not read audio metadata. Try another audio file.',
      );
    };

    audio.load();
  }
}

/**
 * Upload track.
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
  logout,
}) {
  event.preventDefault();

  if (uploading) {
    return;
  }

  const formElement =
    event.currentTarget;

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

  setUploading(true);

  setUploadState(
    'Uploading to MEGA...',
  );

  const formData =
    new FormData();

  /*
   * Metadata fields that should NOT be
   * converted into strings and appended.
   */
  const previewOnlyFields = new Set([
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
   * Add normal metadata.
   */
  Object.entries(uploadForm).forEach(
    ([key, value]) => {
      if (
        previewOnlyFields.has(key)
      ) {
        return;
      }

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
   * =============================
   * ORIGINAL AUDIO
   * =============================
   */
  formData.append(
    'audio',
    uploadFile,
  );

  /*
   * =============================
   * CUSTOM COVER
   * =============================
   *
   * If admin selected:
   *
   * Edit detected metadata
   *      ↓
   * Cover image
   *      ↓
   * Replace cover
   *
   * send that image separately.
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
   * Debug FormData.
   */
  console.log(
    '[UPLOAD] Metadata:',
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
      duration:
        uploadForm.duration,
      hasEmbeddedArtwork:
        uploadForm.hasArtwork,
      hasCustomArtwork:
        Boolean(
          uploadForm.artworkFile,
        ),
    },
  );

  try {
    await adminApi.uploadTrack(
      formData,
      token,
    );

    await refreshLibrary();

    setUploadForm(
      emptyTrackMetadata,
    );

    setUploadFile(null);

    formElement?.reset();

    setUploadState(
      'Uploaded and ready to play.',
    );
  } catch (error) {
    if (error?.status === 401) {
      logout();
      return;
    }

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

    if (error?.status === 400) {
      setUploadState(
        error.message ||
          'Please check the track details.',
      );

      return;
    }

    if (error?.status === 403) {
      setUploadState(
        'You do not have permission to upload tracks.',
      );

      return;
    }

    if (error?.status === 413) {
      setUploadState(
        'File is too large.',
      );

      return;
    }

    if (error?.status >= 500) {
      setUploadState(
        'Upload failed. Please try again.',
      );

      return;
    }

    setUploadState(
      error?.message ||
        'Upload failed.',
    );
  } finally {
    setUploading(false);
  }
}