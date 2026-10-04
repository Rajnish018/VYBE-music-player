import AsyncStorage from '@react-native-async-storage/async-storage';

/* -------------------------------------------------------------------------- */
/* API BASE URL                                                               */
/* -------------------------------------------------------------------------- */

export const API_BASE_URL = String(
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:3000'
).replace(/\/+$/, '');

const TOKEN_KEY = 'mega_music_token';
const USER_KEY = 'mega_music_user';

// console.log('[API] API_BASE_URL:', API_BASE_URL);

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class ApiError extends Error {
  constructor(status, message, options = {}) {
    super(message);

    this.name = 'ApiError';
    this.status = status;
    this.code = options.code || '';
    this.details = options.details || null;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

/* -------------------------------------------------------------------------- */
/* URL helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Convert any backend/client URL into a usable mobile URL.
 *
 * Handles:
 *
 * 1. Relative:
 *    /uploads/artists/a.jpg
 *
 * 2. Normal absolute:
 *    https://api.example.com/uploads/a.jpg
 *
 * 3. Markdown accidentally returned by backend:
 *    [http://localhost:3000/a.jpg](http://localhost:3000/a.jpg)
 *
 * 4. Backend returning localhost:
 *    http://localhost:3000/a.jpg
 *
 * 5. Backend returning 127.0.0.1:
 *    http://127.0.0.1:3000/a.jpg
 *
 * 6. Backend returning 0.0.0.0:
 *    http://0.0.0.0:3000/a.jpg
 */
export function normalizeRemoteUrl(value) {
  if (!value) {
    return '';
  }

  let raw = String(value).trim();

  if (!raw) {
    return '';
  }

  /* ---------------------------------------------------------------------- */
  /* Remove accidental Markdown URL                                         */
  /* ---------------------------------------------------------------------- */

  const markdownMatch = raw.match(
    /^\[(.*?)\]\((https?:\/\/.+?)\)$/
  );

  if (markdownMatch) {
    raw = markdownMatch[2];
  }

  /* ---------------------------------------------------------------------- */
  /* Resolve URL                                                            */
  /* ---------------------------------------------------------------------- */

  try {
    const base = new URL(API_BASE_URL);

    /* -------------------------------------------------------------------- */
    /* Relative URL                                                         */
    /* -------------------------------------------------------------------- */

    if (!/^https?:\/\//i.test(raw)) {
      return new URL(
        `/${raw.replace(/^\/+/, '')}`,
        base
      ).toString();
    }

    /* -------------------------------------------------------------------- */
    /* Absolute URL                                                         */
    /* -------------------------------------------------------------------- */

    const parsed = new URL(raw);

    /* -------------------------------------------------------------------- */
    /* Replace backend localhost                                             */
    /* -------------------------------------------------------------------- */

    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0'
    ) {
      parsed.protocol = base.protocol;
      parsed.hostname = base.hostname;
      parsed.port = base.port;
    }

    return parsed.toString();
  } catch (error) {
    console.warn(
      '[API] Invalid remote URL:',
      value,
      error?.message || error
    );

    return '';
  }
}

/**
 * Build an API URL.
 *
 * Used for normal API requests.
 */
function url(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}/${String(path).replace(/^\/+/, '')}`;
}

/* -------------------------------------------------------------------------- */
/* Response parser                                                            */
/* -------------------------------------------------------------------------- */

async function parse(res) {
  if (res.status === 204) {
    return null;
  }

  const contentType =
    res.headers.get('content-type') || '';

  if (contentType.includes('json')) {
    return res.json().catch(() => null);
  }

  const text = await res.text().catch(() => '');

  try {
    return JSON.parse(text);
  } catch {
    return text || null;
  }
}

/* -------------------------------------------------------------------------- */
/* Generic request                                                            */
/* -------------------------------------------------------------------------- */

export async function request(
  path,
  {
    method = 'GET',
    body,
    signal,
    timeout = 15000,
    headers = {},
  } = {},
  token = ''
) {
  const h = {
    Accept: 'application/json',
    ...headers,
  };

  if (token) {
    h.Authorization = `Bearer ${token}`;
  }

  const isForm =
    body &&
    typeof FormData !== 'undefined' &&
    body instanceof FormData;

  if (
    body != null &&
    !isForm &&
    !h['Content-Type']
  ) {
    h['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  const onAbort = () => {
    controller.abort();
  };

  if (signal) {
    signal.addEventListener(
      'abort',
      onAbort,
      { once: true }
    );
  }

  try {
    const requestUrl = url(path);

    console.log(
      `[API] ${method} ${requestUrl}`
    );

    const res = await fetch(requestUrl, {
      method,
      headers: h,
      body,
      signal: controller.signal,
    });

    const data = await parse(res);

    if (!res.ok) {
      throw new ApiError(
        res.status,
        data?.message ||
          data?.error ||
          `Request failed (${res.status})`,
        {
          code: data?.error,
          details: data?.details,
        }
      );
    }

    return data;
  } catch (e) {
    if (e instanceof ApiError) {
      throw e;
    }

    if (e?.name === 'AbortError') {
      throw new ApiError(
        408,
        'Request timed out.'
      );
    }

    console.error(
      '[API] Request failed:',
      e?.message || e
    );

    throw new ApiError(
      0,
      'Unable to connect to the server. Check the API URL and network.'
    );
  } finally {
    clearTimeout(timer);

    if (signal) {
      signal.removeEventListener(
        'abort',
        onAbort
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Session                                                                    */
/* -------------------------------------------------------------------------- */

export async function saveSession(
  token,
  user
) {
  await AsyncStorage.multiSet([
    [
      TOKEN_KEY,
      token || '',
    ],
    [
      USER_KEY,
      JSON.stringify(user || null),
    ],
  ]);
}

export async function loadSession() {
  const values =
    await AsyncStorage.multiGet([
      TOKEN_KEY,
      USER_KEY,
    ]);

  let user = null;

  try {
    user = values[1][1]
      ? JSON.parse(values[1][1])
      : null;
  } catch {
    user = null;
  }

  return {
    token: values[0][1] || '',
    user,
  };
}

export async function clearSession() {
  await AsyncStorage.multiRemove([
    TOKEN_KEY,
    USER_KEY,
  ]);
}

/* -------------------------------------------------------------------------- */
/* Auth API                                                                   */
/* -------------------------------------------------------------------------- */

export const authApi = {
  login: (
    credentials,
    signal
  ) =>
    request(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
        signal,
      }
    ),

  register: (
    credentials,
    signal
  ) =>
    request(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
        signal,
      }
    ),

  me: (
    token,
    signal
  ) =>
    request(
      '/api/auth/me',
      {
        signal,
      },
      token
    ),

  logout: (
    token,
    signal
  ) =>
    request(
      '/api/auth/logout',
      {
        method: 'POST',
        signal,
      },
      token
    ),
};

/* -------------------------------------------------------------------------- */
/* Tracks API                                                                 */
/* -------------------------------------------------------------------------- */

export const tracksApi = {
  library: (
    token,
    signal
  ) =>
    request(
      '/api/tracks/library',
      {
        signal,
      },
      token
    ).then((data) => {
     

      return Array.isArray(data)
        ? data
        : data?.tracks || [];
    }),

  all: (
    token,
    signal
  ) =>
    request(
      '/api/tracks',
      {
        signal,
      },
      token
    ).then((data) =>
      Array.isArray(data)
        ? data
        : data?.tracks || []
    ),

  search: (
    q,
    token,
    source = '',
    signal
  ) => {
    const params =
      new URLSearchParams();

    if (q?.trim()) {
      params.set(
        'q',
        q.trim()
      );
    }

    if (source) {
      params.set(
        'source',
        source
      );
    }

    return request(
      `/api/tracks/search?${params.toString()}`,
      {
        signal,
      },
      token
    ).then((data) =>
      Array.isArray(data)
        ? data
        : data?.tracks || []
    );
  },

  save: (
    id,
    token
  ) =>
    request(
      `/api/tracks/${encodeURIComponent(id)}/save`,
      {
        method: 'POST',
      },
      token
    ),

  saveYouTube: (
    youtubeId,
    token
  ) =>
    request(
      '/api/tracks/youtube/save',
      {
        method: 'POST',
        body: JSON.stringify({
          youtubeId,
        }),
      },
      token
    ),

  streamUrl: (
    track,
    token
  ) => {
    if (track?.audioUrl) {
      return normalizeRemoteUrl(
        track.audioUrl
      );
    }

    if (
      track?.source === 'youtube' &&
      track?.youtubeId
    ) {
      return `${API_BASE_URL}/api/share/youtube/audio?id=${encodeURIComponent(
        track.youtubeId
      )}`;
    }

    if (
      track?.id &&
      token
    ) {
      return `${API_BASE_URL}/api/tracks/${encodeURIComponent(
        track.id
      )}/play?token=${encodeURIComponent(
        token
      )}`;
    }

    return '';
  },
};

/* -------------------------------------------------------------------------- */
/* Favorites API                                                              */
/* -------------------------------------------------------------------------- */

export const favoritesApi = {
  all: (
    token
  ) =>
    request(
      '/api/favorites',
      {},
      token
    ).then((data) =>
      Array.isArray(data)
        ? data
        : data?.tracks || []
    ),

  add: (
    id,
    token
  ) =>
    request(
      `/api/favorites/${encodeURIComponent(id)}`,
      {
        method: 'POST',
      },
      token
    ),

  remove: (
    id,
    token
  ) =>
    request(
      `/api/favorites/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
      token
    ),
};

