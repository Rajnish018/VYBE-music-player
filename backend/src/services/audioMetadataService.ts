import fs from 'fs/promises';
import path from 'path';
import { parseFile } from 'music-metadata';

export interface AudioMetadata {
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  movie: string | null;
  duration: number | null;
  releaseYear: number | null;
  releaseDate: Date | null;
  genres: string[];
  tags: string[];
  language: string | null;
  explicit: boolean;
  composer: string | null;
  copyright: string | null;
  publisher: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  description: string | null;
  coverBuffer: Buffer | null;
  coverMimeType: string | null;
  coverExtension: string | null;
  pictureCount: number;
  selectedPictureType: string | null;
}

function cleanFilePart(value: string) {
  return value
    .replace(/\.[^/.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTrackTitle(value: string) {
  return value
    // (320 Kbps), (128 Kbps), (44.1 Khz), etc.
    .replace(
      /\s*\([^)]*\b(?:kbps|kb\/s|kbs|khz|hz)\b[^)]*\)/gi,
      '',
    )

    // "- 26224"
    .replace(/\s*[-–—]\s*\d+\s*$/g, '')

    // trailing numeric ID
    .replace(/\s+\d+\s*$/g, '')

    .replace(/\s+/g, ' ')
    .trim();
}

function extractMovieFromTitle(value: string) {
  const match =
    value.match(/\s*\((?:from|movie|film)\s+([^)]+)\)\s*/i);

  if (!match?.[1]) {
    return {
      title: value.trim(),
      movie: null,
    };
  }

  return {
    title: value.replace(match[0], ' ').replace(/\s+/g, ' ').trim(),
    movie: titleCase(match[1].trim()),
  };
}

function titleCase(value: string) {
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

function inferFromFilename(fileName: string) {
  const baseName = cleanFilePart(fileName);

  const [
    artistPart,
    ...titleParts
  ] = baseName.split(
    /\s+-\s+|\s+--\s+/,
  );

  const hasArtistTitle =
    Boolean(artistPart) &&
    titleParts.length > 0;

  let title = hasArtistTitle
    ? titleParts.join(' - ')
    : baseName;

  let artist = hasArtistTitle
    ? artistPart
    : 'Unknown Artist';

  title = cleanTrackTitle(title);

  const movieParts =
    extractMovieFromTitle(title);

  return {
    title: titleCase(
      movieParts.title || 'Untitled Track',
    ),

    artist: titleCase(
      artist || 'Unknown Artist',
    ),

    album: 'Single',

    movie: movieParts.movie,
  };
}

function extensionFromMime(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return '.png';

    case 'image/webp':
      return '.webp';

    case 'image/gif':
      return '.gif';

    case 'image/jpeg':
    case 'image/jpg':
    default:
      return '.jpg';
  }
}

function firstValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    const found = value.find((item) => String(item || '').trim());
    return found ? String(found).trim() : null;
  }

  const stringValue = String(value || '').trim();
  return stringValue || null;
}

function parseNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.round(numericValue)
    : null;
}

function parseReleaseDate(dateValue: unknown): Date | null {
  const stringValue = firstValue(dateValue);

  if (!stringValue) {
    return null;
  }

  const parsedDate = new Date(stringValue);

  return Number.isNaN(parsedDate.getTime())
    ? null
    : parsedDate;
}

function normalizeList(values: unknown, lowercase = false) {
  const rawValues =
    Array.isArray(values)
      ? values
      : String(values || '').split(/[;,]/);

  const seen = new Set<string>();
  const result: string[] = [];

  rawValues.forEach((value) => {
    const cleanValue = String(value || '').trim();

    if (!cleanValue) {
      return;
    }

    const displayValue = lowercase
      ? cleanValue.toLowerCase()
      : titleCase(cleanValue);

    const key = displayValue.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(displayValue);
  });

  return result;
}

