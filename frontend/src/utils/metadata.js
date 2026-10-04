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

/* =========================================================
   DOWNLOAD / WEBSITE SOURCE PATTERNS
   ========================================================= */

const SOURCE_REGEX =
  '(?:www\\.)?' +
  '(?:pagalnew|pagalworld|pagalworlds|koshalworld|' +
  'mr[\\s-]*jatt|dj[\\s-]*punjab|dj[\\s-]*maza|' +
  'wynk|jiosaavn|gaana)' +
  '(?:\\.(?:com|in|net|org))?';


/* =========================================================
   GENERAL CLEANER
   ========================================================= */

export function cleanMetadataValue(value = '') {
  let result = String(value ?? '');

  result = result
    .replace(/\u00A0/g, ' ')
    .replace(/[‐-‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove:
  // (PagalNew)
  // [PagalNew]
  // {PagalNew}
  // (PagalNew.com)
  result = result.replace(
    new RegExp(
      `\\s*[([{]\\s*${SOURCE_REGEX}\\s*[)\\]}]`,
      'gi'
    ),
    ''
  );

  // Remove:
  // - PagalNew
  // - PagalWorld
  // - KoshalWorld
  // - Mr Jatt
  // - DJ Punjab
  result = result.replace(
    new RegExp(
      `\\s*[-|_:]\\s*${SOURCE_REGEX}\\s*$`,
      'gi'
    ),
    ''
  );

  // Remove:
  // Download from PagalNew
  // Downloaded from PagalNew
  // Source: PagalNew
  result = result.replace(
    new RegExp(
      `\\s*(?:download(?:ed)?\\s*(?:from|at)?|source\\s*[:=-]?)\\s*${SOURCE_REGEX}\\s*$`,
      'gi'
    ),
    ''
  );

  // Remove bitrate / sample rate.
  result = result.replace(
    /\s*[\(\[\{][^\)\]\}]*\b(?:kbps|kb\/s|kbs|kbits?\/s|khz|hz)\b[^\)\]\}]*[\)\]\}]/gi,
    ' '
  );

  return result
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}


/* =========================================================
   TITLE CLEANER
   ========================================================= */

export function cleanTrackTitle(value = '') {
  let result = String(value ?? '');

  result = result
    .replace(/\u00A0/g, ' ')
    .replace(/[‐-‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  for (let pass = 0; pass < 10; pass += 1) {
    const previous = result;

    // (PagalNew)
    // [PagalNew]
    // {PagalNew}
    result = result.replace(
      new RegExp(
        `\\s*[([{]\\s*${SOURCE_REGEX}\\s*[)\\]}]\\s*$`,
        'i'
      ),
      ''
    );

    // - PagalNew
    // - PagalWorld
    // - KoshalWorld
    // - Mr Jatt
    // - DJ Punjab
    result = result.replace(
      new RegExp(
        `\\s*[-|_:]\\s*${SOURCE_REGEX}\\s*$`,
        'i'
      ),
      ''
    );

    // Download from PagalNew
    result = result.replace(
      new RegExp(
        `\\s*(?:download(?:ed)?\\s*(?:from|at)?|source\\s*[:=-]?)\\s*${SOURCE_REGEX}\\s*$`,
        'i'
      ),
      ''
    );

    // 320 Kbps
    // 256 kbps
    // 44.1 kHz
    result = result.replace(
      /\s*[-|_:]?\s*\(?\s*\d+(?:\.\d+)?\s*(?:kbps|kb\/s|kbs|kbits?\/s|khz|hz)\s*\)?\s*$/i,
      ''
    );

    // Song - 01
    // Song - 1
    result = result.replace(
      /\s*[-|_:]\s*\d+\s*$/,
      ''
    );

    // Song 01
    result = result.replace(
      /\s+\d+\s*$/,
      ''
    );

    result = result.trim();

    if (result === previous) {
      break;
    }
  }

  return result
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}


/* =========================================================
   OTHER METADATA CLEANERS
   ========================================================= */

export function cleanArtist(value = '') {
  return cleanMetadataValue(value);
}

export function cleanAlbum(value = '') {
  return cleanMetadataValue(value);
}

export function cleanGenre(value = '') {
  const result = cleanMetadataValue(value);

  if (!result) {
    return '';
  }

  const lower = result.toLowerCase();

  if (
    lower.includes('pagalnew') ||
    lower.includes('pagalworld') ||
    lower.includes('koshalworld') ||
    lower.includes('www.') ||
    lower.includes('.com') ||
    lower.includes('.in')
  ) {
    return '';
  }

  return result;
}

export function cleanYear(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return '';
  }

  const year = Number(value);

  if (
    !Number.isInteger(year) ||
    year < 1800 ||
    year > 2200
  ) {
    return '';
  }

  return String(year);
}


/* =========================================================
   ARTWORK
   ========================================================= */

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
      Math.min(index + chunkSize, bytes.length)
    );

    binary += String.fromCharCode(...chunk);
  }

  return `data:${mimeType || 'image/jpeg'};base64,${btoa(binary)}`;
}


