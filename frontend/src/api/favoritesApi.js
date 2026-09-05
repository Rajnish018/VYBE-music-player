import { request } from './client';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export const favoritesApi = {
  async getAll(token, signal) {
    const data = await request(
      '/api/favorites',
      {
        signal,
      },
      token,
    );

    /*
     * Backend can return:
     *
     * []
     *
     * or:
     *
     * { tracks: [] }
     *
     * but the frontend ALWAYS receives [].
     */
    if (Array.isArray(data)) {
      return data;
    }

    return asArray(data?.tracks);
  },

  add(trackId, token, signal) {
    return request(
      `/api/favorites/${encodeURIComponent(
        trackId,
      )}`,
      {
        method: 'POST',
        signal,
      },
      token,
    );
  },

  remove(trackId, token, signal) {
    return request(
      `/api/favorites/${encodeURIComponent(
        trackId,
      )}`,
      {
        method: 'DELETE',
        signal,
      },
      token,
    );
  },
};
