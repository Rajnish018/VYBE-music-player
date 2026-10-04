import {
    Pressable,
    Text,
    View,
} from 'react-native';

import { useThemeStyles } from '../context/ThemeContext';
import Cover from './Cover';
import Icon from './Icon';

import {
    colors
} from '../theme/theme';

import { formatTime } from '../utils/track';

export default function TrackRow({
  track,
  token,
  active,
  playing,
  onPress,
  onFavorite,
  onShare,
  showHeart = true,
}) {
  const styles = useThemeStyles(styleDefinitions);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
      ]}
    >
      <Cover
        uri={track.thumbnailUrl}
        token={token}
        size={58}
      />

      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            active && styles.active,
          ]}
        >
          {track.title}
        </Text>

        <Text
          numberOfLines={1}
          style={styles.meta}
        >
          {track.artist}
          {track.album
            ? ` · ${track.album}`
            : ''}
        </Text>
      </View>

      <Text style={styles.time}>
        {formatTime(track.duration)}
      </Text>

      {showHeart && (
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={track.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onPress={(event) => {
            event.stopPropagation();
            onFavorite?.(track);
          }}
        >
          <Icon
            name={track.isFavorite ? 'heart' : 'heart-outline'}
            size={21}
            color={track.isFavorite ? colors.danger : colors.muted}
          />
        </Pressable>
      )}

      <Pressable
        hitSlop={10}
        onPress={() =>
          onShare?.(track)
        }
      >
        <Icon
          name="ellipsis-horizontal"
          size={22}
          color={colors.muted}
        />
      </Pressable>
    </Pressable>
  );
}

const styleDefinitions = {
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },

  pressed: {
    opacity: 0.65,
  },

  info: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  active: {
    color: colors.accent,
  },

  meta: {
    marginTop: 5,
    fontSize: 13,
    color: colors.muted,
  },

  time: {
    fontSize: 12,
    color: colors.muted,
  },
};