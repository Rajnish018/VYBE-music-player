import { parseBlob, selectCover } from 'music-metadata';

export const emptyTrackMetadata = {
  title: '',
  artist: '',
  album: '',
  genre: '',
  year: '',
  duration: '',
  thumbnailUrl: '',
  hasArtwork: false,
  artworkMimeType: '',
  artworkSize: 0,
  artworkType: '',
  artworkFile: null,
  artworkWidth: 0,
  artworkHeight: 0,
};

function cleanFilePart(value = '') {
  return value
    .replace(/\.[^/.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTrackTitle(value = '') {
  return value
    .replace(
      /\s*\([^)]*\b(?:kbps|kb\/s|kbs|khz|hz)\b[^)]*\)/gi,
      '',
    )
    .replace(/\s*[-–—]\s*\d+\s*$/g, '')
    .replace(/\s+\d+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value = '') {
  return value
    .split(' ')
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(' ');
}

/**
 * Filename fallback.
 *
 * Example:
 * "Farak - Taare.mp3"
 *
 * becomes:
 * artist = Farak
 * title  = Taare
 */


export function inferTrackMetadata(file) {
  const baseName = cleanFilePart(file?.name || '');

  const [artistPart, ...titleParts] = baseName.split(
    /\s+-\s+|\s+--\s+/,
  );

  const hasArtistTitle =
    Boolean(artistPart) && titleParts.length > 0;

  let title = hasArtistTitle
    ? titleParts.join(' - ')
    : baseName;

  let artist = hasArtistTitle
    ? artistPart
    : 'Unknown Artist';

  title = cleanTrackTitle(title);
  artist = artist.trim();

  return {
    ...emptyTrackMetadata,

    title: titleCase(
      title || 'Untitled Track',
    ),

    artist: titleCase(
      artist || 'Unknown Artist',
    ),

    album: 'Single',
  };
}

/**
 * Convert embedded artwork bytes into a browser-previewable
 * data URL.
 */
function bytesToDataUrl(data, mimeType) {
  if (!data || !data.length || !mimeType) {
    return '';
  }

  let binary = '';

  const bytes =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data);

  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(
      i,
      Math.min(i + chunkSize, bytes.length),
    );

    binary += String.fromCharCode(...chunk);
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Convert seconds to the format used by the admin UI.
 */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  return String(Math.max(1, Math.round(seconds)));
}

/**
 * Read actual embedded metadata from the audio file.
 */
export async function readEmbeddedMetadata(file) {
  if (!file) {
    return emptyTrackMetadata;
  }

  console.log(
    '[AUDIO METADATA] Reading:',
    file.name,
  );

  const metadata = await parseBlob(file, {
    duration: true,
    skipCovers: false,
  });

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

  const common = metadata.common || {};

  const cover = selectCover(
    common.picture || [],
  );

  console.log(
    '[AUDIO METADATA] Selected cover:',
    cover,
  );

  const artworkMimeType =
    cover?.format || '';

  const artworkSize =
    cover?.data?.byteLength || 0;

  const thumbnailUrl =
    cover?.data && artworkMimeType
      ? bytesToDataUrl(
          cover.data,
          artworkMimeType,
        )
      : '';

  const title =
    common.title?.trim() || '';

  const artist =
    common.artist?.trim() ||
    common.artists?.[0]?.trim() ||
    '';

  const album =
    common.album?.trim() || '';

  const genre =
    common.genre?.[0]?.trim() || '';

  const year =
    common.year
      ? String(common.year)
      : '';

  const duration =
    formatDuration(
      metadata.format?.duration,
    );

  return {
    ...emptyTrackMetadata,

    title,
    artist,
    album,
    genre,
    year,
    duration,

    thumbnailUrl,

    hasArtwork: Boolean(
      cover?.data?.length,
    ),

    artworkMimeType,

    artworkSize,

    artworkType:
      cover?.type || 'Cover (front)',
  };

  
}
