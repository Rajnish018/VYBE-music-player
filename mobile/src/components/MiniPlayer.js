import { useState } from 'react';
import {
    Pressable,
    Text,
    View,
} from 'react-native';

import { usePlayer } from '../context/PlayerContext';
import { useThemeStyles } from '../context/ThemeContext';
import { colors } from '../theme/theme';
import Cover from './Cover';
import FullPlayer from './FullPlayer';
import Icon from './Icon';

export default function MiniPlayer() {
  const styles = useThemeStyles(styleDefinitions);
  const {
    activeTrack,
    isPlaying,
    toggle,
    next,
    token,
  } = usePlayer();

  const [open, setOpen] = useState(false);

  if (!activeTrack) {
    return null;
  }

  return (
    <>
      <Pressable
        style={styles.bar}
        onPress={() => setOpen(true)}
      >
        <Cover
          uri={activeTrack.thumbnailUrl}
          token={token}
          size={46}
          r={8}
        />

        <View style={styles.info}>
          <Text
            style={styles.title}
            numberOfLines={1}
          >
            {activeTrack.title}
          </Text>

          <Text
            style={styles.meta}
            numberOfLines={1}
          >
            {activeTrack.artist}
          </Text>
        </View>

        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <Icon
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={colors.accent}
          />
        </Pressable>

        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation();
            next();
          }}
        >
          <Icon
            name="play-skip-forward"
            size={22}
          />
        </Pressable>
      </Pressable>

      <FullPlayer
        visible={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styleDefinitions = {
  bar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 70,
    height: 62,

    backgroundColor: colors.surface,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,

    padding: 8,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 10,
  },

  info: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    color: colors.text,
    fontWeight: '800',
  },

  meta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
};