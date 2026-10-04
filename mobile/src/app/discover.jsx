import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

import AppShell from '../components/AppShell';
import TrackList from '../components/TrackList';

import { usePlayer } from '../context/PlayerContext';
import { useThemeStyles } from '../context/ThemeContext';
import { tracksApi } from '../lib/api';
import { useStore } from '../store/store';

import {
    colors,
    radius,
} from '../theme/theme';

export default function Discover() {
    const styles = useThemeStyles(styleDefinitions);
  const token = useStore((s) => s.token);
  const favorites = useStore((s) => s.favorites);
  const toggle = useStore((s) => s.toggleFavorite);
  const save = useStore((s) => s.saveToLibrary);

  const p = usePlayer();

  const [q, setQ] = useState('');
  const [source, setSource] = useState('library');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* -------------------------------------------------------------------------- */
  /* Favorite IDs                                                               */
  /* -------------------------------------------------------------------------- */

  const favIds = useMemo(() => {
    return new Set(
      favorites.map((x) => String(x.id))
    );
  }, [favorites]);

  /* -------------------------------------------------------------------------- */
  /* Search                                                                     */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const clean = q.trim();

    if (clean.length < 3) {
      setResults([]);
      setLoading(false);
      setError('');
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');

      try {
        const response = await tracksApi.search(
          clean,
          token,
          source
        );

        const normalized = Array.isArray(response)
          ? response.map((x) => ({
              ...x,
              source: x.source || source,
            }))
          : [];

        setResults(normalized);
      } catch (e) {
        setError(
          e?.message ||
            'Unable to search tracks.'
        );

        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [q, source, token]);

  /* -------------------------------------------------------------------------- */
  /* Play track                                                                 */
  /* -------------------------------------------------------------------------- */

  const handleSelectTrack = async (track) => {
    try {
      await p.play(track, results);
    } catch (e) {
      setError(
        e?.message ||
          'Unable to play this track.'
      );
    }
  };

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <AppShell title="Discover">
      {/* Search */}
      <View style={styles.search}>
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Search your library or YouTube"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
        />
      </View>

      {/* Source switch */}
      <View style={styles.switch}>
        <Pressable
          onPress={() => setSource('library')}
          style={[
            styles.tab,
            source === 'library' && styles.active,
          ]}
        >
          <Text style={styles.tabText}>
            Library
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setSource('youtube')}
          style={[
            styles.tab,
            source === 'youtube' && styles.active,
          ]}
        >
          <Text style={styles.tabText}>
            YouTube
          </Text>
        </Pressable>
      </View>

      {/* Search state */}
      {loading ? (
        <ActivityIndicator
          color={colors.text}
          style={styles.loader}
        />
      ) : error ? (
        <Text style={styles.error}>
          {error}
        </Text>
      ) : (
        <TrackList
          tracks={results}
          activeTrack={p.activeTrack}
          isPlaying={p.isPlaying}
          token={token}
          onSelect={handleSelectTrack}
          onFavorite={toggle}
          favoriteIds={favIds}
        />
      )}

      {/* YouTube information */}
      {source === 'youtube' &&
      results.length > 0 ? (
        <Text style={styles.hint}>
          YouTube results are streamed through your
          existing backend audio endpoint.
        </Text>
      ) : null}
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styleDefinitions = {
  search: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
    justifyContent: 'center',
    marginTop: 8,
  },

  input: {
    color: colors.text,
    fontSize: 15,
  },

  switch: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    marginVertical: 14,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.pill,
  },

  active: {
    backgroundColor: colors.surface2,
  },

  tabText: {
    color: colors.text,
    fontWeight: '800',
  },

  loader: {
    marginTop: 30,
  },

  error: {
    color: colors.danger,
    textAlign: 'center',
    marginTop: 30,
  },

  hint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 15,
    lineHeight: 18,
  },
};