/* -------------------------------------------------------------------------- */
/* Artists API                                                                */
/* -------------------------------------------------------------------------- */

export const artistsApi = {
  list: (
    token,
    search = ''
  ) => {
    const query = search
      ? `?search=${encodeURIComponent(search)}`
      : '';

    return request(
      `/api/artists${query}`,
      {},
      token
    ).then((data) => {
      /*
       * Normalize artist artwork immediately
       * after receiving the backend response.
       */
      const artists =
        Array.isArray(data?.artists)
          ? data.artists
          : Array.isArray(data)
            ? data
            : [];

      const normalizedArtists =
        artists.map((artist) => ({
          ...artist,

          coverUrl:
            normalizeRemoteUrl(
              artist?.coverUrl ||
                artist?.cover
            ),
        }));

      console.log(
        '[API] Artists:',
        JSON.stringify(
          normalizedArtists,
          null,
          2
        )
      );

      /*
       * Preserve backend response shape.
       */
      if (
        data &&
        !Array.isArray(data)
      ) {
        return {
          ...data,
          artists:
            normalizedArtists,
        };
      }

      return normalizedArtists;
    });
  },

  get: (
    token,
    id
  ) =>
    request(
      `/api/artists/${encodeURIComponent(id)}`,
      {},
      token
    ).then((data) => {
      if (!data) {
        return data;
      }

      /*
       * Handle:
       *
       * { artist: {...} }
       *
       * or
       *
       * {...artist fields...}
       */
      if (data.artist) {
        return {
          ...data,
          artist: {
            ...data.artist,
            coverUrl:
              normalizeRemoteUrl(
                data.artist.coverUrl ||
                  data.artist.cover
              ),
          },
        };
      }

      return {
        ...data,
        coverUrl:
          normalizeRemoteUrl(
            data.coverUrl ||
              data.cover
          ),
      };
    }),
};

/* -------------------------------------------------------------------------- */
/* Admin Artists API                                                          */
/* -------------------------------------------------------------------------- */

export const adminArtistsApi = {
  list: (
    token,
    search = ''
  ) => {
    const query = search
      ? `?search=${encodeURIComponent(search)}`
      : '';

    return request(
      `/api/admin/artists${query}`,
      {},
      token
    ).then((data) => {
      const artists =
        Array.isArray(data?.artists)
          ? data.artists
          : Array.isArray(data)
            ? data
            : [];

      const normalized =
        artists.map((artist) => ({
          ...artist,
          coverUrl:
            normalizeRemoteUrl(
              artist?.coverUrl ||
                artist?.cover
            ),
        }));

      if (
        data &&
        !Array.isArray(data)
      ) {
        return {
          ...data,
          artists: normalized,
        };
      }

      return normalized;
    });
  },
};

/* -------------------------------------------------------------------------- */
/* Admin API                                                                  */
/* -------------------------------------------------------------------------- */

export const adminApi = {
  uploadTrack: (
    formData,
    token
  ) =>
    request(
      '/api/admin/tracks',
      {
        method: 'POST',
        body: formData,
        timeout: 120000,
      },
      token
    ),
};