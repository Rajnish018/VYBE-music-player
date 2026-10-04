/*
 * ============================================================
 * AURA - BULK MUSIC UPLOADER
 * ============================================================
 *
 * Usage:
 *
 *   node scripts/bulk-upload.js "/path/to/songs"
 *
 * Recursive:
 *
 *   node scripts/bulk-upload.js "/path/to/songs" --recursive
 *
 * Dry run:
 *
 *   node scripts/bulk-upload.js "/path/to/songs" --dry-run
 *
 * Base URL:
 *
 *   node scripts/bulk-upload.js "/path/to/songs" \
 *     --base-url http://localhost:3000
 *
 * Environment variables:
 *
 *   BULK_UPLOAD_BASE_URL
 *   BULK_ADMIN_EMAIL
 *   BULK_ADMIN_PASSWORD
 *   BULK_UPLOAD_TOKEN
 *
 * Existing backend endpoint:
 *
 *   POST /api/admin/tracks
 *
 * Backend continues to handle:
 *
 *   - duplicate detection
 *   - SHA-256
 *   - MEGA upload
 *   - artwork upload
 *   - PostgreSQL transaction
 *   - rollback / recovery
 *
 * ============================================================
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

require('dotenv').config({
  path: path.join(__dirname, '../.env'),
});

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

/* ============================================================
   CONFIG
   ============================================================ */

const DEFAULT_BASE_URL =
  'http://localhost:3000';

const DEFAULT_TIMEOUT_MS =
  20 * 60 * 1000;

const AUDIO_MIME_TYPES = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

const DOWNLOAD_SOURCES = [
  'pagalnew',
  'pagalworld',
  'koshalworld',
  'mrjatt',
  'mr-jatt',
  'djpunjab',
  'dj-punjab',
  'djmaza',
  'dj-maza',
  'wynk',
  'jiosaavn',
  'gaana',
];

const SOURCE_REGEX =
  '(?:www\\.)?' +
  '(?:pagalnew|pagalworld|koshalworld|' +
  'mr[\\s-]*jatt|dj[\\s-]*punjab|' +
  'dj[\\s-]*maza|wynk|jiosaavn|gaana)' +
  '(?:\\.(?:com|in|net|org))?';

/* ============================================================
   ARGUMENTS
   ============================================================ */

function getOption(name) {
  const index =
    process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return (
    process.argv[index + 1] ||
    null
  );
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function getFolderArgument() {
  const args =
    process.argv.slice(2);

  for (
    let i = 0;
    i < args.length;
    i += 1
  ) {
    const value = args[i];

    if (value.startsWith('--')) {
      if (
        value === '--recursive' ||
        value === '--dry-run'
      ) {
        continue;
      }

      if (
        value === '--base-url' ||
        value === '--timeout'
      ) {
        i += 1;
      }

      continue;
    }

    return value;
  }

  return null;
}

/* ============================================================
   BASIC HELPERS
   ============================================================ */

function normalizeBaseUrl(value) {
  return String(value || '')
    .replace(/\/+$/, '');
}

function getMimeType(filePath) {
  return (
    AUDIO_MIME_TYPES[
      path.extname(filePath)
        .toLowerCase()
    ] || null
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
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

  if (
    bytes <
    1024 * 1024 * 1024
  ) {
    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  }

  return `${(
    bytes /
    (1024 * 1024 * 1024)
  ).toFixed(2)} GB`;
}

function getString(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        String(item ?? '').trim(),
      )
      .filter(Boolean)
      .join(', ');
  }

  return String(value).trim();
}

/* ============================================================
   METADATA CLEANING
   ============================================================ */

/*
 * Clean generic metadata.
 *
 * Removes:
 *
 *   [PagalNew]
 *   (PagalNew)
 *   {PagalNew}
 *   - PagalNew
 *   - PagalNew.com
 *   - 320 kbps
 *   - 44.1 kHz
 */
