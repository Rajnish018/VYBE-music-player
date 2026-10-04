import { request } from './client';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export const tracksApi = {
  async getAll(token, signal) {
    const data = await request(
      '/api/tracks',
      { signal },
      token,
    );

    if (Array.isArray(data)) {
      return data;
    }

    return asArray(data?.tracks);
  },

  async getLibrary(token, signal) {
    const data = await request(
      '/api/tracks/library',
      { signal },
      token,
    );

    if (Array.isArray(data)) {
      return data;
    }

    return asArray(data?.tracks);
  },

  async saveToLibrary(trackId, token, signal) {
    const data = await request(
      `/api/tracks/${encodeURIComponent(trackId)}/save`,
      {
        method: 'POST',
        signal,
      },
      token,
    );

    return data;
  },
  async search(
    query,
    token,
    signal,
    source = '',
  ) {
    const params = new URLSearchParams();

    const cleanQuery =
      String(query || '').trim();

    if (cleanQuery) {
      params.set('q', cleanQuery);
    }

    if (source) {
      params.set('source', source);
    }

    const queryString = params.toString();

    const data = await request(
      `/api/tracks/search${queryString ? `?${queryString}` : ''
      }`,
      {
        signal,
      },
      token,
    );

    if (Array.isArray(data)) {
      return data;
    }

    return asArray(data?.tracks);
  },
  async saveYouTube(
    youtubeId,
    token,
    signal,
  ) {
    const data =
      await request(
        '/api/tracks/youtube/save',
        {
          method: 'POST',

          signal,

          body:
            JSON.stringify({
              youtubeId,
            }),
        },
        token,
      );

    return data;
  },
};