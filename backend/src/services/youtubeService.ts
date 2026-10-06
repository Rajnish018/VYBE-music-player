import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  Innertube,
  UniversalCache,
} from 'youtubei.js';
import path from 'node:path';



import redis from '../config/redis';
import {
  acquireLock,
  releaseLock,
} from './distributedLock';
const execFileAsync = promisify(execFile);



/* =========================================================
   TYPES
========================================================= */

export interface YoutubeMetadata {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  duration: number;
}

export interface YoutubeSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  thumbnailUrl: string;
  duration: number;
  sourceUrl: string;

  /*
   * Playback metadata.
   *
   * These fields are required by the frontend player so that
   * YouTube results are routed to:
   *
   * /api/share/youtube/audio?id=VIDEO_ID
   *
   * instead of:
   *
   * /api/tracks/:id/play
   */
  source: 'youtube';
  youtubeId: string;

  playable: boolean;
}

export interface YoutubeAudioStream {
  url: string;
  mimeType: string | null;
  bitrate: number | null;
  contentLength: number | null;
  itag: number | null;
  codec: string | null;
  source:
  | 'youtubei-direct'
  | 'youtubei-decipher'
  | 'yt-dlp';
}


function getYtDlpCommand(): string {
  return process.env.YTDLP_COMMAND || 'yt-dlp';
}

/* =========================================================
 * YOUTUBE STREAM CACHE
 * ========================================================= */

const YOUTUBE_STREAM_CACHE_TTL = 180; // 3 minutes

type CachedYoutubeAudio = {
  url: string;
  mimeType: string | null;
  bitrate: number | null;
  contentLength: number | null;
  itag: number | null;
  codec: string | null;
  source:
    | 'youtubei-direct'
    | 'youtubei-decipher'
    | 'yt-dlp';
};

function getYoutubeStreamCacheKey(
  videoId: string,
  quality: 'low' | 'medium' | 'high',
): string {
  return `youtube:stream:${videoId}:${quality}`;
}

async function getCachedYoutubeAudio(
  videoId: string,
  quality: 'low' | 'medium' | 'high',
): Promise<YoutubeAudioStream | null> {
  const key = getYoutubeStreamCacheKey(videoId, quality);

  try {
    const cached = await redis.get<CachedYoutubeAudio>(key);

    if (!cached?.url) {
      console.log(
        `[YouTube Cache] MISS ${videoId} (${quality})`,
      );

      return null;
    }

    console.log(
      `[YouTube Cache] HIT ${videoId} (${quality})`,
    );

    return {
      url: cached.url,
      mimeType: cached.mimeType ?? null,
      bitrate: cached.bitrate ?? null,
      contentLength: cached.contentLength ?? null,
      itag: cached.itag ?? null,
      codec: cached.codec ?? null,
      source: cached.source,
    };
  } catch (error: any) {
    // Cache failure must NEVER break YouTube playback.
    console.warn(
      `[YouTube Cache] GET failed for ${videoId}:`,
      error?.message,
    );

    return null;
  }
}

async function cacheYoutubeAudio(
  videoId: string,
  quality: 'low' | 'medium' | 'high',
  stream: YoutubeAudioStream,
): Promise<void> {
  const key = getYoutubeStreamCacheKey(videoId, quality);

  try {
    await redis.set(
      key,
      {
        url: stream.url,
        mimeType: stream.mimeType,
        bitrate: stream.bitrate,
        contentLength: stream.contentLength,
        itag: stream.itag,
        codec: stream.codec,
        source: stream.source,
      },
      {
        ex: YOUTUBE_STREAM_CACHE_TTL,
      },
    );

    console.log(
      `[YouTube Cache] STORED ${videoId} (${quality}) TTL=${YOUTUBE_STREAM_CACHE_TTL}s`,
    );
  } catch (error: any) {
    // Cache failure must NEVER break YouTube playback.
    console.warn(
      `[YouTube Cache] SET failed for ${videoId}:`,
      error?.message,
    );
  }
}

