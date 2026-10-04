export function normalizeArtistName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

export function getArtistGroups(tracks = []) {
  const grouped = new Map();

  function addArtistTrack(artistData, track) {
    const name =
      typeof artistData?.name === 'string'
        ? artistData.name.trim()
        : '';

    if (!name) {
      return;
    }

    const key =
      typeof artistData?.normalizedName === 'string' &&
      artistData.normalizedName.trim()
        ? artistData.normalizedName.trim()
        : normalizeArtistName(name);

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        name,
        cover:
          typeof artistData?.coverUrl === 'string'
            ? artistData.coverUrl
            : '',
        tracks: [],
      });
    }

    const artist = grouped.get(key);

    // Use artist-specific image when available.
    if (
      !artist.cover &&
      typeof artistData?.coverUrl === 'string' &&
      artistData.coverUrl
    ) {
      artist.cover = artistData.coverUrl;
    }

    // Prevent the same track from being added twice
    // to the same artist.
    if (
      track?.id &&
      !artist.tracks.some(
        (existingTrack) =>
          existingTrack?.id === track.id
      )
    ) {
      artist.tracks.push(track);
    }
  }

  tracks.forEach((track) => {
    /*
     * PRIMARY SOURCE
     *
     * New database relationship:
     *
     * track.artists = [
     *   {
     *     artist: {
     *       id,
     *       name,
     *       normalizedName,
     *       coverUrl
     *     }
     *   }
     * ]
     */

    const relationships = Array.isArray(track?.artists)
      ? track.artists
      : [];

    const individualArtists = relationships
      .map(
        (relationship) =>
          relationship?.artist
      )
      .filter(
        (artist) =>
          artist &&
          typeof artist.name === 'string' &&
          artist.name.trim()
      );

    /*
     * If the new Artist/TrackArtist relationship
     * exists, use it.
     */
    if (individualArtists.length > 0) {
      individualArtists.forEach(
        (artist) => {
          addArtistTrack(
            artist,
            track
          );
        }
      );

      return;
    }

    /*
     * FALLBACK FOR OLD API DATA
     *
     * Older tracks may only contain:
     *
     * track.artist =
     * "Vishal Mishra, Asees Kaur"
     *
     * Split the string so old API responses
     * also work correctly.
     */

    const legacyArtist =
      typeof track?.artist === 'string'
        ? track.artist.trim()
        : '';

    const legacyNames = legacyArtist
      ? legacyArtist
          .split(',')
          .map(
            (name) => name.trim()
          )
          .filter(Boolean)
      : [];

    /*
     * No artist information.
     */
    if (legacyNames.length === 0) {
      addArtistTrack(
        {
          name: 'Unknown Artist',
          normalizedName:
            'unknown artist',
        },
        track
      );

      return;
    }

    /*
     * Add every comma-separated artist
     * as an individual artist.
     */
    legacyNames.forEach(
      (name) => {
        addArtistTrack(
          {
            name,
            normalizedName:
              normalizeArtistName(name),
          },
          track
        );
      }
    );
  });

  /*
   * Calculate album/song counts and sort
   * alphabetically.
   */
  return [...grouped.values()]
    .map((artist) => {
      const albums = [
        ...new Set(
          artist.tracks
            .map((track) =>
              typeof track?.album === 'string'
                ? track.album.trim()
                : ''
            )
            .filter(Boolean)
        ),
      ];

      return {
        ...artist,
        songCount:
          artist.tracks.length,
        albumCount:
          albums.length,
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(
        b.name,
        undefined,
        {
          sensitivity: 'base',
        }
      )
    );
}