function cleanMetadataValue(
  value = '',
) {
  let result =
    String(value ?? '');

  result = result
    .replace(/\u00a0/g, ' ')
    .replace(
      /[‐-‒–—―]/g,
      '-',
    )
    .replace(/\s+/g, ' ')
    .trim();

  /*
   * Remove bracketed source.
   */
  const bracketedSource =
    new RegExp(
      `\\s*[\\(\\[\\{]\\s*${SOURCE_REGEX}\\s*[\\)\\]\\}]`,
      'gi',
    );

  result = result.replace(
    bracketedSource,
    '',
  );

  /*
   * Remove trailing source after:
   *
   *   -
   *   |
   *   :
   *   _
   */
  const trailingSource =
    new RegExp(
      `\\s*[-|_:]\\s*${SOURCE_REGEX}\\s*$`,
      'i',
    );

  result = result.replace(
    trailingSource,
    '',
  );

  /*
   * Remove "Downloaded from PagalNew"
   * type noise.
   */
  const downloadedSource =
    new RegExp(
      `\\s*(?:download(?:ed)?\\s*(?:from|at)?|source\\s*[:=-]?)\\s*${SOURCE_REGEX}\\s*$`,
      'i',
    );

  result = result.replace(
    downloadedSource,
    '',
  );

  /*
   * Remove bitrate / sample rate
   * when surrounded by brackets.
   */
  result = result.replace(
    /\s*[\(\[\{][^\)\]\}]*\b(?:kbps|kb\/s|kbs|kbits?\/s|khz|hz)\b[^\)\]\}]*[\)\]\}]\s*/gi,
    ' ',
  );

  return result
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * Dedicated title cleaner.
 *
 * IMPORTANT CASES:
 *
 *   Vindhyvasini Ki Jai Ho - PagalNew
 *   Re Bawri - PagalNew
 *   Song - PagalNew.com
 *   Song – PagalNew
 *   Song [PagalNew]
 *   Song (PagalNew)
 *   Song - 320 kbps
 *   Song - 01
 */
