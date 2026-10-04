import { request } from './client.js';

const publicArtistsApi = {
  /*
  |--------------------------------------------------------------------------
  | LIST ARTISTS FOR NORMAL USERS
  |--------------------------------------------------------------------------
  |
  | This endpoint is READ ONLY.
  |
  | Normal authenticated users can read:
  | - id
  | - name
  | - normalizedName
  | - coverUrl
  | - description
  |
  | They cannot create/update/delete artists.
  |
  |--------------------------------------------------------------------------
  */

  list(token, search = '') {
    const query = search.trim()
      ? `?search=${encodeURIComponent(
          search.trim(),
        )}`
      : '';

    return request(
      `/api/artists${query}`,
      {
        method: 'GET',
      },
      token,
    );
  },

  /*
  |--------------------------------------------------------------------------
  | GET SINGLE ARTIST
  |--------------------------------------------------------------------------
  */

  get(token, id) {
    return request(
      `/api/artists/${id}`,
      {
        method: 'GET',
      },
      token,
    );
  },
};

export default publicArtistsApi;