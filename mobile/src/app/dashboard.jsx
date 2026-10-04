import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import AppShell from '../components/AppShell';
import Cover from '../components/Cover';
import Icon from '../components/Icon';
import SectionHeader from '../components/SectionHeader';
import TrackList from '../components/TrackList';

import { usePlayer } from '../context/PlayerContext';
import { useThemeStyles } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { colors } from '../theme/theme';
import { formatTime } from '../utils/track';

export default function Dashboard() {
  const styles = useThemeStyles(styleDefinitions);
  const router = useRouter();

  const tracks = useStore((s) => s.tracks);
  const favorites = useStore((s) => s.favorites);
  const loading = useStore((s) => s.loading);

  const p = usePlayer();

  const favoriteIds = useMemo(
    () => new Set(favorites.map((x) => String(x.id))),
    [favorites]
  );

  const featured = useMemo(
    () => tracks.slice(0, 4),
    [tracks]
  );

  const recent = useMemo(
    () => tracks.slice(-5).reverse(),
    [tracks]
  );

  const handlePlay = (track, queue) => {
    if (String(p.activeTrack?.id) === String(track?.id)) {
      p.toggle();
      return;
    }

    p.play(track, queue);
  };

  const playbackProgress = p.duration > 0
    ? Math.min(100, (p.position / p.duration) * 100)
    : 0;

  /*
   * Check whether this specific track is the
   * currently active track.
   */
  const isActiveTrack = (track) => {
    if (!p.activeTrack?.id || !track?.id) {
      return false;
    }

    return String(p.activeTrack.id) === String(track.id);
  };

  return (
    <AppShell title="Home">
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Your music
        </Text>

        <Text style={styles.subtitle}>
          Listen to what you love.
        </Text>
      </View>

      {p.activeTrack ? (
        <View style={styles.nowPlaying}>
          <Cover
            uri={p.activeTrack.thumbnailUrl}
            token={p.token}
            size={58}
            r={10}
          />

          <View style={styles.nowPlayingInfo}>
            <Text style={styles.nowPlayingLabel}>
              {p.isPlaying ? 'NOW PLAYING' : 'PAUSED'}
            </Text>
            <Text style={styles.nowPlayingTitle} numberOfLines={1}>
              {p.activeTrack.title || 'Unknown track'}
            </Text>
            <Text style={styles.nowPlayingArtist} numberOfLines={1}>
              {p.activeTrack.artist || 'Unknown artist'}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${playbackProgress}%` }]} />
            </View>
            <Text style={styles.playbackTime}>
              {formatTime(p.position)} / {formatTime(p.duration)}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={p.isPlaying ? 'Pause playback' : 'Resume playback'}
            hitSlop={10}
            onPress={p.toggle}
            style={styles.nowPlayingButton}
          >
            <Icon
              name={p.isPlaying ? 'pause' : 'play'}
              size={23}
              color={colors.accentDark}
            />
          </Pressable>
        </View>
      ) : null}

      {/* Featured */}
      <SectionHeader
        title="Featured"
        action="See all"
        onAction={() => router.push('/library')}
      />

      {loading && tracks.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator
            size="small"
            color={colors.text}
          />

          <Text style={styles.loadingText}>
            Loading music...
          </Text>
        </View>
      ) : featured.length > 0 ? (
        <View style={styles.grid}>
          {featured.map((track) => {
            const active = isActiveTrack(track);
            const playing = active && p.isPlaying;

            return (
              <Pressable
                key={String(track.id)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                ]}
                onPress={() =>
                  handlePlay(track, featured)
                }
              >
                <View style={styles.coverContainer}>
                  <Cover
                    uri={track.thumbnailUrl}
                    token={p.token}
                    size={150}
                    r={18}
                  />

                  {/* Play / Pause Button */}
                  <View
                    style={[
                      styles.playButton,
                      active && styles.activePlayButton,
                    ]}
                  >
                    <Text
                      style={[
                        styles.playIcon,
                        playing && styles.pauseIcon,
                      ]}
                    >
                      {playing ? 'Ⅱ' : '▶'}
                    </Text>
                  </View>
                </View>

                <Text
                  numberOfLines={1}
                  style={[
                    styles.cardTitle,
                    active && styles.activeTitle,
                  ]}
                >
                  {track.title || 'Unknown track'}
                </Text>

                <Text
                  numberOfLines={1}
                  style={styles.cardArtist}
                >
                  {track.artist || 'Unknown artist'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            No music available
          </Text>

          <Text style={styles.emptyText}>
            Your tracks will appear here.
          </Text>
        </View>
      )}

      {/* Recently Added */}
      <View style={styles.recentSection}>
        <SectionHeader
          title="Recently added"
          action="Library"
          onAction={() => router.push('/library')}
        />

        {recent.length > 0 ? (
          <TrackList
            tracks={recent}
            activeTrack={p.activeTrack}
            isPlaying={p.isPlaying}
            token={p.token}
            onSelect={(track) =>
              handlePlay(track, recent)
            }
            onFavorite={(track) =>
              useStore
                .getState()
                .toggleFavorite(track)
            }
            favoriteIds={favoriteIds}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              No recent tracks
            </Text>

            <Text style={styles.emptyText}>
              Recently added music will appear here.
            </Text>
          </View>
        )}
      </View>
    </AppShell>
  );
}

const styleDefinitions = {
  header: {
    paddingTop: 8,
    paddingBottom: 28,
  },

  greeting: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -0.7,
  },

  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 6,
  },

  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 24,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
  },

  nowPlayingInfo: {
    flex: 1,
    minWidth: 0,
  },

  nowPlayingLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
  },

  nowPlayingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },

  nowPlayingArtist: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  progressTrack: {
    height: 3,
    overflow: 'hidden',
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: 8,
  },

  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },

  playbackTime: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 4,
  },

  nowPlayingButton: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.accent,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 22,
  },

  card: {
    width: '47.5%',
  },

  cardPressed: {
    opacity: 0.75,
    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  coverContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
  },

  playButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',

    elevation: 4,

    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  activePlayButton: {
    transform: [
      {
        scale: 1.05,
      },
    ],
  },

  playIcon: {
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 2,
  },

  pauseIcon: {
    fontSize: 15,
    marginLeft: 0,
    letterSpacing: -2,
  },

  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 10,
  },

  activeTitle: {
    color: colors.accent,
    fontWeight: '900',
  },

  cardArtist: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },

  recentSection: {
    marginTop: 30,
  },

  loading: {
    minHeight: 140,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 9,
  },

  empty: {
    minHeight: 120,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },

  emptyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
};
