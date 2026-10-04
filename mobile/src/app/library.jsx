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

export default function Library() {
  const styles = useThemeStyles(styleDefinitions);
  const tracks = useStore((s) => s.tracks);
  const favorites = useStore((s) => s.favorites);
  const toggle = useStore((s) => s.toggleFavorite);

  const p = usePlayer();

  const [q, setQ] = useState('');

  const favIds = useMemo(
    () =>
      new Set(
        favorites.map((x) => String(x.id))
      ),
    [favorites]
  );

  const filtered = useMemo(
    () =>
      tracks.filter((t) =>
        `${t.title || ''} ${t.artist || ''} ${t.album || ''}`
          .toLowerCase()
          .includes(q.trim().toLowerCase())
      ),
    [tracks, q]
  );

  return (
    <AppShell title="Library">
      <View style={styles.search}>
        <Icon
          name="search"
          color={colors.muted}
        />

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search title, artist, or album"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <TrackList
        tracks={filtered}
        activeTrack={p.activeTrack}
        isPlaying={p.isPlaying}
        token={p.token}
        onSelect={(t) => p.play(t, filtered)}
        onFavorite={toggle}
        favoriteIds={favIds}
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
    fontSize: 14,
  },
};