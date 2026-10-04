import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import artistsApi from '../api/artistsApi.js';

export function useArtists(token) {
  const [artists, setArtists] = useState([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');

  /*
  |--------------------------------------------------------------------------
  | LOAD ARTISTS
  |--------------------------------------------------------------------------
  */

  const loadArtists = useCallback(
    async () => {
      if (!token) {
        setArtists([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const data = await artistsApi.list(
          token,
          search,
        );

        setArtists(
          Array.isArray(data?.artists)
            ? data.artists
            : [],
        );
      } catch (err) {
        console.error(
          'Failed to load artists:',
          err,
        );

        setError(
          err?.message ||
            'Failed to load artists.',
        );
      } finally {
        setLoading(false);
      }
    },
    [token, search],
  );

  /*
  |--------------------------------------------------------------------------
  | SEARCH DEBOUNCE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadArtists();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadArtists]);

  /*
  |--------------------------------------------------------------------------
  | CLEAR MESSAGES
  |--------------------------------------------------------------------------
  */

  const clearMessages = useCallback(() => {
    setError('');
    setSuccess('');
  }, []);

  /*
  |--------------------------------------------------------------------------
  | ADD ARTIST
  |--------------------------------------------------------------------------
  */

  const addArtist =
  useCallback(
    async ({
      name,
      description,
      coverFile,
    }) => {
      clearMessages();

      const cleanName =
        name?.trim();

      const cleanDescription =
        description?.trim();

      if (!cleanName) {
        setError(
          'Artist name is required.',
        );

        return null;
      }

      setSaving(true);

      try {
        const data =
          await artistsApi.create(
            token,
            {
              name:
                cleanName,

              description:
                cleanDescription,

              coverFile:
                coverFile || null,
            },
          );

        const artist =
          data?.artist || null;

        if (artist) {
          setArtists(
            (current) => [
              artist,
              ...current,
            ],
          );
        }

        setSuccess(
          'Artist added successfully.',
        );

        return artist;
      } catch (err) {
        console.error(
          'Failed to create artist:',
          err,
        );

        setError(
          err?.message ||
            'Failed to add artist.',
        );

        return null;
      } finally {
        setSaving(false);
      }
    },
    [
      token,
      clearMessages,
    ],
  );
  /*
  |--------------------------------------------------------------------------
  | UPDATE ARTIST
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  |
  | Only changed fields are sent.
  |
  | This means:
  |
  | - name unchanged       -> don't send name
  | - description unchanged -> don't send description
  | - artwork unchanged   -> don't send coverUrl
  |
  | Therefore existing artwork is preserved.
  |
  */

  const updateArtist =
  useCallback(
    async (
      id,
      {
        name,
        description,
        coverFile,
      },
      originalArtist = null,
    ) => {
      clearMessages();

      const cleanName =
        name?.trim();

      const cleanDescription =
        description?.trim();

      if (!cleanName) {
        setError(
          'Artist name is required.',
        );

        return null;
      }

      const nameChanged =
        !originalArtist ||
        cleanName !==
          String(
            originalArtist.name ||
              '',
          ).trim();

      const descriptionChanged =
        !originalArtist ||
        cleanDescription !==
          String(
            originalArtist.description ||
              '',
          ).trim();

      const imageChanged =
        Boolean(coverFile);

      /*
       * Nothing changed.
       */

      if (
        !nameChanged &&
        !descriptionChanged &&
        !imageChanged
      ) {
        setSuccess(
          'No changes were made.',
        );

        return (
          originalArtist ||
          null
        );
      }

      setSaving(true);

      try {
        const data =
          await artistsApi.update(
            token,
            id,
            {
              name:
                nameChanged
                  ? cleanName
                  : undefined,

              description:
                descriptionChanged
                  ? cleanDescription
                  : undefined,

              coverFile:
                imageChanged
                  ? coverFile
                  : null,

              includeName:
                nameChanged,

              includeDescription:
                descriptionChanged,
            },
          );

        const updatedArtist =
          data?.artist || null;

        if (updatedArtist) {
          setArtists(
            (current) =>
              current.map(
                (artist) => {
                  if (
                    artist.id !==
                    id
                  ) {
                    return artist;
                  }

                  return {
                    ...artist,
                    ...updatedArtist,
                  };
                },
              ),
          );
        }

        setSuccess(
          'Artist updated successfully.',
        );
        console.log(
          'Updated artist:',
          updatedArtist,
        );
        return updatedArtist;
        
      } catch (err) {
        console.error(
          'Failed to update artist:',
          err,
        );

        setError(
          err?.message ||
            'Failed to update artist.',
        );

        return null;
      } finally {
        setSaving(false);
      }
    },
    [
      token,
      clearMessages,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | DELETE ARTIST
  |--------------------------------------------------------------------------
  */

  const deleteArtist = useCallback(
    async (id) => {
      clearMessages();

      if (!id) {
        setError(
          'Artist ID is required.',
        );

        return false;
      }

      setSaving(true);

      try {
        await artistsApi.delete(
          token,
          id,
        );

        /*
         * Remove immediately from local
         * state instead of doing another
         * GET /artists request.
         */
        setArtists((current) =>
          current.filter(
            (artist) =>
              artist.id !== id,
          ),
        );

        setSuccess(
          'Artist deleted successfully.',
        );

        return true;
      } catch (err) {
        console.error(
          'Failed to delete artist:',
          err,
        );

        setError(
          err?.message ||
            'Failed to delete artist.',
        );

        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      token,
      clearMessages,
    ],
  );

  return {
    artists,

    loading,
    saving,

    error,
    success,

    search,
    setSearch,

    loadArtists,

    addArtist,
    updateArtist,
    deleteArtist,

    clearMessages,

    setError,
    setSuccess,
  };
}