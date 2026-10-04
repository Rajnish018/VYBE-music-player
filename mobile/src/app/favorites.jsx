import { useMemo, useState } from 'react';
import {
    TextInput,
    View,
} from 'react-native';

import AppShell from '../components/AppShell';
import Icon from '../components/Icon';
import TrackList from '../components/TrackList';

import { usePlayer } from '../context/PlayerContext';
import { useThemeStyles } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { colors } from '../theme/theme';

export default function Favorites() {
  const styles = useThemeStyles(styleDefinitions);

  const tracks = useStore((s) => s.favorites);
  const toggle = useStore((s) => s.toggleFavorite);

  const player = usePlayer();

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!Array.isArray(tracks)) {
      return [];
    }

    const q = query.trim().toLowerCase();

    if (!q) {
      return tracks;
    }

    return tracks.filter((track) =>
      `${track.title || ''} ${track.artist || ''} ${track.album || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [tracks, query]);

  const favoriteIds = useMemo(
    () =>
      new Set(
        tracks.map((track) =>
          String(track.id)
        )
      ),
    [tracks]
  );

  return (
    <AppShell title="Favorites">

      {/* SEARCH */}
      <View style={styles.search}>
        <Icon
          name="search"
          size={19}
          color={colors.muted}
        />

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search favorites"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* FAVORITES */}
      <TrackList
        tracks={filtered}

        activeTrack={player.activeTrack}

        isPlaying={player.isPlaying}

        /*
         * IMPORTANT:
         * Pass the player token to TrackList.
         */
        token={player.token}

        onSelect={(track) =>
          player.play(track, filtered)
        }

        onFavorite={toggle}

        favoriteIds={favoriteIds}
      />

    </AppShell>
  );
}

const styleDefinitions = {
  search: {
    height: 48,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,

    backgroundColor: colors.surface,

    flexDirection: 'row',
    alignItems: 'center',

    paddingHorizontal: 13,

    gap: 8,

    marginTop: 8,
    marginBottom: 12,
  },

  input: {
    flex: 1,

    color: colors.text,

    fontSize: 15,

    paddingVertical: 0,
  },
};