export async function invalidateYoutubeAudioCache(
  videoId: string,
  quality: 'low' | 'medium' | 'high',
): Promise<void> {
  const key = getYoutubeStreamCacheKey(videoId, quality);

  try {
    await redis.del(key);

    console.log(
      `[YouTube Cache] INVALIDATED ${videoId} (${quality})`,
    );
  } catch (error: any) {
    console.warn(
      `[YouTube Cache] DELETE failed for ${videoId}:`,
      error?.message,
    );
  }
}


const YOUTUBE_RESOLUTION_LOCK_TTL = 60;
const YOUTUBE_RESOLUTION_LOCK_WAIT_MS = 500;
const YOUTUBE_RESOLUTION_LOCK_MAX_WAIT_MS = 30_000;

function getYoutubeResolutionLockKey(
  videoId: string,
  quality: 'low' | 'medium' | 'high',
): string {
  return `lock:youtube:resolve:${videoId}:${quality}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
/* =========================================================
   YOUTUBE CLIENT
========================================================= */

let ytClient: Innertube | null = null;

async function getYoutubeClient(): Promise<Innertube> {
  if (ytClient) {
    return ytClient;
  }

  console.log('[YouTube] Initializing youtubei.js...');

  ytClient = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    retrieve_player: true,
    fetch: fetch.bind(globalThis),
  });

  console.log('[YouTube] youtubei.js initialized');

  return ytClient;
}

/* =========================================================
   YOUTUBE ID
========================================================= */

export function extractYouTubeVideoId(
  url: string,
): string | null {
  if (!url) {
    return null;
  }

  const value = String(url).trim();

  if (!value) {
    return null;
  }

  /*
   * Direct YouTube video ID
   */
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) {
    return value;
  }

  try {
    const parsedUrl = new URL(
      value.includes('://')
        ? value
        : `https://${value}`,
    );

    const host = parsedUrl.hostname
      .replace(/^www\./, '')
      .toLowerCase();

    /*
     * youtu.be/VIDEO_ID
     */
    if (host === 'youtu.be') {
      const id = parsedUrl.pathname
        .slice(1)
        .split('/')[0];

      return cleanVideoId(id);
    }

    /*
     * youtube.com
     */
    if (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com')
    ) {
      /*
       * Standard:
       * https://www.youtube.com/watch?v=VIDEO_ID
       */
      const queryId = parsedUrl.searchParams.get('v');

      if (queryId) {
        return cleanVideoId(queryId);
      }

      /*
       * Shorts / embed / live / v
       */
      const prefixes = [
        '/shorts/',
        '/embed/',
        '/live/',
        '/v/',
      ];

      for (const prefix of prefixes) {
        if (parsedUrl.pathname.startsWith(prefix)) {
          const id = parsedUrl.pathname
            .slice(prefix.length)
            .split('/')[0];

          return cleanVideoId(id);
        }
      }
    }
  } catch {
    /*
     * Regex fallback below.
     */
  }

  const fallback = value.match(
    /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/|\/v\/)([A-Za-z0-9_-]{11})/i,
  );

  return fallback?.[1] || null;
}

function cleanVideoId(
  id?: string | null,
): string | null {
  if (
    id &&
    /^[A-Za-z0-9_-]{11}$/.test(id)
  ) {
    return id;
  }

  return null;
}

/* =========================================================
   URL / THUMBNAIL
========================================================= */

function youtubeWatchUrl(
  videoId: string,
): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function youtubeThumbnail(
  videoId: string,
): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/* =========================================================
   DURATION
========================================================= */

export function parseISO8601Duration(
  durationStr: string,
): number {
  const regex =
    /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;

  const matches = durationStr.match(regex);

  if (!matches) {
    return 0;
  }

  const hours = parseInt(
    matches[1] || '0',
    10,
  );

  const minutes = parseInt(
    matches[2] || '0',
    10,
  );

  const seconds = parseInt(
    matches[3] || '0',
    10,
  );

  return (
    hours * 3600 +
    minutes * 60 +
    seconds
  );
}

