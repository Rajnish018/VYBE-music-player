import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import AppShell from '../components/AppShell';
import Icon from '../components/Icon';
import { usePlayer } from '../context/PlayerContext';
import { useTheme, useThemeStyles } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { colors } from '../theme/theme';

const themeModes = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function Settings() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const player = usePlayer();
  const { mode, palette, setMode } = useTheme();
  const styles = useThemeStyles(styleDefinitions);

  const signout = () => Alert.alert(
    'Sign out',
    'You will be signed out of this device.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]
  );

  return (
    <AppShell title="Settings">
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Icon name="person" size={30} />
        </View>
        <View>
          <Text style={styles.name}>{user?.email || 'Music listener'}</Text>
          <Text style={styles.role}>{user?.role || 'USER'}</Text>
        </View>
      </View>

      <Text style={styles.section}>APPEARANCE</Text>
      <View
        style={[styles.themeOptions, { backgroundColor: palette.surface2 }]}
        accessibilityRole="radiogroup"
      >
        {themeModes.map((theme) => {
          const selected = mode === theme.value;

          return (
            <Pressable
              key={theme.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${theme.label} theme`}
              onPress={() => setMode(theme.value)}
              style={[
                styles.themeChoice,
                selected && [styles.themeChoiceSelected, { backgroundColor: palette.accent }],
              ]}
            >
              <Icon
                name={theme.icon}
                size={18}
                color={selected ? colors.accentDark : colors.muted}
              />
              <Text style={[styles.themeLabel, selected && styles.themeLabelSelected]}>
                {theme.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>PLAYBACK</Text>
      <View style={styles.row}>
        <Icon name="volume-high-outline" color={colors.muted} />
        <Text style={styles.label}>
          {player.deviceVolumeAvailable ? 'Device volume' : 'Playback volume'}
        </Text>
        <Text style={styles.value}>{Math.round(player.volume * 100)}%</Text>
      </View>
      <Slider
        accessibilityLabel="Playback volume"
        style={styles.volumeSlider}
        value={player.volume}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        onValueChange={player.setVolume}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
      />

      <View style={styles.sectionSpace} />
      <Text style={styles.section}>LIBRARY</Text>
      <Pressable style={styles.row} onPress={() => router.push('/albums')}>
        <Icon name="disc-outline" color={colors.muted} />
        <Text style={styles.label}>Albums</Text>
        <Icon name="chevron-forward" color={colors.muted} />
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/artists')}>
        <Icon name="people-outline" color={colors.muted} />
        <Text style={styles.label}>Artists</Text>
        <Icon name="chevron-forward" color={colors.muted} />
      </Pressable>
      {user?.role === 'ADMIN' ? (
        <Pressable style={styles.row} onPress={() => router.push('/admin')}>
          <Icon name="shield-checkmark-outline" color={colors.muted} />
          <Text style={styles.label}>Admin dashboard</Text>
          <Icon name="chevron-forward" color={colors.muted} />
        </Pressable>
      ) : null}

      <View style={styles.sectionSpace} />
      <Pressable style={[styles.row, styles.dangerRow]} onPress={signout}>
        <Icon name="log-out-outline" color={colors.danger} />
        <Text style={[styles.label, { color: colors.danger }]}>Sign out</Text>
      </Pressable>
    </AppShell>
  );
}

const styleDefinitions = {
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  role: { color: colors.muted, fontSize: 11, marginTop: 4 },
  section: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginTop: 25,
    marginBottom: 8,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 12,
    backgroundColor: colors.surface2,
  },
  themeChoice: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 9,
  },
  themeChoiceSelected: { backgroundColor: colors.accent },
  themeLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  themeLabelSelected: { color: colors.accentDark },
  sectionSpace: { height: 10 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  volumeSlider: { height: 40, marginTop: -4, marginBottom: 8 },
  label: { flex: 1, color: colors.text, fontWeight: '700' },
  value: { color: colors.muted },
  dangerRow: { borderBottomWidth: 0, marginTop: 8 },
};