function cleanTrackTitle(
  value = '',
) {
  let result =
    cleanMetadataValue(value);

  for (
    let pass = 0;
    pass < 5;
    pass += 1
  ) {
    const previous =
      result;

    result = result
      .replace(
        new RegExp(
          `\\s*[-|_:]\\s*${SOURCE_REGEX}\\s*$`,
          'i',
        ),
        '',
      )
      .replace(
        new RegExp(
          `\\s*[\\(\\[\\{]\\s*${SOURCE_REGEX}\\s*[\\)\\]\\}]\\s*$`,
          'i',
        ),
        '',
      )
      .replace(
        /\s*[-|_:]\s*\(?\s*\d+(?:\.\d+)?\s*(?:kbps|kb\/s|kbs|kbits?\/s|khz|hz)\s*\)?\s*$/i,
        '',
      )
      .replace(
        /\s*[-|_:]\s*\d+\s*$/,
        '',
      )
      .replace(
        /\s+\d+\s*$/,
        '',
      )
      .trim();

    if (
      result ===
      previous
    ) {
      break;
    }
  }

  return result
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArtist(
  value = '',
) {
  return cleanMetadataValue(
    value,
  );
}

function cleanAlbum(
  value = '',
) {
  return cleanMetadataValue(
    value,
  );
}

function cleanPerson(
  value = '',
) {
  return cleanMetadataValue(
    value,
  );
}

function cleanDescription(
  value = '',
) {
  return cleanMetadataValue(
    value,
  )
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:kbps|kb\/s|kbs|kbits?\/s|khz|hz)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanGenre(
  value = '',
) {
  const result =
    cleanMetadataValue(
      value,
    );

  if (!result) {
    return '';
  }

  const lower =
    result.toLowerCase();

  const looksLikeSource =
    DOWNLOAD_SOURCES.some(
      (source) =>
        lower.includes(source),
    );

  if (
    looksLikeSource ||
    lower.includes('www.') ||
    lower.includes('.com') ||
    lower.includes('.in')
  ) {
    return '';
  }

  return result;
}

function cleanList(
  value,
) {
  const raw =
    Array.isArray(value)
      ? value
      : String(value ?? '')
          .split(/[;,|]/);

  const seen =
    new Set();

  const result = [];

  for (
    const item of raw
  ) {
    const cleaned =
      cleanGenre(item);

    if (!cleaned) {
      continue;
    }

    const key =
      cleaned.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function cleanTags(
  value,
) {
  return cleanList(value)
    .map((tag) =>
      tag.toLowerCase(),
    );
}

function cleanYear(
  value,
) {
  const year =
    Number(value);

  if (
    !Number.isInteger(year) ||
    year < 1800 ||
    year > 2200
  ) {
    return '';
  }

  return String(year);
}

function cleanDate(
  value,
) {
  if (!value) {
    return '';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  return date
    .toISOString()
    .slice(0, 10);
}

function cleanNumber(
  value,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return '';
  }

  return String(
    Math.round(number),
  );
}

function cleanExplicit(
  value,
) {
  if (
    typeof value ===
    'boolean'
  ) {
    return value;
  }

  const text =
    String(value ?? '')
      .trim()
      .toLowerCase();

  if (
    text === 'true' ||
    text === '1' ||
    text === 'yes' ||
    text === 'explicit' ||
    text.includes('explicit') ||
    text.includes('parental advisory')
  ) {
    return true;
  }

  return false;
}

/* ============================================================
   FILENAME FALLBACK
   ============================================================ */

function cleanFilePart(
  value = '',
) {
  return cleanTrackTitle(
    String(value)
      .replace(
        /\.[^/.]+$/,
        '',
      )
      .replace(
        /[_]+/g,
        ' ',
      ),
  );
}

function inferTrackMetadata(
  fileName,
) {
  const baseName =
    cleanFilePart(
      fileName,
    );

  const parts =
    baseName.split(
      /\s+--\s+|\s+-\s+/,
    );

  const artistPart =
    parts.shift() || '';

  const titlePart =
    parts.join(' - ');

  const hasArtistTitle =
    Boolean(
      artistPart &&
      titlePart,
    );

  return {
    title:
      cleanTrackTitle(
        hasArtistTitle
          ? titlePart
          : baseName,
      ) ||
      'Untitled Track',

    artist:
      cleanArtist(
        hasArtistTitle
          ? artistPart
          : 'Unknown Artist',
      ) ||
      'Unknown Artist',

    album:
      'Single',
  };
}

/* ============================================================
   METADATA EXTRACTION
   ============================================================ */

function firstString(
  value,
) {
  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      const text =
        String(item ?? '')
          .trim();

      if (text) {
        return text;
      }
    }

    return '';
  }

  return String(
    value ?? '',
  ).trim();
}

function getArtist(
  common,
) {
  const artist =
    firstString(
      common?.artist,
    );

  if (artist) {
    return artist;
  }

  return firstString(
    common?.artists,
  );
}

function getAlbumArtist(
  common,
) {
  return firstString(
    common?.albumartist ||
      common?.albumArtist,
  );
}

function getTrackNumber(
  common,
) {
  if (
    common?.track &&
    typeof common.track ===
      'object'
  ) {
    return cleanNumber(
      common.track.no,
    );
  }

  return cleanNumber(
    common?.track,
  );
}

function getDiscNumber(
  common,
) {
  const disk =
    common?.disk ||
    common?.disc;

  if (
    disk &&
    typeof disk ===
      'object'
  ) {
    return cleanNumber(
      disk.no,
    );
  }

  return cleanNumber(
    disk,
  );
}

function getExplicit(
  common,
) {
  const values = [
    common?.explicit,
    common?.contentRating,
    common?.rating,
  ];

  for (
    const value of values
  ) {
    if (
      cleanExplicit(value)
    ) {
      return true;
    }
  }

  return false;
}

async function loadMetadataLibrary() {
  try {
    return await import(
      'music-metadata'
    );
  } catch (error) {
    throw new Error(
      'music-metadata is not installed. Run: npm install music-metadata',
    );
  }
}

async function analyseAudio(
  filePath,
  musicMetadata,
) {
  const {
    parseFile,
    selectCover,
  } =
    musicMetadata;

  const metadata =
    await parseFile(
      filePath,
      {
        duration: true,
        skipCovers: false,
      },
    );

  const common =
    metadata?.common || {};

  const format =
    metadata?.format || {};

  const fallback =
    inferTrackMetadata(
      path.basename(
        filePath,
      ),
    );

  const rawTitle =
    firstString(
      common.title,
    );

  const rawArtist =
    getArtist(common);

  const rawAlbum =
    firstString(
      common.album,
    );

  const albumArtistRaw =
    getAlbumArtist(
      common,
    );

  /*
   * Same Single mapping used
   * by the existing Admin flow.
   */
  let title =
    rawTitle;

  let artist =
    rawArtist;

  let album =
    rawAlbum;

  if (
    rawAlbum
      .trim()
      .toLowerCase() ===
      'single' &&
    rawTitle &&
    rawArtist
  ) {
    title =
      rawArtist;

    album =
      rawTitle;

    artist =
      albumArtistRaw ||
      'Unknown Artist';
  }

  const cleaned = {
    title:
      cleanTrackTitle(
        title ||
          fallback.title,
      ) ||
      'Untitled Track',

    artist:
      cleanArtist(
        artist ||
          fallback.artist,
      ) ||
      'Unknown Artist',

    album:
      cleanAlbum(
        album ||
          fallback.album,
      ) ||
      'Single',

    albumArtist:
      cleanPerson(
        albumArtistRaw,
      ),

    movie:
      cleanMetadataValue(
        firstString(
          common.movie ||
            common.grouping ||
            common.work ||
            '',
        ),
      ),

    releaseYear:
      cleanYear(
        common.year,
      ),

    releaseDate:
      cleanDate(
        common.date ||
          common.originaldate ||
          common.releasedate ||
          '',
      ),

    language:
      cleanMetadataValue(
        firstString(
          common.language,
        ),
      ),

    explicit:
      getExplicit(common),

    composer:
      cleanPerson(
        firstString(
          common.composer,
        ),
      ),

    copyright:
      cleanMetadataValue(
        firstString(
          common.copyright,
        ),
      ),

    publisher:
      cleanMetadataValue(
        firstString(
          common.label ||
            common.publisher,
        ),
      ),

    description:
      cleanDescription(
        firstString(
          common.comment ||
            common.description,
        ),
      ),

    trackNumber:
      getTrackNumber(
        common,
      ),

    discNumber:
      getDiscNumber(
        common,
      ),

    duration:
      Number.isFinite(
        format.duration,
      ) &&
      format.duration > 0
        ? String(
            Math.max(
              1,
              Math.round(
                format.duration,
              ),
            ),
          )
        : '',

    genres:
      cleanList(
        common.genre ||
          '',
      ),

    tags:
      cleanTags(
        common.tag ||
          common.tags ||
          '',
      ),

    /*
     * Technical information.
     * These are displayed in terminal.
     * The backend itself will extract and
     * store the final technical metadata.
     */
    codec:
      getString(
        format.codec ||
          format.codecProfile,
      ),

    bitrate:
      format.bitrate
        ? String(
            Math.round(
              format.bitrate,
            ),
          )
        : '',

    sampleRate:
      format.sampleRate
        ? String(
            Math.round(
              format.sampleRate,
            ),
          )
        : '',

    bitsPerSample:
      format.bitsPerSample
        ? String(
            Math.round(
              format.bitsPerSample,
            ),
          )
        : '',

    channels:
      format.numberOfChannels
        ? String(
            format.numberOfChannels,
          )
        : String(
            format.channels ||
              '',
          ),
  };

  const cover =
    selectCover(
      common.picture || [],
    );

  return {
    cleaned,

    hasArtwork:
      Boolean(
        cover?.data?.length,
      ),

    artworkMimeType:
      cover?.format || '',

    artworkSize:
      cover?.data?.byteLength ||
      0,
  };
}

/* ============================================================
   PRINT CLEANED METADATA
   ============================================================ */

function printMetadata(
  analysis,
) {
  const {
    cleaned,
    hasArtwork,
    artworkMimeType,
    artworkSize,
  } = analysis;

  console.log(
    `    Title        : ${cleaned.title}`,
  );

  console.log(
    `    Artist       : ${cleaned.artist}`,
  );

  console.log(
    `    Album        : ${cleaned.album}`,
  );

  console.log(
    `    Album Artist : ${
      cleaned.albumArtist ||
      'none'
    }`,
  );

  console.log(
    `    Movie        : ${
      cleaned.movie ||
      'none'
    }`,
  );

  console.log(
    `    Year         : ${
      cleaned.releaseYear ||
      'none'
    }`,
  );

  console.log(
    `    Date         : ${
      cleaned.releaseDate ||
      'none'
    }`,
  );

  console.log(
    `    Language     : ${
      cleaned.language ||
      'none'
    }`,
  );

  console.log(
    `    Explicit     : ${
      cleaned.explicit
        ? 'yes'
        : 'no'
    }`,
  );

  console.log(
    `    Composer     : ${
      cleaned.composer ||
      'none'
    }`,
  );

  console.log(
    `    Copyright    : ${
      cleaned.copyright ||
      'none'
    }`,
  );

  console.log(
    `    Publisher    : ${
      cleaned.publisher ||
      'none'
    }`,
  );

  console.log(
    `    Description  : ${
      cleaned.description ||
      'none'
    }`,
  );

  console.log(
    `    Track No.    : ${
      cleaned.trackNumber ||
      'none'
    }`,
  );

  console.log(
    `    Disc No.     : ${
      cleaned.discNumber ||
      'none'
    }`,
  );

  console.log(
    `    Genre        : ${
      cleaned.genres.join(
        ', ',
      ) || 'none'
    }`,
  );

  console.log(
    `    Tags         : ${
      cleaned.tags.join(
        ', ',
      ) || 'none'
    }`,
  );

  console.log(
    `    Duration     : ${
      cleaned.duration ||
      'unknown'
    } sec`,
  );

  console.log(
    `    Codec        : ${
      cleaned.codec ||
      'unknown'
    }`,
  );

  console.log(
    `    Bitrate      : ${
      cleaned.bitrate ||
      'unknown'
    }`,
  );

  console.log(
    `    Sample Rate  : ${
      cleaned.sampleRate ||
      'unknown'
    }`,
  );

  console.log(
    `    Bits/Sample  : ${
      cleaned.bitsPerSample ||
      'unknown'
    }`,
  );

  console.log(
    `    Channels     : ${
      cleaned.channels ||
      'unknown'
    }`,
  );

  console.log(
    `    Artwork      : ${
      hasArtwork
        ? `${artworkMimeType || 'image'} (${formatBytes(artworkSize)})`
        : 'none'
    }`,
  );
}

/* ============================================================
   SCAN FOLDER
   ============================================================ */

async function collectAudioFiles(
  folder,
  recursive,
) {
  const files = [];

  async function walk(
    currentFolder,
  ) {
    const entries =
      await fs.readdir(
        currentFolder,
        {
          withFileTypes: true,
        },
      );

    entries.sort(
      (
        a,
        b,
      ) =>
        a.name.localeCompare(
          b.name,
          undefined,
          {
            numeric: true,
            sensitivity: 'base',
          },
        ),
    );

    for (
      const entry of entries
    ) {
      if (
        entry.name.startsWith(
          '.',
        )
      ) {
        continue;
      }

      const fullPath =
        path.join(
          currentFolder,
          entry.name,
        );

      if (
        entry.isDirectory()
      ) {
        if (recursive) {
          await walk(
            fullPath,
          );
        }

        continue;
      }

      if (
        !entry.isFile()
      ) {
        continue;
      }

      if (
        getMimeType(
          fullPath,
        )
      ) {
        files.push(
          fullPath,
        );
      }
    }
  }

  await walk(folder);

  return files;
}

/* ============================================================
   PASSWORD INPUT
   ============================================================ */

async function hiddenPasswordPrompt(
  question,
) {
  if (
    !stdin.isTTY ||
    typeof stdin.setRawMode !==
      'function'
  ) {
    const rl =
      readline.createInterface(
        {
          input: stdin,
          output: stdout,
        },
      );

    try {
      return await rl.question(
        question,
      );
    } finally {
      rl.close();
    }
  }

  return new Promise(
    (resolve) => {
      process.stdout.write(
        question,
      );

      let answer = '';

      const onData = (
        chunk,
      ) => {
        const text =
          chunk.toString(
            'utf8',
          );

        for (
          const char of text
        ) {
          if (
            char === '\n' ||
            char === '\r'
          ) {
            process.stdout.write(
              '\n',
            );

            stdin.setRawMode(
              false,
            );

            stdin.pause();

            stdin.removeListener(
              'data',
              onData,
            );

            resolve(answer);

            return;
          }

          if (
            char ===
            '\u0003'
          ) {
            process.stdout.write(
              '\n',
            );

            process.exit(130);
          }

          if (
            char ===
            '\u007f'
          ) {
            if (
              answer.length >
              0
            ) {
              answer =
                answer.slice(
                  0,
                  -1,
                );

              process.stdout.write(
                '\b \b',
              );
            }

            continue;
          }

          answer += char;

          process.stdout.write(
            '*',
          );
        }
      };

      stdin.resume();

      stdin.setRawMode(
        true,
      );

      stdin.on(
        'data',
        onData,
      );
    },
  );
}

/* ============================================================
   LOGIN
   ============================================================ */

async function login(
  baseUrl,
) {
  const existingToken =
    process.env
      .BULK_UPLOAD_TOKEN
      ?.trim();

  if (existingToken) {
    console.log(
      '[AUTH] Using BULK_UPLOAD_TOKEN.',
    );

    return existingToken;
  }

  let email =
    process.env
      .BULK_ADMIN_EMAIL
      ?.trim() ||
    '';

  let password =
    process.env
      .BULK_ADMIN_PASSWORD ||
    '';

  if (!email) {
    const rl =
      readline.createInterface(
        {
          input: stdin,
          output: stdout,
        },
      );

    try {
      email =
        (
          await rl.question(
            'Admin email: ',
          )
        ).trim();
    } finally {
      rl.close();
    }
  }

  if (!password) {
    password =
      await hiddenPasswordPrompt(
        'Admin password: ',
      );
  }

  if (
    !email ||
    !password
  ) {
    throw new Error(
      'Admin email and password are required.',
    );
  }

  console.log(
    '[AUTH] Logging in...',
  );

  const response =
    await fetch(
      `${baseUrl}/api/auth/login`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
          Accept:
            'application/json',
        },

        body: JSON.stringify({
          email,
          password,
        }),
      },
    );

  let body = null;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(
      body?.message ||
        body?.error ||
        `Login failed with HTTP ${response.status}.`,
    );
  }

  if (
    body?.user?.role &&
    body.user.role !==
      'ADMIN'
  ) {
    throw new Error(
      'The account used for bulk upload is not an ADMIN account.',
    );
  }

  if (!body?.token) {
    throw new Error(
      'Login succeeded but the server did not return a token.',
    );
  }

  console.log(
    `[AUTH] Logged in as ${
      body?.user?.email ||
      email
    }.`,
  );

  return body.token;
}