/* =========================================================
   DURATION NORMALIZER
========================================================= */

function normalizeDuration(
  value: unknown,
): number {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return 0;
    }

    /*
     * ISO 8601:
     * PT3M45S
     */
    if (trimmed.startsWith('PT')) {
      return parseISO8601Duration(trimmed);
    }

    /*
     * MM:SS
     */
    if (/^\d+:\d{2}$/.test(trimmed)) {
      const parts = trimmed
        .split(':')
        .map(Number);

      return (
        parts[0] * 60 +
        parts[1]
      );
    }

    /*
     * HH:MM:SS
     */
    if (/^\d+:\d{2}:\d{2}$/.test(trimmed)) {
      const parts = trimmed
        .split(':')
        .map(Number);

      return (
        parts[0] * 3600 +
        parts[1] * 60 +
        parts[2]
      );
    }

    const numeric = Number(trimmed);

    if (Number.isFinite(numeric)) {
      return Math.max(
        0,
        Math.floor(numeric),
      );
    }
  }

  return 0;
}

/* =========================================================
   SEARCH HELPERS
========================================================= */

function getThumbnailFromSearchItem(
  item: any,
  videoId: string,
): string {
  /*
   * youtubei.js thumbnail object
   */
  const thumbnails =
    item?.thumbnails ||
    item?.thumbnail?.thumbnails ||
    item?.thumbnail;

  if (Array.isArray(thumbnails)) {
    const preferred =
      thumbnails.find(
        (thumbnail: any) =>
          thumbnail?.width >= 300,
      ) ||
      thumbnails[0];

    if (preferred?.url) {
      return String(preferred.url);
    }
  }

  if (
    typeof thumbnails === 'object' &&
    thumbnails?.url
  ) {
    return String(thumbnails.url);
  }

  return youtubeThumbnail(videoId);
}

function getText(
  value: any,
): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value?.text === 'string') {
    return value.text;
  }

  if (
    Array.isArray(value?.runs) &&
    value.runs.length
  ) {
    return value.runs
      .map(
        (run: any) =>
          run?.text || '',
      )
      .join('');
  }

  return String(value);
}

function getAuthorName(
  item: any,
): string {
  return (
    getText(item?.author?.name) ||
    getText(item?.author) ||
    getText(item?.owner_text) ||
    getText(item?.short_byline_text) ||
    'Unknown artist'
  );
}

function getDurationFromSearchItem(
  item: any,
): number {
  /*
   * youtubei.js commonly exposes:
   *
   * item.duration.text
   *
   * or:
   *
   * item.duration.seconds
   */

  const durationSeconds =
    item?.duration?.seconds ??
    item?.duration_seconds;

  if (
    typeof durationSeconds === 'number'
  ) {
    return Math.max(
      0,
      Math.floor(durationSeconds),
    );
  }

  const durationText =
    getText(item?.duration?.text) ||
    getText(item?.length_text);

  return normalizeDuration(
    durationText,
  );
}

/* =========================================================
   AUDIO FORMAT HELPERS
========================================================= */

function getAllFormats(
  info: any,
): any[] {
  const streamingData =
    info?.streaming_data;

  if (!streamingData) {
    return [];
  }

  return [
    ...(streamingData.adaptive_formats ||
      []),
    ...(streamingData.formats ||
      []),
  ];
}

function isAudioFormat(
  format: any,
): boolean {
  const mime =
    format?.mime_type ||
    format?.mimeType ||
    '';

  return String(mime).startsWith(
    'audio/',
  );
}

function selectAudioFormat(
  info: any,
  quality:
    | 'low'
    | 'medium'
    | 'high' = 'high',
): any | null {
  const audioFormats =
    getAllFormats(info)
      .filter(isAudioFormat);

  if (!audioFormats.length) {
    return null;
  }

  const sorted = [
    ...audioFormats,
  ].sort(
    (a, b) =>
      Number(b?.bitrate || 0) -
      Number(a?.bitrate || 0),
  );

  if (quality === 'low') {
    return sorted[
      sorted.length - 1
    ];
  }

  if (quality === 'medium') {
    return sorted[
      Math.min(
        1,
        sorted.length - 1,
      )
    ];
  }

  return sorted[0];
}

