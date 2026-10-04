import { request } from './client.js';

const artistsApi = {
  /*
  |--------------------------------------------------------------------------
  | LIST
  |--------------------------------------------------------------------------
  */

  list(token, search = '') {
    const query = search.trim()
      ? `?search=${encodeURIComponent(
          search.trim(),
        )}`
      : '';

    return request(
      `/api/admin/artists${query}`,
      {
        method: 'GET',
      },
      token,
    );
  },

  /*
  |--------------------------------------------------------------------------
  | GET
  |--------------------------------------------------------------------------
  */

  get(token, id) {
    return request(
      `/api/admin/artists/${id}`,
      {
        method: 'GET',
      },
      token,
    );
  },

  /*
  |--------------------------------------------------------------------------
  | CREATE
  |--------------------------------------------------------------------------
  */

  create(
    token,
    {
      name,
      description,
      coverFile,
    },
  ) {
    const formData =
      new FormData();

    formData.append(
      'name',
      name,
    );

    if (
      description !==
      undefined
    ) {
      formData.append(
        'description',
        description,
      );
    }

    if (coverFile) {
      formData.append(
        'cover',
        coverFile,
      );
    }

    return request(
      '/api/admin/artists',
      {
        method: 'POST',
        body: formData,
      },
      token,
    );
  },

  /*
  |--------------------------------------------------------------------------
  | UPDATE
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  |
  | Only append cover when coverFile
  | actually exists.
  |
  |--------------------------------------------------------------------------
  */

  update(
    token,
    id,
    {
      name,
      description,
      coverFile,
      includeName = true,
      includeDescription = true,
    },
  ) {
    const formData =
      new FormData();

    if (
      includeName &&
      name !== undefined
    ) {
      formData.append(
        'name',
        name,
      );
    }

    if (
      includeDescription &&
      description !==
        undefined
    ) {
      formData.append(
        'description',
        description,
      );
    }

    /*
     * THIS IS THE IMPORTANT PART.
     *
     * No coverFile =
     * no artwork upload.
     *
     * Existing artwork remains untouched.
     */
    if (coverFile) {
      formData.append(
        'cover',
        coverFile,
      );
    }

    return request(
      `/api/admin/artists/${id}`,
      {
        method: 'PATCH',
        body: formData,
      },
      token,
    );
  },

  /*
  |--------------------------------------------------------------------------
  | DELETE
  |--------------------------------------------------------------------------
  */

  delete(token, id) {
    return request(
      `/api/admin/artists/${id}`,
      {
        method: 'DELETE',
      },
      token,
    );
  },
};

export default artistsApi;