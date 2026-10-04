import Slider from '@react-native-community/slider';
import { requireOptionalNativeModule } from 'expo';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlayer } from '../context/PlayerContext';
import { useThemeStyles } from '../context/ThemeContext';

import { colors, spacing } from '../theme/theme';
import { formatTime } from '../utils/track';

import Cover from './Cover';
import Icon from './Icon';

/* =========================================================
   HELPERS
========================================================= */

const imageColorsModule = requireOptionalNativeModule('ImageColors');
const artworkColorCache = new Map();

/** Mix a #rrggbb colour with black. amount 0 = original, 1 = black. */
function darken(hex, amount = 0.5) {
  if (typeof hex !== 'string' || !/^#([0-9a-f]{6})$/i.test(hex)) return hex;

  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));

  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function createGradientStyle(tint) {
  const backgroundImage = `linear-gradient(180deg, ${tint} 0%, ${colors.bg} 70%)`;

  return {
    backgroundColor: colors.bg,
    [Platform.OS === 'web' ? 'backgroundImage' : 'experimental_backgroundImage']:
      backgroundImage,
  };
}

function pickArtworkColor(result) {
  if (!result) return null;

  if (result.platform === 'ios') {
    return result.background || result.primary || null;
  }

  return result.dominant || result.average || result.vibrant || null;
}

async function getArtworkColor(uri) {
  if (!imageColorsModule?.getColors) return null;

  if (artworkColorCache.has(uri)) {
    return artworkColorCache.get(uri);
  }

  const result = await imageColorsModule.getColors(uri, {
    fallback: colors.bg,
    cache: true,
    key: uri,
    quality: 'low',
  });

  const picked = pickArtworkColor(result);
  artworkColorCache.set(uri, picked);

  return picked;
}