/* =========================================================
   YOUTUBEI.JS AUDIO STREAM
========================================================= */

async function tryYoutubeiStream(
  videoId: string,
  quality:
    | 'low'
    | 'medium'
    | 'high' = 'high',
): Promise<YoutubeAudioStream | null> {
  try {
    const yt =
      await getYoutubeClient();

    const info =
      await yt.getBasicInfo(
        videoId,
      );

    if (!info?.streaming_data) {
      return null;
    }

    let format =
      selectAudioFormat(
        info,
        quality,
      );

    /*
     * Let youtubei.js choose the
     * best/worst audio format when
     * possible.
     */
    try {
      const selected =
        info.chooseFormat({
          type: 'audio',
          quality:
            quality === 'low'
              ? 'worst'
              : 'best',
        });

      if (selected) {
        format = selected;
      }
    } catch {
      /*
       * Use manually selected
       * format.
       */
    }

    if (!format) {
      return null;
    }

    /*
     * Direct URL
     */
    if (format.url) {
      return {
        url: format.url,

        mimeType:
          format.mime_type ||
          format.mimeType ||
          null,

        bitrate:
          format.bitrate ||
          null,

        contentLength:
          format.content_length ||
          format.contentLength ||
          null,

        itag:
          format.itag ||
          null,

        codec:
          format.codec ||
          null,

        source:
          'youtubei-direct',
      };
    }

    /*
     * Ciphered URL
     */
    const cipher =
      format.signature_cipher ||
      format.signatureCipher ||
      format.cipher;

    if (!cipher) {
      return null;
    }

    if (!yt.session?.player) {
      return null;
    }

    try {
      const streamUrl =
        await format.decipher(
          yt.session.player,
        );

      if (!streamUrl) {
        return null;
      }

      return {
        url: streamUrl,

        mimeType:
          format.mime_type ||
          format.mimeType ||
          null,

        bitrate:
          format.bitrate ||
          null,

        contentLength:
          format.content_length ||
          format.contentLength ||
          null,

        itag:
          format.itag ||
          null,

        codec:
          format.codec ||
          null,

        source:
          'youtubei-decipher',
      };
    } catch (error: any) {
      console.log(
        '[YouTube] decipher failed:',
        error?.message,
      );

      return null;
    }
  } catch (error: any) {
    console.log(
      '[YouTube] youtubei stream failed:',
      error?.message,
    );

    return null;
  }
}

/* =========================================================
   YT-DLP
========================================================= */

async function checkYtDlp(): Promise<boolean> {
  const command = getYtDlpCommand();

  try {
    const result = await execFileAsync(
      command,
      ['--version'],
      {
        timeout: 10000,
      },
    );

    const version =
      String(result.stdout || '').trim();

    console.log(
      '[YouTube] yt-dlp:',
      version,
    );

    console.log(
      '[YouTube] yt-dlp path:',
      command,
    );

    return true;
  } catch (error: any) {
    console.error(
      '[YouTube] yt-dlp check failed:',
      error?.message,
    );

    console.error(
      '[YouTube] yt-dlp path:',
      command,
    );

    return false;
  }
}