/* ============================================================
   API ERROR
   ============================================================ */

async function readError(
  response,
) {
  try {
    const body =
      await response.json();

    return {
      code: String(
        body?.error || '',
      ),

      message: String(
        body?.message ||
          body?.error ||
          `HTTP ${response.status}`,
      ),
    };
  } catch {
    return {
      code: '',
      message:
        `HTTP ${response.status}`,
    };
  }
}

/* ============================================================
   FORM DATA
   ============================================================ */

function appendIfPresent(
  formData,
  key,
  value,
) {
  if (
    value === undefined ||
    value === null
  ) {
    return;
  }

  const text =
    String(value);

  if (
    text.trim() === '' &&
    key !== 'explicit'
  ) {
    return;
  }

  formData.append(
    key,
    text,
  );
}

/* ============================================================
   UPLOAD ONE SONG
   ============================================================ */

async function uploadOne({
  filePath,
  token,
  baseUrl,
  timeoutMs,
  analysis,
}) {
  const fileName =
    path.basename(
      filePath,
    );

  const mimeType =
    getMimeType(filePath);

  if (!mimeType) {
    throw new Error(
      `Unsupported audio format: ${fileName}`,
    );
  }

  const stat =
    await fs.stat(
      filePath,
    );

  const buffer =
    await fs.readFile(
      filePath,
    );

  const {
    cleaned,
  } = analysis;

  const formData =
    new FormData();

  /*
   * All cleaned descriptive
   * metadata is sent to the
   * same existing admin API.
   */

  appendIfPresent(
    formData,
    'title',
    cleaned.title,
  );

  appendIfPresent(
    formData,
    'artist',
    cleaned.artist,
  );

  appendIfPresent(
    formData,
    'album',
    cleaned.album,
  );

  appendIfPresent(
    formData,
    'albumArtist',
    cleaned.albumArtist,
  );

  appendIfPresent(
    formData,
    'movie',
    cleaned.movie,
  );

  appendIfPresent(
    formData,
    'releaseYear',
    cleaned.releaseYear,
  );

  appendIfPresent(
    formData,
    'releaseDate',
    cleaned.releaseDate,
  );

  appendIfPresent(
    formData,
    'language',
    cleaned.language,
  );

  appendIfPresent(
    formData,
    'explicit',
    String(
      Boolean(
        cleaned.explicit,
      ),
    ),
  );

  appendIfPresent(
    formData,
    'composer',
    cleaned.composer,
  );

  appendIfPresent(
    formData,
    'copyright',
    cleaned.copyright,
  );

  appendIfPresent(
    formData,
    'publisher',
    cleaned.publisher,
  );

  appendIfPresent(
    formData,
    'description',
    cleaned.description,
  );

  appendIfPresent(
    formData,
    'trackNumber',
    cleaned.trackNumber,
  );

  appendIfPresent(
    formData,
    'discNumber',
    cleaned.discNumber,
  );

  appendIfPresent(
    formData,
    'duration',
    cleaned.duration,
  );

  if (
    cleaned.genres.length >
    0
  ) {
    appendIfPresent(
      formData,
      'genres',
      cleaned.genres.join(
        ', ',
      ),
    );
  }

  if (
    cleaned.tags.length >
    0
  ) {
    appendIfPresent(
      formData,
      'tags',
      cleaned.tags.join(
        ', ',
      ),
    );
  }

  /*
   * Audio file.
   *
   * Node 22 supports Blob,
   * FormData and fetch.
   */
  formData.append(
    'audio',
    new Blob(
      [buffer],
      {
        type: mimeType,
      },
    ),
    fileName,
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        `${baseUrl}/api/admin/tracks`,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${token}`,

            Accept:
              'application/json',
          },

          body: formData,

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      const error =
        await readError(
          response,
        );

      return {
        ok: false,
        status:
          response.status,

        code:
          error.code,

        message:
          error.message,

        duplicate:
          response.status ===
            409 &&
          error.code ===
            'DUPLICATE_TRACK',

        inProgress:
          response.status ===
            409 &&
          error.code ===
            'TRACK_OPERATION_IN_PROGRESS',
      };
    }

    const body =
      await response.json();

    return {
      ok: true,

      status:
        response.status,

      bytes:
        stat.size,

      track:
        body?.track ||
        null,

      artwork:
        body?.artwork ||
        null,
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/* ============================================================
   HEADER
   ============================================================ */

function printHeader() {
  console.log('');
  console.log(
    '================================================',
  );
  console.log(
    '             AURA BULK UPLOADER',
  );
  console.log(
    '================================================',
  );
  console.log('');
}

/* ============================================================
   MAIN
   ============================================================ */

async function main() {
  printHeader();

  const baseUrl =
    normalizeBaseUrl(
      getOption(
        '--base-url',
      ) ||
        process.env
          .BULK_UPLOAD_BASE_URL ||
        DEFAULT_BASE_URL,
    );

  const timeoutValue =
    Number(
      getOption(
        '--timeout',
      ) ||
        process.env
          .BULK_UPLOAD_TIMEOUT_MS ||
        DEFAULT_TIMEOUT_MS,
    );

  const timeoutMs =
    Number.isFinite(
      timeoutValue,
    ) &&
    timeoutValue > 0
      ? timeoutValue
      : DEFAULT_TIMEOUT_MS;

  const recursive =
    hasFlag(
      '--recursive',
    );

  const dryRun =
    hasFlag(
      '--dry-run',
    );

  let folder =
    getFolderArgument();

  /*
   * Ask for folder if not
   * supplied in command line.
   */
  if (!folder) {
    const rl =
      readline.createInterface(
        {
          input: stdin,
          output: stdout,
        },
      );

    try {
      folder =
        (
          await rl.question(
            'Songs folder: ',
          )
        ).trim();
    } finally {
      rl.close();
    }
  }

  if (!folder) {
    throw new Error(
      'Songs folder is required.',
    );
  }

  folder =
    path.resolve(
      folder,
    );

  const folderStat =
    await fs
      .stat(folder)
      .catch(() => null);

  if (
    !folderStat?.isDirectory()
  ) {
    throw new Error(
      `Folder does not exist: ${folder}`,
    );
  }

  console.log(
    `[SCAN] Folder    : ${folder}`,
  );

  console.log(
    `[SCAN] Recursive : ${
      recursive
        ? 'yes'
        : 'no'
    }`,
  );

  console.log(
    `[SCAN] API       : ${baseUrl}`,
  );

  console.log('');

  const files =
    await collectAudioFiles(
      folder,
      recursive,
    );

  console.log(
    `[SCAN] Audio files found: ${files.length}`,
  );

  console.log('');

  if (
    files.length ===
    0
  ) {
    console.log(
      'No supported audio files found.',
    );

    return;
  }

  const metadataLibrary =
    await loadMetadataLibrary();

  /*
   * ========================================================
   * DRY RUN
   * ========================================================
   */

  if (dryRun) {
    console.log(
      '[DRY RUN] No upload will happen.',
    );

    console.log(
      '[DRY RUN] Analysing and cleaning metadata...',
    );

    console.log('');

    for (
      let i = 0;
      i < files.length;
      i += 1
    ) {
      const filePath =
        files[i];

      console.log(
        `[${i + 1}/${files.length}] ${path.relative(
          folder,
          filePath,
        )}`,
      );

      try {
        const analysis =
          await analyseAudio(
            filePath,
            metadataLibrary,
          );

        printMetadata(
          analysis,
        );
      } catch (error) {
        console.log(
          `    ✗ Metadata failed: ${
            error?.message ||
            error
          }`,
        );
      }

      console.log('');
    }

    console.log(
      'Dry run complete.',
    );

    return;
  }

  /*
   * ========================================================
   * AUTH
   * ========================================================
   */

  const token =
    await login(
      baseUrl,
    );

  console.log('');

  console.log(
    `[UPLOAD] ${files.length} song(s) queued.`,
  );

  console.log(
    '[UPLOAD] Cleaning ALL descriptive metadata before upload.',
  );

  console.log(
    '[UPLOAD] Upload mode: sequential, one song at a time.',
  );

  console.log('');

  let uploaded = 0;
  let duplicates = 0;
  let failed = 0;

  /*
   * ========================================================
   * SEQUENTIAL UPLOAD
   * ========================================================
   */

  for (
    let i = 0;
    i < files.length;
    i += 1
  ) {
    const filePath =
      files[i];

    const fileName =
      path.basename(
        filePath,
      );

    const relativePath =
      path.relative(
        folder,
        filePath,
      );

    console.log(
      '------------------------------------------------',
    );

    console.log(
      `[${i + 1}/${files.length}] ${relativePath}`,
    );

    try {
      /*
       * 1. Analyse file.
       */
      const analysis =
        await analyseAudio(
          filePath,
          metadataLibrary,
        );

      /*
       * 2. Show cleaned metadata.
       */
      printMetadata(
        analysis,
      );

      console.log(
        '',
      );

      /*
       * 3. Upload through
       *    existing admin endpoint.
       */
      console.log(
        '    [UPLOAD] Sending to backend...',
      );

      const result =
        await uploadOne({
          filePath,

          token,

          baseUrl,

          timeoutMs,

          analysis,
        });

      /*
       * 4. Success.
       */
      if (
        result.ok
      ) {
        uploaded += 1;

        const title =
          result.track?.title ||
          analysis.cleaned.title;

        const artist =
          result.track?.artist ||
          analysis.cleaned.artist;

        const cover =
          result.artwork?.uploaded
            ? 'cover yes'
            : analysis.hasArtwork
              ? 'cover detected'
              : 'cover no';

        console.log('');

        console.log(
          `✓ ${uploaded} upload done | ${title} — ${artist} | ${formatBytes(
            result.bytes,
          )} | ${cover}`,
        );

        continue;
      }

      /*
       * Duplicate.
       */
      if (
        result.duplicate
      ) {
        duplicates += 1;

        console.log('');

        console.log(
          `↷ Duplicate skipped | ${fileName}`,
        );

        continue;
      }

      /*
       * Concurrent operation.
       */
      if (
        result.inProgress
      ) {
        failed += 1;

        console.log('');

        console.log(
          `✗ Operation already in progress | ${fileName}`,
        );

        continue;
      }

      /*
       * Other HTTP error.
       */
      failed += 1;

      console.log('');

      console.log(
        `✗ Upload failed (${result.status}) | ${fileName} | ${result.message}`,
      );
    } catch (error) {
      failed += 1;

      const message =
        error?.name ===
        'AbortError'
          ? `Timed out after ${Math.round(
              timeoutMs / 60000,
            )} minute(s).`
          : error?.message ||
            String(error);

      console.log('');

      console.log(
        `✗ Upload failed | ${fileName} | ${message}`,
      );
    }

    console.log('');
  }

  /*
   * ========================================================
   * SUMMARY
   * ========================================================
   */

  console.log(
    '================================================',
  );

  console.log(
    '                 SUMMARY',
  );

  console.log(
    '================================================',
  );

  console.log(
    `Upload done : ${uploaded}`,
  );

  console.log(
    `Duplicates  : ${duplicates}`,
  );

  console.log(
    `Failed      : ${failed}`,
  );

  console.log(
    `Total       : ${files.length}`,
  );

  console.log(
    '================================================',
  );

  console.log('');

  if (
    uploaded > 0
  ) {
    console.log(
      `✓ ${uploaded} song(s) uploaded successfully.`,
    );
  }

  if (
    duplicates > 0
  ) {
    console.log(
      `↷ ${duplicates} duplicate song(s) skipped.`,
    );
  }

  if (
    failed > 0
  ) {
    console.log(
      `✗ ${failed} song(s) failed.`,
    );
  }
}

/* ============================================================
   START
   ============================================================ */

main().catch(
  (error) => {
    console.error('');

    console.error(
      `Bulk upload stopped: ${
        error?.message ||
        error
      }`,
    );

    console.error('');

    process.exitCode = 1;
  },
);