/** Extracts a dominant colour from the artwork. Returns null until ready / on failure. */
function useArtworkColor(uri) {
  const [color, setColor] = useState(null);

  useEffect(() => {
    let alive = true;

    if (!uri) {
      setColor(null);
      return undefined;
    }

    getArtworkColor(uri)
      .then((picked) => {
        if (!alive) return;

        setColor(picked || null);
      })
      .catch(() => {
        if (alive) setColor(null);
      });

    return () => {
      alive = false;
    };
  }, [uri]);

  return color;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function FullPlayer({ visible, onClose }) {
  const styles = useThemeStyles(styleDefinitions);
  const p = usePlayer();
  const { width, height } = useWindowDimensions();

  const artworkSize = Math.max(
    180,
    Math.min(width - spacing.lg * 2, height * 0.42)
  );

  /* ---------- progress ---------- */

  const duration = Number.isFinite(Number(p.duration))
    ? Math.max(0, Number(p.duration))
    : 0;

  const position = Number.isFinite(Number(p.position))
    ? Math.max(0, Number(p.position))
    : 0;

  const safePosition = duration > 0 ? Math.min(position, duration) : 0;

  const handleSeek = useCallback(
    (value) => {
      const numericValue = Number(value);

      if (!Number.isFinite(numericValue)) return;
      if (duration <= 0) return;

      const target = Math.max(0, Math.min(numericValue, duration));

      if (typeof p.seek === 'function') {
        p.seek(target);
      }
    },
    [duration, p.seek]
  );

  /* ---------- favorite ---------- */

  const heartScale = useRef(new Animated.Value(1)).current;

  const handleFavorite = useCallback(() => {
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 40,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 40,
      }),
    ]).start();

    // Assumes PlayerContext exposes toggleFavorite / isFavorite.
    p.toggleFavorite?.(p.activeTrack);
  }, [p.toggleFavorite, p.activeTrack, heartScale]);

  const isFav = !!p.isFavorite;

  /* ---------- artwork-based background ---------- */

  const artworkColor = useArtworkColor(p.activeTrack?.thumbnailUrl);
  const tint = artworkColor ? darken(artworkColor, 0.45) : colors.bg;

  if (!p.activeTrack) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>

        {/* ================= BACKGROUND GRADIENT ================= */}

        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, createGradientStyle(tint)]}
        />

        <SafeAreaView style={styles.root}>

          {/* ================= HEADER ================= */}

          <View style={styles.top}>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.headerButton}
            >
              <Icon name="chevron-down" size={27} color={colors.text} />
            </Pressable>

            <Text style={styles.topTitle}>NOW PLAYING</Text>

            <Pressable hitSlop={12} style={styles.headerButton}>
              <Icon name="ellipsis-horizontal" size={21} color={colors.text} />
            </Pressable>
          </View>

          {/* ================= MAIN CONTENT ================= */}

          <View style={styles.content}>

            {/* ================= COVER ================= */}

            <View style={styles.coverContainer}>
              <View
                style={[
                  styles.coverClip,
                  { width: artworkSize, height: artworkSize },
                ]}
              >
                <View
                  style={[
                    styles.coverZoom,
                    { width: artworkSize * 1.13, height: artworkSize * 1.13 },
                  ]}
                >
                  <Cover
                    uri={p.activeTrack.thumbnailUrl}
                    token={p.token}
                    size={artworkSize * 1.13}
                    r={0}
                  />
                </View>
              </View>
            </View>

            {/* ================= BOTTOM BLOCK ================= */}

            <View style={styles.bottom}>

              {/* ---------- TRACK INFO + FAVORITE ---------- */}

              <View style={styles.infoRow}>
                <View style={styles.info}>
                  <Text
                    style={styles.title}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {p.activeTrack.title || 'Unknown title'}
                  </Text>

                  <Text
                    style={styles.artist}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {p.activeTrack.artist || 'Unknown artist'}
                  </Text>
                </View>

                <Pressable
                  onPress={handleFavorite}
                  hitSlop={14}
                  style={styles.favButton}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isFav ? 'Remove from favorites' : 'Add to favorites'
                  }
                >
                  <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                    <Icon
                      name={isFav ? 'heart' : 'heart-outline'}
                      size={26}
                      color={isFav ? colors.accent : colors.text}
                    />
                  </Animated.View>
                </Pressable>
              </View>

              {/* ---------- SEEK ---------- */}

              <View style={styles.seekContainer}>
                <Slider
                  style={styles.slider}
                  value={safePosition}
                  minimumValue={0}
                  maximumValue={Math.max(duration, 1)}
                  step={0.1}
                  disabled={duration <= 0}
                  onSlidingComplete={handleSeek}
                  minimumTrackTintColor={colors.text}
                  maximumTrackTintColor="rgba(255,255,255,0.28)"
                  thumbTintColor={colors.text}
                />

                <View style={styles.times}>
                  <Text style={styles.time}>{formatTime(safePosition)}</Text>
                  <Text style={styles.time}>{formatTime(duration)}</Text>
                </View>
              </View>

              {/* ---------- CONTROLS: shuffle | prev | play | next | repeat ---------- */}

              <View style={styles.controls}>
                <Pressable
                  onPress={() => p.setShuffle(!p.shuffle)}
                  hitSlop={14}
                  style={styles.sideButton}
                >
                  <Icon
                    name="shuffle"
                    size={24}
                    color={p.shuffle ? colors.accent : colors.text}
                  />
                  {p.shuffle && <View style={styles.activeDot} />}
                </Pressable>

                <Pressable
                  onPress={p.previous}
                  hitSlop={14}
                  style={styles.controlButton}
                >
                  <Icon name="play-skip-back" size={34} color={colors.text} />
                </Pressable>

                <Pressable
                  style={styles.play}
                  onPress={p.toggle}
                  hitSlop={8}
                >
                  <Icon
                    name={p.isPlaying ? 'pause' : 'play'}
                    size={34}
                    color="#000000"
                  />
                </Pressable>

                <Pressable
                  onPress={p.next}
                  hitSlop={14}
                  style={styles.controlButton}
                >
                  <Icon name="play-skip-forward" size={34} color={colors.text} />
                </Pressable>

                <Pressable
                  onPress={p.cycleRepeat}
                  hitSlop={14}
                  style={styles.sideButton}
                >
                  <Icon
                    name={p.repeat === 'one' ? 'repeat-one' : 'repeat'}
                    size={24}
                    color={p.repeat !== 'off' ? colors.accent : colors.text}
                  />
                  {p.repeat !== 'off' && <View style={styles.activeDot} />}
                </Pressable>
              </View>

              {/* ---------- FOOTER: device | queue ---------- */}

              <View style={styles.footer}>
                <Pressable hitSlop={14} style={styles.footerButton}>
                  <Icon
                    name="phone-portrait-outline"
                    size={22}
                    color={colors.muted}
                  />
                </Pressable>

                <Pressable hitSlop={14} style={styles.footerButton}>
                  <Icon name="list" size={24} color={colors.muted} />
                </Pressable>
              </View>

            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styleDefinitions = {
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  root: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
  },

  /* ================= HEADER ================= */

  top: {
    height: 44,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginBottom: 8,
  },

  headerButton: {
    width: 40,
    height: 40,

    alignItems: 'center',
    justifyContent: 'center',
  },

  topTitle: {
    color: colors.text,

    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },

  /* ================= CONTENT ================= */

  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 8,
  },

  /* ================= COVER ================= */

  coverContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },

  /* Visible artwork area (square, slightly rounded like the reference). */
  coverClip: {
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Artwork is larger than the clip so outer borders are cropped. */
  coverZoom: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ================= BOTTOM BLOCK ================= */

  bottom: {
    width: '100%',
  },

  /* ================= TRACK INFO ================= */

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  info: {
    flex: 1,
  },

  title: {
    color: colors.text,

    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },

  artist: {
    color: colors.muted,

    fontSize: 16,
    lineHeight: 22,

    marginTop: 2,
  },

  favButton: {
    width: 44,
    height: 44,

    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ================= SEEK ================= */

  seekContainer: {
    width: '100%',
    marginTop: 14,
  },

  slider: {
    width: '100%',
    height: 28,
    marginHorizontal: 0,
  },

  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',

    marginTop: -4,
  },

  time: {
    color: colors.muted,

    fontSize: 12,

    fontVariant: ['tabular-nums'],
  },

  /* ================= CONTROLS ================= */

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginTop: 14,
  },

  sideButton: {
    width: 44,
    height: 44,

    alignItems: 'center',
    justifyContent: 'center',
  },

  controlButton: {
    width: 52,
    height: 52,

    alignItems: 'center',
    justifyContent: 'center',
  },

  play: {
    width: 72,
    height: 72,

    borderRadius: 36,

    backgroundColor: '#FFFFFF',

    alignItems: 'center',
    justifyContent: 'center',
  },

  activeDot: {
    position: 'absolute',
    bottom: 2,

    width: 4,
    height: 4,

    borderRadius: 2,

    backgroundColor: colors.accent,
  },

  /* ================= FOOTER ================= */

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginTop: 12,
  },

  footerButton: {
    width: 44,
    height: 44,

    alignItems: 'center',
    justifyContent: 'center',
  },
};