async function resolveWithYtDlp(
  videoId: string,
  quality: 'low' | 'medium' | 'high' = 'high',
): Promise<YoutubeAudioStream> {
  const command = getYtDlpCommand();
  const url = youtubeWatchUrl(videoId);

  const format =
    quality === 'low'
      ? 'worstaudio/worst'
      : 'bestaudio/best';

  console.log('[YouTube] yt-dlp path:', command);
  console.log(`[YouTube] Running yt-dlp: ${format}`);

  const args: string[] = [
    '--js-runtimes',
    'node',

    '--no-playlist',
    '--no-warnings',
    '--skip-download',

    '-f',
    format,

    '--get-url',

    url,
  ];

  try {
    const result = await execFileAsync(command, args, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const stdout = String(result.stdout || '').trim();

    const streamUrl = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) =>
          line.startsWith('http://') ||
          line.startsWith('https://'),
      );

    if (!streamUrl) {
      throw new Error(
        'yt-dlp did not return a stream URL',
      );
    }

    const parsedUrl = new URL(streamUrl);

    let mimeType = 'audio/webm';

    const mime = parsedUrl.searchParams.get('mime');

    if (mime && mime.startsWith('audio/')) {
      mimeType = mime;
    }

    return {
      url: streamUrl,
      mimeType,
      bitrate: null,
      contentLength: null,
      itag: null,
      codec: null,
      source: 'yt-dlp',
    };
  } catch (error: any) {
    console.error(
      '[YouTube] yt-dlp failed:',
      error?.message,
    );

    /*
     * IMPORTANT:
     *
     * Do NOT install, clone, rebuild, or update
     * the bgutil provider here.
     *
     * The provider is installed and compiled
     * during the Render build and started by
     * start-production.sh.
     */

    throw error;
  }
}
export async function resolveYouTubeAudio(
  videoId: string,
  quality:
    | 'low'
    | 'medium'
    | 'high' = 'high',
): Promise<YoutubeAudioStream> {
  const cleanId = extractYouTubeVideoId(videoId);

  if (!cleanId) {
    throw new Error('Invalid YouTube video ID');
  }

  /*
   * ---------------------------------------------------------
   * 1. Fast Redis cache lookup
   * ---------------------------------------------------------
   */

  const cached = await getCachedYoutubeAudio(
    cleanId,
    quality,
  );

  if (cached?.url) {
    return cached;
  }

  /*
   * ---------------------------------------------------------
   * 2. Distributed resolution lock
   *
   * Only ONE backend instance/request is allowed to run
   * youtubei.js / yt-dlp for this video + quality.
   * ---------------------------------------------------------
   */

  const lockKey = getYoutubeResolutionLockKey(
    cleanId,
    quality,
  );

  const startedAt = Date.now();

  let lockToken: string | null = null;

  while (
    Date.now() - startedAt <
    YOUTUBE_RESOLUTION_LOCK_MAX_WAIT_MS
  ) {
    lockToken = await acquireLock(
      lockKey,
      YOUTUBE_RESOLUTION_LOCK_TTL,
    );

    /*
     * We acquired the lock.
     */
    if (lockToken) {
      console.log(
        `[YouTube Lock] ACQUIRED ${cleanId} (${quality})`,
      );

      break;
    }

    /*
     * Another request is already resolving this video.
     *
     * Wait for it to populate Redis instead of running
     * yt-dlp ourselves.
     */

    console.log(
      `[YouTube Lock] WAIT ${cleanId} (${quality})`,
    );

    await sleep(
      YOUTUBE_RESOLUTION_LOCK_WAIT_MS,
    );

    /*
     * Check Redis again after waiting.
     */

    const resolvedByAnotherRequest =
      await getCachedYoutubeAudio(
        cleanId,
        quality,
      );

    if (resolvedByAnotherRequest?.url) {
      console.log(
        `[YouTube Lock] RESOLVED BY OTHER REQUEST ${cleanId} (${quality})`,
      );

      return resolvedByAnotherRequest;
    }
  }

  /*
   * ---------------------------------------------------------
   * 3. Prevent an endless wait
   * ---------------------------------------------------------
   */

  if (!lockToken) {
    throw new Error(
      'YouTube stream resolution is already in progress. Please retry shortly.',
    );
  }

  try {
    /*
     * IMPORTANT:
     *
     * The cache may have been populated between our first
     * cache check and acquiring the lock.
     *
     * Always check Redis again after acquiring the lock.
     */

    const cachedAfterLock =
      await getCachedYoutubeAudio(
        cleanId,
        quality,
      );

    if (cachedAfterLock?.url) {
      console.log(
        `[YouTube Lock] CACHE FILLED BEFORE RESOLUTION ${cleanId} (${quality})`,
      );

      return cachedAfterLock;
    }

    /*
     * -------------------------------------------------------
     * 4. Resolve fresh stream
     * -------------------------------------------------------
     */

    let resolved: YoutubeAudioStream | null = null;

    /*
     * First: youtubei.js
     */

    try {
      const youtubeiStream =
        await tryYoutubeiStream(
          cleanId,
          quality,
        );

      if (youtubeiStream?.url) {
        resolved = youtubeiStream;
      }
    } catch (error: any) {
      console.log(
        '[YouTube] youtubei failed:',
        error?.message,
      );
    }

    /*
     * Second: yt-dlp
     */

    if (!resolved) {
      const ytDlpAvailable =
        await checkYtDlp();

      if (!ytDlpAvailable) {
        throw new Error(
          'yt-dlp is not available',
        );
      }

      resolved =
        await resolveWithYtDlp(
          cleanId,
          quality,
        );
    }

    /*
     * -------------------------------------------------------
     * 5. Store fresh signed URL in Redis
     * -------------------------------------------------------
     */

    await cacheYoutubeAudio(
      cleanId,
      quality,
      resolved,
    );

    return resolved;
  } finally {
    /*
     * -------------------------------------------------------
     * 6. Release lock safely
     *
     * releaseLock verifies the token, so one request cannot
     * accidentally release another request's lock.
     * -------------------------------------------------------
     */

    try {
      await releaseLock(
        lockKey,
        lockToken,
      );

      console.log(
        `[YouTube Lock] RELEASED ${cleanId} (${quality})`,
      );
    } catch (error: any) {
      console.error(
        `[YouTube Lock] RELEASE FAILED ${cleanId} (${quality}):`,
        error?.message,
      );
    }
  }
}