function selectCoverPicture(
  pictures: NonNullable<
    Awaited<ReturnType<typeof parseFile>>['common']['picture']
  >,
) {
  if (!pictures.length) {
    return null;
  }

  return (
    pictures.find((picture) => {
      const type = String(picture.type || '').toLowerCase();
      return type.includes('cover') && type.includes('front');
    }) ||
    pictures.find((picture) => {
      const type = String(picture.type || '').toLowerCase();
      return type.includes('front');
    }) ||
    pictures[0]
  );
}

export async function extractAudioMetadata(
  filePath: string,
  originalFileName: string,
): Promise<AudioMetadata> {
  const fallback = inferFromFilename(
    originalFileName,
  );

  const metadata = await parseFile(filePath, {
    skipCovers: false,
  });

  const common = metadata.common || {};

  const pictures = common.picture || [];
  const picture = selectCoverPicture(pictures);

  let coverBuffer: Buffer | null = null;
  let coverMimeType: string | null = null;
  let coverExtension: string | null = null;
  let selectedPictureType: string | null = null;

  console.log(
    '[ARTWORK] Embedded pictures detected:',
    pictures.length,
  );

  pictures.forEach((embeddedPicture, index) => {
    console.log('[ARTWORK] Picture candidate', {
      index,
      type: embeddedPicture.type || null,
      mimeType: embeddedPicture.format || null,
      size: embeddedPicture.data?.length || 0,
    });
  });

  if (picture?.data) {
    coverBuffer = Buffer.from(picture.data);

    coverMimeType =
      picture.format || 'image/jpeg';

    coverExtension =
      extensionFromMime(coverMimeType);

    selectedPictureType =
      picture.type || null;

    console.log('[ARTWORK] Selected embedded picture', {
      type: selectedPictureType,
      mimeType: coverMimeType,
      size: coverBuffer.length,
      extension: coverExtension,
    });
  } else {
    console.log(
      '[ARTWORK] No embedded artwork found in audio metadata.',
    );
  }

  const embeddedTitle =
    cleanTrackTitle(
      common.title?.trim() ||
        fallback.title,
    );

  const titleParts =
    extractMovieFromTitle(embeddedTitle);

  const releaseDate =
    parseReleaseDate(common.date);

  const releaseYear =
    parseNumber(common.year) ||
    (releaseDate ? releaseDate.getUTCFullYear() : null);

  return {
    title: cleanTrackTitle(
      titleParts.title ||
        fallback.title,
    ),

    artist:
      common.artist?.trim() ||
      common.artists?.[0]?.trim() ||
      fallback.artist,

    album:
      common.album?.trim() ||
      fallback.album,

    albumArtist:
      firstValue(common.albumartist),

    movie:
      firstValue((common as any).movie) ||
      titleParts.movie ||
      fallback.movie,

    duration:
      metadata.format.duration &&
      Number.isFinite(metadata.format.duration)
        ? Math.round(metadata.format.duration)
        : null,

    releaseYear,

    releaseDate,

    genres:
      normalizeList(common.genre),

    tags:
      normalizeList((common as any).tags, true),

    language:
      firstValue((common as any).language),

    explicit:
      Boolean((common as any).explicit),

    composer:
      firstValue(common.composer),

    copyright:
      firstValue(common.copyright),

    publisher:
      firstValue((common as any).label || (common as any).publisher),

    trackNumber:
      parseNumber(common.track?.no),

    discNumber:
      parseNumber(common.disk?.no),

    description:
      firstValue((common as any).description || common.comment),

    coverBuffer,

    coverMimeType,

    coverExtension,

    pictureCount: pictures.length,

    selectedPictureType,
  };
}

/**
 * Optional helper if you need to save artwork temporarily.
 */
export async function saveCoverTemporarily(
  coverBuffer: Buffer,
  extension: string,
  directory: string,
) {
  await fs.mkdir(directory, {
    recursive: true,
  });

  const fileName = `cover-${Date.now()}${extension}`;

  const filePath = path.join(
    directory,
    fileName,
  );

  await fs.writeFile(
    filePath,
    coverBuffer,
  );

  return filePath;
}
