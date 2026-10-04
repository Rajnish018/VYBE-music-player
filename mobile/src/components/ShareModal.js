import * as Clipboard from 'expo-clipboard';
import { useMemo } from 'react';
import { Alert, Modal, Pressable, Share, Text, View } from 'react-native';
import { useThemeStyles } from '../context/ThemeContext';
import { API_BASE_URL } from '../lib/api';
import { colors, radius, spacing } from '../theme/theme';
import Cover from './Cover';
import Icon from './Icon';

export default function ShareModal({ track, onClose }) {
  const styles = useThemeStyles(styleDefinitions);
  const visible = Boolean(track);
  const shareUrl = useMemo(
    () => track?.youtubeId
      ? `${API_BASE_URL}/api/share/youtube/audio?id=${encodeURIComponent(track.youtubeId)}`
      : track?.sourceUrl || track?.audioUrl ||
        `${API_BASE_URL}/api/tracks/${encodeURIComponent(track?.id || '')}/play`,
    [track]
  );

  const shareNative = async () => {
    try {
      await Share.share({
        title: track?.title || 'Track',
        message: `${track?.title || 'Track'} — ${track?.artist || 'Unknown Artist'}\n${shareUrl}`,
      });
    } catch {}
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(shareUrl);
    Alert.alert('Copied', 'Track link copied to clipboard.');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Cover uri={track?.thumbnailUrl} size={62} />
            <View style={styles.trackInfo}>
              <Text style={styles.title} numberOfLines={1}>{track?.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>{track?.artist}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Close share dialog">
              <Icon name="close" size={25} color={colors.muted} />
            </Pressable>
          </View>

          <Text style={styles.label}>Share this track</Text>
          <Pressable style={styles.action} onPress={shareNative}>
            <View style={styles.circle}><Icon name="share-social-outline" /></View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Share</Text>
              <Text style={styles.actionMeta}>Use your phone&apos;s sharing options</Text>
            </View>
            <Icon name="chevron-forward" color={colors.muted} />
          </Pressable>
          <Pressable style={styles.action} onPress={copyLink}>
            <View style={styles.circle}><Icon name="copy-outline" /></View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Copy link</Text>
              <Text style={styles.actionMeta}>Copy a playable backend link</Text>
            </View>
            <Icon name="chevron-forward" color={colors.muted} />
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styleDefinitions = {
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  trackInfo: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  meta: { color: colors.muted, marginTop: 4 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 26, marginBottom: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: { flex: 1 },
  actionTitle: { color: colors.text, fontWeight: '700' },
  actionMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  cancel: {
    marginTop: 10,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
  },
  cancelText: { color: colors.text, fontWeight: '800' },
};