/* =========================================================
   YOUTUBE SERVICE
   NO YOUTUBE DATA API
   NO API KEY
========================================================= */

export class YoutubeService {

  /* =======================================================
     SEARCH VIDEOS
  ======================================================= */

  async searchVideos(
    query: string,
    limit = 12,
  ): Promise<YoutubeSearchResult[]> {
    const cleanQuery =
      query.trim();

    if (!cleanQuery) {
      return [];
    }

    const yt =
      await getYoutubeClient();

    /*
     * If user searches by a YouTube URL,
     * return that exact video.
     */
    const videoId =
      extractYouTubeVideoId(
        cleanQuery,
      );

    if (videoId) {
      try {
        const metadata =
          await this.getVideoMetadata(
            videoId,
          );

        return [
          {
            id: videoId,

            title:
              metadata.title,

            artist:
              metadata.channelTitle,

            album:
              'YouTube',

            thumbnailUrl:
              metadata.thumbnailUrl,

            duration:
              metadata.duration,

            sourceUrl:
              youtubeWatchUrl(
                videoId,
              ),

            /*
             * IMPORTANT:
             * Preserve YouTube identity
             * for frontend playback.
             */
            source: 'youtube',

            youtubeId: videoId,

            /*
             * Search results only identify the YouTube video.
             * The backend audio resolver must validate an actual
             * playable stream before playback is considered ready.
             */
            playable: false,
          },
        ];
      } catch {
        return [];
      }
    }

    /*
     * youtubei.js search.
     *
     * No YOUTUBE_API_KEY.
     */
    console.log(
      '[YouTube] Searching:',
      cleanQuery,
    );

    const searchResponse =
      await yt.search(
        cleanQuery,
      );

    const results =
      (searchResponse as any)
        ?.results || [];

    const output: YoutubeSearchResult[] =
      [];

    for (
      const item of results
    ) {
      /*
       * Search results can contain
       * channels/playlists/etc.
       *
       * We only want videos.
       */
      const itemType =
        item?.type;

      const id =
        typeof item?.id === 'string'
          ? item.id
          : null;

      if (!id) {
        continue;
      }

      /*
       * VideoNode normally has type "Video".
       */
      if (
        itemType &&
        String(itemType)
          .toLowerCase() !==
        'video'
      ) {
        continue;
      }

      const title =
        getText(
          item?.title,
        ).trim();

      if (!title) {
        continue;
      }

      const artist =
        getAuthorName(item);

      const duration =
        getDurationFromSearchItem(
          item,
        );

      const thumbnailUrl =
        getThumbnailFromSearchItem(
          item,
          id,
        );

      output.push({
        id,

        title,

        artist,

        album:
          'YouTube',

        thumbnailUrl,

        duration,

        sourceUrl:
          youtubeWatchUrl(id),

        /*
         * IMPORTANT:
         * Tell the frontend that this
         * result belongs to YouTube.
         */
        source: 'youtube',

        /*
         * IMPORTANT:
         * The YouTube video ID is required
         * by PlayerContext to build:
         *
         * /api/share/youtube/audio?id=VIDEO_ID
         */
        youtubeId: id,

        /*
         * Search results do not guarantee that an audio stream
         * can currently be resolved. Playback is handled by the
         * backend audio resolver when the user actually plays it.
         */
        playable: false,
      });

      if (
        output.length >=
        Math.min(
          Math.max(limit, 1),
          25,
        )
      ) {
        break;
      }
    }

    console.log(
      `[YouTube] Search returned ${output.length} videos`,
    );

    return output;
  }

