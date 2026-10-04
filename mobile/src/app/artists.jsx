import {
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    FlatList,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useRouter } from 'expo-router';

import AppShell from '../components/AppShell';
import Cover from '../components/Cover';

import { useThemeStyles } from '../context/ThemeContext';
import { artistsApi } from '../lib/api';
import { useStore } from '../store/store';
import { colors } from '../theme/theme';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ARTIST_IMAGE_SIZE = 155;

/* -------------------------------------------------------------------------- */
/* Normalize artist name                                                      */
/* -------------------------------------------------------------------------- */

function normalizeArtistName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Normalize artist cover URL                                                 */
/* -------------------------------------------------------------------------- */

function normalizeCoverUrl(value) {
  if (!value) {
    return '';
  }

  const coverUrl = String(value).trim();

  if (!coverUrl) {
    return '';
  }

  /*
   * Handle accidental markdown:
   *
   * [http://server/image.jpg](http://server/image.jpg)
   */
  const markdownMatch = coverUrl.match(
    /^\[(.*?)\]\((https?:\/\/.+?)\)$/
  );

  if (markdownMatch) {
    return markdownMatch[2];
  }

  return coverUrl;
}

/* -------------------------------------------------------------------------- */
/* Get artist artwork                                                         */
/* -------------------------------------------------------------------------- */

/*
 * IMPORTANT:
 *
 * Only Artist.coverUrl / Artist.cover is used.
 *
 * Track thumbnails are NEVER used here.
 *
 * If the artist has no artwork:
 *
 *     resolvedCover = ''
 *
 * Cover component will then show its normal placeholder.
 */

function getArtistCover(artist) {
  if (!artist) {
    return '';
  }

  return normalizeCoverUrl(
    artist.coverUrl || artist.cover
  );
}

/* -------------------------------------------------------------------------- */
/* Artists                                                                     */
/* -------------------------------------------------------------------------- */

export default function Artists() {
  const styles = useThemeStyles(styleDefinitions);
  const router = useRouter();

  const token = useStore(
    (s) => s.token
  );

  const tracks = useStore(
    (s) => s.tracks
  );

  const [q, setQ] = useState('');
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Load artists                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    async function loadArtists() {
      if (!token) {
        setArtists([]);
        return;
      }

      setLoading(true);

      try {
        const response =
          await artistsApi.list(
            token,
            q
          );

        // console.log(
        //   'Artists API response:',
        //   response
        // );

        const records =
          Array.isArray(
            response?.artists
          )
            ? response.artists
            : Array.isArray(response)
              ? response
              : [];

        if (!cancelled) {
          setArtists(records);
        }
      } catch (error) {
        console.warn(
          '[ARTISTS] Failed to load artist API:',
          error?.message || error
        );

        /*
         * API fallback:
         *
         * Build artist names from local tracks.
         *
         * IMPORTANT:
         * No track.thumbnailUrl is assigned.
         */
        const grouped = new Map();

        tracks.forEach((track) => {
          const artistString =
            typeof track?.artist === 'string'
              ? track.artist.trim()
              : '';

          const names = artistString
            ? artistString
                .split(',')
                .map((name) =>
                  name.trim()
                )
                .filter(Boolean)
            : ['Unknown Artist'];

          names.forEach((name) => {
            const normalized =
              normalizeArtistName(name);

            if (!normalized) {
              return;
            }

            if (!grouped.has(normalized)) {
              grouped.set(
                normalized,
                {
                  id: name,
                  name,
                  normalizedName:
                    normalized,

                  // No track artwork fallback.
                  coverUrl: null,

                  trackCount: 0,
                }
              );
            }

            const artist =
              grouped.get(normalized);

            artist.trackCount += 1;
          });
        });

        if (!cancelled) {
          setArtists([
            ...grouped.values(),
          ]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadArtists();

    return () => {
      cancelled = true;
    };
  }, [token, q, tracks]);

  /* ------------------------------------------------------------------------ */
  /* Resolve artist covers                                                    */
  /* ------------------------------------------------------------------------ */

  const artistsWithCovers =
    useMemo(() => {
      return artists.map(
        (artist) => ({
          ...artist,

          /*
           * ONLY artist artwork.
           */
          resolvedCover:
            getArtistCover(
              artist
            ),
        })
      );
    }, [artists]);

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <AppShell title="Artists">
      <View style={styles.search}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search artists"
          placeholderTextColor={
            colors.muted
          }
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <Text style={styles.loading}>
          Loading artists...
        </Text>
      ) : null}

      <FlatList
        scrollEnabled={false}
        data={artistsWithCovers}
        keyExtractor={(
          item,
          index
        ) =>
          String(
            item.id ||
              item.name ||
              index
          )
        }
        numColumns={2}
        columnWrapperStyle={
          styles.column
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push(
                `/artist/${encodeURIComponent(
                  item.id ||
                    item.name
                )}`
              )
            }
          >
            {/* ---------------------------------------------------------------- */}
            {/* Circular artist image                                            */}
            {/* ---------------------------------------------------------------- */}

            <View
              style={[
                styles.artistImageWrapper,
                {
                  width:
                    ARTIST_IMAGE_SIZE,
                  height:
                    ARTIST_IMAGE_SIZE,
                  borderRadius:
                    ARTIST_IMAGE_SIZE / 2,
                },
              ]}
            >
              <Cover
                uri={item.resolvedCover}
                token={token}
                size={ARTIST_IMAGE_SIZE}
                r={ARTIST_IMAGE_SIZE / 2}
              />
            </View>

            {/* ---------------------------------------------------------------- */}
            {/* Artist name                                                      */}
            {/* ---------------------------------------------------------------- */}

            <Text
              numberOfLines={1}
              style={styles.name}
            >
              {item.name}
            </Text>

            {/* ---------------------------------------------------------------- */}
            {/* Track count                                                      */}
            {/* ---------------------------------------------------------------- */}

            <Text style={styles.meta}>
              {item.trackCount ||
                item.songCount ||
                0}{' '}
              songs
            </Text>
          </Pressable>
        )}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styleDefinitions = {
    search: {
      height: 48,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius: 13,
      backgroundColor:
        colors.surface,
      paddingHorizontal: 14,
      justifyContent:
        'center',
      marginTop: 8,
      marginBottom: 18,
    },

    input: {
      color: colors.text,
      fontSize: 14,
    },

    column: {
      gap: 14,
    },

    card: {
      width: '47%',
      marginBottom: 22,
      alignItems: 'center',
    },

    artistImageWrapper: {
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },

    name: {
      color: colors.text,
      fontWeight: '800',
      marginTop: 9,
      textAlign: 'center',
      maxWidth: ARTIST_IMAGE_SIZE,
    },

    meta: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 3,
      textAlign: 'center',
    },

    loading: {
      color: colors.muted,
      fontSize: 13,
      marginBottom: 12,
    },
  };