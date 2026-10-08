import { execFile } from 'node:child_process';

import { promisify } from 'node:util';




import {

  Innertube,

  UniversalCache,

} from 'youtubei.js';

import path from 'node:path';

import fs from 'node:fs/promises';

import os from 'node:os';

import crypto from 'node:crypto';







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

function getYoutubeProxy(): string | null {

  const proxy = process.env.YOUTUBE_PROXY?.trim();

  return proxy || null;

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

async function debugAndroidFormats(

  videoId: string,

  cookieArgs: string[],

): Promise<void> {

  const proxy = getYoutubeProxy();

  try {

    const args = [

      '--js-runtimes',

      'node',

      '--no-playlist',

      '--no-warnings',

      ...cookieArgs,

      ...(proxy ? ['--proxy', proxy] : []),

      '--extractor-args',

      'youtube:player_client=android',

      '-F',

      `https://www.youtube.com/watch?v=${videoId}`,

    ];



    const { stdout, stderr } = await execFileAsync(

      getYtDlpCommand(),

      args,

      {

        timeout: 60_000,

        maxBuffer: 10 * 1024 * 1024,

      },

    );



    console.log(

      `[YouTube DEBUG] Android formats ${videoId}:\n${stdout}`,

    );



    if (stderr) {

      console.log(

        `[YouTube DEBUG] Android stderr ${videoId}:\n${stderr}`,

      );

    }

  } catch (error: any) {

    console.error(

      `[YouTube DEBUG] Android format inspection failed ${videoId}:`,

      error?.message,

    );

  }

}

async function prepareYtDlpCookies(): Promise<{

  args: string[];

  cleanup: () => Promise<void>;

}> {

  const cookiesFile = process.env.YTDLP_COOKIES_FILE;



  if (!cookiesFile) {

    return {

      args: [],

      cleanup: async () => { },

    };

  }



  const tempCookiesFile = path.join(

    os.tmpdir(),

    `vybe-ytdlp-cookies-${crypto.randomUUID()}.txt`,

  );



  await fs.copyFile(cookiesFile, tempCookiesFile);



  return {

    args: ['--cookies', tempCookiesFile],



    cleanup: async () => {

      await fs

        .rm(tempCookiesFile, { force: true })

        .catch(() => { });

    },

  };

}



function getYoutubeStreamCacheKey(

  videoId: string,

  quality: 'low' | 'medium' | 'high',

): string {

  return `youtube:stream:v2:${videoId}:${quality}`;

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

  quality: 'low' | 'medium' | 'high',

  playerClient?: 'android',

): Promise<YoutubeAudioStream> {

  const url = `https://www.youtube.com/watch?v=${videoId}`;



  const proxy = getYoutubeProxy();

  /*
   * When Android resolution runs through the proxy, keep it cookie-free.
   * This avoids combining a browser/session cookie jar with a different
   * production egress IP, which can trigger YouTube's bot/session checks.
   */
  const shouldUseCookies = !(
    playerClient === 'android' &&
    Boolean(proxy)
  );

  const cookies = shouldUseCookies
    ? await prepareYtDlpCookies()
    : {
        args: [],
        cleanup: async () => {},
      };



  try {

    // Android client currently exposes format 18 for videos such as

    // O5gwxm3NxFU in the tested YouTube session.

    const format =

      playerClient === 'android'

        ? '18'

        : quality === 'low'

          ? 'worstaudio/worst'

          : 'bestaudio/best';



    const args: string[] = [

      '--js-runtimes',

      'node',

      '--no-playlist',

      '--no-warnings',

      '--skip-download',

    ];



    if (playerClient) {

      args.push(

        '--extractor-args',

        `youtube:player_client=${playerClient}`,

      );

    }






    args.push(

      ...cookies.args,



      ...(proxy

        ? ['--proxy', proxy]

        : []),



      '-f',

      format,



      '--get-url',

      url,

    );

    console.log(

      `[YouTube] yt-dlp client=${playerClient ?? 'default'} format=${format}`,

    );



    const { stdout } = await execFileAsync(

      getYtDlpCommand(),

      args,

      {

        timeout: 60_000,

        maxBuffer: 10 * 1024 * 1024,

      },

    );



    const mediaUrl = stdout

      .split(/\r?\n/)

      .map((line) => line.trim())

      .find((line) => line.startsWith('http://') || line.startsWith('https://'));



    if (!mediaUrl) {

      throw new Error('yt-dlp returned no media URL');

    }



    return {

      url: mediaUrl,

      source: 'yt-dlp',

      mimeType: 'video/mp4',

      bitrate: null,

      contentLength: null,

      itag: 18,

      codec: 'avc1.42001E/mp4a.40.2',

    };

  } catch (error: any) {

    if (

      playerClient === 'android' &&

      process.env.YTDLP_DEBUG_FORMATS === 'true'

    ) {

      await debugAndroidFormats(

        videoId,

        cookies.args,

      );

    }



    throw error;

  } finally {

    await cookies.cleanup();

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
   * 1. FAST REDIS CACHE LOOKUP
   * ---------------------------------------------------------
   */

  const cached = await getCachedYoutubeAudio(
    cleanId,
    quality,
  );

  if (cached?.url) {
    console.log(
      `[YouTube Cache] HIT ${cleanId} (${quality})`,
    );

    return cached;
  }

  console.log(
    `[YouTube Cache] MISS ${cleanId} (${quality})`,
  );

  /*
   * ---------------------------------------------------------
   * 2. DISTRIBUTED RESOLUTION LOCK
   *
   * Only ONE backend instance/request is allowed to run
   * YouTube resolution for the same video + quality.
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
     * Wait instead of running another yt-dlp process.
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
   * 3. PREVENT AN ENDLESS WAIT
   * ---------------------------------------------------------
   */

  if (!lockToken) {
    throw new Error(
      'YouTube stream resolution is already in progress. Please retry shortly.',
    );
  }

  try {
    /*
     * -------------------------------------------------------
     * 4. CHECK CACHE AGAIN AFTER ACQUIRING LOCK
     *
     * Another request may have populated Redis between
     * our initial cache lookup and acquiring the lock.
     * -------------------------------------------------------
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
     * 5. RESOLVE FRESH YOUTUBE STREAM
     * -------------------------------------------------------
     */

    let resolved: YoutubeAudioStream | null = null;

    /*
     * Check whether a YouTube proxy is configured.
     *
     * Production:
     *   YOUTUBE_PROXY configured
     *
     * Local:
     *   YOUTUBE_PROXY not configured
     */

    const proxyConfigured =
      Boolean(getYoutubeProxy());

    /*
     * -------------------------------------------------------
     * STRATEGY 1
     * YOUTUBEI.JS
     *
     * Only use youtubei.js when NO proxy is configured.
     *
     * When a proxy is configured, skip youtubei.js because
     * the signed media URL can be generated using one egress
     * and subsequently fetched using another egress.
     * -------------------------------------------------------
     */

    if (!proxyConfigured) {
      try {
        console.log(
          `[YouTube] Trying youtubei.js ${cleanId}`,
        );

        const youtubeiStream =
          await tryYoutubeiStream(
            cleanId,
            quality,
          );

        if (youtubeiStream?.url) {
          resolved = youtubeiStream;

          console.log(
            `[YouTube] youtubei.js SUCCESS ${cleanId}`,
          );
        }
      } catch (error: any) {
        console.warn(
          `[YouTube] youtubei.js failed ${cleanId}:`,
          error?.message,
        );
      }
    } else {
      console.log(
        `[YouTube] Proxy configured; skipping youtubei.js for media URL resolution`,
      );
    }

    /*
     * -------------------------------------------------------
     * STRATEGY 2
     * ANDROID + PROXY + NO COOKIES
     *
     * This is the PRIMARY production resolver when
     * YOUTUBE_PROXY is configured.
     *
     * resolveWithYtDlp() already handles:
     *
     *   playerClient = android
     *   proxy = configured
     *   cookies = disabled
     *   format = 18
     *
     * -------------------------------------------------------
     */

    if (!resolved && proxyConfigured) {
      try {
        console.log(
          `[YouTube] Trying Android + proxy + NO cookies ${cleanId}`,
        );

        resolved = await resolveWithYtDlp(
          cleanId,
          quality,
          'android',
        );

        console.log(
          `[YouTube] Android + proxy SUCCESS ${cleanId}`,
        );
      } catch (error: any) {
        console.warn(
          `[YouTube] Android + proxy failed ${cleanId}:`,
          error?.message,
        );
      }
    }

    /*
     * -------------------------------------------------------
     * STRATEGY 3
     * DEFAULT YT-DLP
     *
     * Only use the normal/default yt-dlp resolver when
     * NO proxy is configured.
     *
     * This prevents production from doing:
     *
     *   browser cookies + proxy IP
     *
     * which can cause YouTube session/bot checks.
     * -------------------------------------------------------
     */

    if (!resolved && !proxyConfigured) {
      try {
        const ytDlpAvailable =
          await checkYtDlp();

        if (!ytDlpAvailable) {
          throw new Error(
            'yt-dlp is not available',
          );
        }

        console.log(
          `[YouTube] Trying yt-dlp default client ${cleanId}`,
        );

        resolved = await resolveWithYtDlp(
          cleanId,
          quality,
        );

        console.log(
          `[YouTube] yt-dlp default SUCCESS ${cleanId}`,
        );
      } catch (error: any) {
        console.warn(
          `[YouTube] yt-dlp default failed ${cleanId}:`,
          error?.message,
        );
      }
    }

    /*
     * -------------------------------------------------------
     * 6. FINAL RESOLUTION FAILURE
     * -------------------------------------------------------
     */

    if (!resolved?.url) {
      throw new Error(
        `Unable to resolve a playable YouTube stream for ${cleanId}`,
      );
    }

    /*
     * -------------------------------------------------------
     * 7. STORE FRESH SIGNED URL IN REDIS
     * -------------------------------------------------------
     */

    await cacheYoutubeAudio(
      cleanId,
      quality,
      resolved,
    );

    console.log(
      `[YouTube Cache] STORED ${cleanId} (${quality})`,
    );

    return resolved;
  } finally {
    /*
     * -------------------------------------------------------
     * 8. RELEASE DISTRIBUTED LOCK
     *
     * releaseLock() verifies the lock token, preventing
     * one request from releasing another request's lock.
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

async function debugYoutubeConnection(

  videoId: string,

  cookieArgs: string[],

): Promise<void> {

  const youtubeUrl =

    `https://www.youtube.com/watch?v=${videoId}`;



  console.log(

    `\n========== YOUTUBE RENDER DIAGNOSTIC: ${videoId} ==========`,

  );



  // ---------------------------------------------------------

  // 1. yt-dlp version

  // ---------------------------------------------------------

  try {

    const version = await execFileAsync(

      getYtDlpCommand(),

      ['--version'],

      {

        timeout: 10_000,

      },

    );



    console.log(

      `[YT DEBUG] yt-dlp version: ${String(version.stdout).trim()}`,

    );



    console.log(

      `[YT DEBUG] yt-dlp command: ${getYtDlpCommand()}`,

    );

  } catch (error: any) {

    console.error(

      '[YT DEBUG] yt-dlp unavailable:',

      error?.message,

    );



    return;

  }



  // ---------------------------------------------------------

  // 2. Direct YouTube connectivity

  // ---------------------------------------------------------

  try {

    const response = await fetch(youtubeUrl, {

      method: 'HEAD',

      redirect: 'follow',

    });



    console.log(

      `[YT DEBUG] YouTube HTTPS status: ${response.status}`,

    );



    console.log(

      `[YT DEBUG] YouTube final URL: ${response.url}`,

    );

  } catch (error: any) {

    console.error(

      '[YT DEBUG] YouTube HTTPS connection failed:',

      error?.message,

    );

  }



  // ---------------------------------------------------------

  // 3. Default client formats

  // ---------------------------------------------------------

  try {

    const args = [

      '--js-runtimes',

      'node',

      '--no-playlist',

      '--no-warnings',

      ...cookieArgs,

      '-F',

      youtubeUrl,

    ];



    const { stdout, stderr } =

      await execFileAsync(

        getYtDlpCommand(),

        args,

        {

          timeout: 60_000,

          maxBuffer: 10 * 1024 * 1024,

        },

      );



    console.log(

      `[YT DEBUG] DEFAULT CLIENT FORMATS:\n${stdout}`,

    );



    if (stderr) {

      console.log(

        `[YT DEBUG] DEFAULT CLIENT STDERR:\n${stderr}`,

      );

    }

  } catch (error: any) {

    console.error(

      '[YT DEBUG] Default client format check failed:',

      error?.message,

    );

  }



  // ---------------------------------------------------------

  // 4. Android client formats

  // ---------------------------------------------------------

  try {

    const args = [

      '--js-runtimes',

      'node',

      '--no-playlist',

      '--no-warnings',

      ...cookieArgs,

      '--extractor-args',

      'youtube:player_client=android',

      '-F',

      youtubeUrl,

    ];



    const { stdout, stderr } =

      await execFileAsync(

        getYtDlpCommand(),

        args,

        {

          timeout: 60_000,

          maxBuffer: 10 * 1024 * 1024,

        },

      );



    console.log(

      `[YT DEBUG] ANDROID FORMATS:\n${stdout}`,

    );



    if (stderr) {

      console.log(

        `[YT DEBUG] ANDROID STDERR:\n${stderr}`,

      );

    }

  } catch (error: any) {

    console.error(

      '[YT DEBUG] Android format check failed:',

      error?.message,

    );

  }



  console.log(

    `========== END YOUTUBE RENDER DIAGNOSTIC: ${videoId} ==========\n`,

  );

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