  /* =======================================================
     VIDEO METADATA
  ======================================================= */

  async getVideoMetadata(
    videoId: string,
  ): Promise<YoutubeMetadata> {
    const cleanId =
      extractYouTubeVideoId(
        videoId,
      );

    if (!cleanId) {
      throw new Error(
        'Invalid YouTube video ID',
      );
    }

    const yt =
      await getYoutubeClient();

    console.log(
      '[YouTube] Getting metadata:',
      cleanId,
    );

    const info =
      await yt.getBasicInfo(
        cleanId,
      );

    /*
     * youtubei.js basic info
     */
    const basicInfo =
      info as any;

    const title =
      getText(
        basicInfo?.basic_info?.title,
      ).trim() ||
      'Untitled video';

    const channelTitle =
      getText(
        basicInfo?.basic_info
          ?.author,
      ).trim() ||
      'Unknown artist';

    let duration =
      normalizeDuration(
        basicInfo?.basic_info
          ?.duration,
      );

    /*
     * Some youtubei.js versions
     * expose duration differently.
     */
    if (!duration) {
      duration =
        normalizeDuration(
          basicInfo?.basic_info
            ?.length_seconds,
        );
    }

    if (!duration) {
      duration =
        normalizeDuration(
          basicInfo?.basic_info
            ?.duration_seconds,
        );
    }

    const thumbnailUrl =
      getThumbnailFromInfo(
        basicInfo,
        cleanId,
      );

    return {
      videoId: cleanId,

      title,

      channelTitle,

      thumbnailUrl,

      duration,
    };
  }
}

/* =========================================================
   METADATA THUMBNAIL
========================================================= */

function getThumbnailFromInfo(
  info: any,
  videoId: string,
): string {
  const basicInfo =
    info?.basic_info;

  const thumbnails =
    basicInfo?.thumbnail
      ?.thumbnails ||
    basicInfo?.thumbnail ||
    info?.video_details
      ?.thumbnail
      ?.thumbnails;

  if (Array.isArray(thumbnails)) {
    const preferred =
      thumbnails.find(
        (thumbnail: any) =>
          thumbnail?.width >= 300,
      ) ||
      thumbnails[0];

    if (preferred?.url) {
      return String(
        preferred.url,
      );
    }
  }

  if (
    typeof thumbnails === 'object' &&
    thumbnails?.url
  ) {
    return String(
      thumbnails.url,
    );
  }

  return youtubeThumbnail(
    videoId,
  );
}

/* =========================================================
   SINGLETON
========================================================= */

export const youtubeService =
  new YoutubeService();