/* =========================================================
   DURATION
   ========================================================= */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}


/* =========================================================
   FILENAME FALLBACK
   ========================================================= */

function cleanFilePart(value = '') {
  return String(value)
    .replace(/\.[^/.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferTrackMetadata(file) {
  const baseName = cleanFilePart(
    file?.name || ''
  );

  const [
    artistPart,
    ...titleParts
  ] = baseName.split(
    /\s+-\s+|\s+--\s+/
  );

  const hasArtistTitle =
    Boolean(
      artistPart &&
      titleParts.length > 0
    );

  let title = hasArtistTitle
    ? titleParts.join(' - ')
    : baseName;

  let artist = hasArtistTitle
    ? artistPart
    : 'Unknown Artist';

  title = cleanTrackTitle(title);
  artist = cleanArtist(artist);

  return {
    ...emptyTrackMetadata,

    title:
      title || 'Untitled Track',

    artist:
      artist || 'Unknown Artist',

    album: 'Single',
  };
}


/* =========================================================
   EMBEDDED METADATA EXTRACTION
   ========================================================= */

export async function readEmbeddedMetadata(file) {
  if (!file) {
    return {
      ...emptyTrackMetadata,
    };
  }

  try {
    const metadata = await parseBlob(
      file,
      {
        duration: true,
        skipCovers: false,
      }
    );

    const common =
      metadata?.common || {};

    const format =
      metadata?.format || {};

    /* -------------------------
       ARTWORK
       ------------------------- */

    const pictures =
      Array.isArray(common.picture)
        ? common.picture
        : [];

    const cover =
      selectCover(pictures);

    const artworkData =
      cover?.data || null;

    const artworkMimeType =
      cover?.format || '';

    const artworkSize =
      artworkData?.byteLength || 0;

    const artworkType =
      cover?.type ||
      'Cover (front)';

    const thumbnailUrl =
      artworkData &&
      artworkMimeType
        ? bytesToDataUrl(
            artworkData,
            artworkMimeType
          )
        : '';

    const artworkWidth =
      Number.isFinite(cover?.width)
        ? cover.width
        : 0;

    const artworkHeight =
      Number.isFinite(cover?.height)
        ? cover.height
        : 0;


    /* -------------------------
       TITLE
       ------------------------- */

    const rawTitle =
      typeof common.title === 'string'
        ? common.title.trim()
        : '';


    /* -------------------------
       ARTIST
       ------------------------- */

    const rawArtist =
      typeof common.artist === 'string'
        ? common.artist.trim()
        : Array.isArray(common.artists)
          ? common.artists
              .filter(Boolean)
              .join(', ')
          : '';


    /* -------------------------
       ALBUM
       ------------------------- */

    const rawAlbum =
      typeof common.album === 'string'
        ? common.album.trim()
        : '';


    /* -------------------------
       GENRE
       ------------------------- */

    const rawGenre =
      Array.isArray(common.genre)
        ? common.genre[0] || ''
        : typeof common.genre === 'string'
          ? common.genre
          : '';


    /* -------------------------
       CLEAN
       ------------------------- */

    const title =
      cleanTrackTitle(rawTitle);

    const artist =
      cleanArtist(rawArtist);

    const album =
      cleanAlbum(rawAlbum);

    const genre =
      cleanGenre(rawGenre);

    const year =
      cleanYear(common.year);

    const duration =
      formatDuration(
        format.duration
      );


    /* -------------------------
       FILENAME FALLBACK
       ------------------------- */

    const filenameMetadata =
      inferTrackMetadata(file);

    const finalTitle =
      title ||
      filenameMetadata.title;

    const finalArtist =
      artist ||
      filenameMetadata.artist;

    const finalAlbum =
      album ||
      filenameMetadata.album;


    return {
      ...emptyTrackMetadata,

      title:
        finalTitle ||
        'Untitled Track',

      artist:
        finalArtist ||
        'Unknown Artist',

      album:
        finalAlbum ||
        'Single',

      genre,

      year,

      duration,

      thumbnailUrl,

      hasArtwork:
        Boolean(
          artworkData &&
          artworkData.length > 0
        ),

      artworkMimeType,

      artworkSize,

      artworkType,

      artworkFile: null,

      artworkWidth,

      artworkHeight,
    };
  } catch (error) {
    console.error(
      '[AUDIO METADATA] Failed:',
      error
    );

    return inferTrackMetadata(file);
  }
}