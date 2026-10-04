import {
  Text,
  View,
} from 'react-native';

import { useThemeStyles } from '../context/ThemeContext';
import { colors } from '../theme/theme';
import { useShare } from './AppShell';
import TrackRow from './TrackRow';

export default function TrackList({
  tracks = [],
  activeTrack,
  isPlaying,
  token,
  onSelect,
  onFavorite,
  favoriteIds,
}) {
  const styles = useThemeStyles(styleDefinitions);
  const share = useShare();

  if (!Array.isArray(tracks) || tracks.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>
          No tracks found
        </Text>

        <Text style={styles.emptyCopy}>
          Your music will appear here when it is available.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {tracks.map((t) => {
        /*
         * Normalize artwork.
         *
         * Different API/store responses may use different
         * property names. TrackRow should always receive
         * thumbnailUrl.
         */
        const thumbnailUrl =
          t.thumbnailUrl ||
          t.coverUrl ||
          t.imageUrl ||
          t.artworkUrl ||
          '';

        const normalizedTrack = {
          ...t,
          thumbnailUrl,

          isFavorite:
            favoriteIds?.has(String(t.id)) ||
            favoriteIds?.has(t.id),
        };

        return (
          <TrackRow
            key={String(t.id)}
            track={normalizedTrack}
            token={token}

            active={
              String(activeTrack?.id) ===
              String(t.id)
            }

            playing={isPlaying}

            onPress={() => onSelect(t)}

            onFavorite={onFavorite}

            onShare={share}
          />
        );
      })}
    </View>
  );
}

const styleDefinitions = {
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },

  emptyCopy: {
    color: colors.muted,
    marginTop: 8,
    textAlign: 'center',
  },
};
