import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { useThemeStyles } from '../context/ThemeContext';
import { API_BASE_URL } from '../lib/api';
import { colors } from '../theme/theme';

function resolveCoverUrl(uri, token) {
  if (!uri) {
    return '';
  }

  const value = String(uri).trim();

  if (!value) {
    return '';
  }

  const baseUrl = API_BASE_URL.replace(/\/+$/, '');

  const isAbsolute = /^https?:\/\//i.test(value);

  const imageUrl = new URL(
    isAbsolute
      ? value
      : `${baseUrl}/${value.replace(/^\/+/, '')}`,
  );

  // Add authentication to protected track-cover endpoint.
  if (
    token &&
    imageUrl.origin === new URL(baseUrl).origin &&
    imageUrl.pathname.includes('/api/tracks/') &&
    imageUrl.pathname.endsWith('/cover')
  ) {
    imageUrl.searchParams.set('token', token);
  }
//   console.log('resolveCoverUrl', { uri, token, imageUrl: imageUrl.toString() });
  return imageUrl.toString();
}

export default function Cover({
  uri,
  token,
  size = 56,
  r = 12,
}) {
  const styles = useThemeStyles(styleDefinitions);
  const imageUri = resolveCoverUrl(uri, token);

  if (!imageUri) {
    return (
      <View
        style={[
          styles.empty,
          {
            width: size,
            height: size,
            borderRadius: r,
          },
        ]}
      >
        <Text style={styles.note}>♪</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUri }}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      style={{
        width: size,
        height: size,
        borderRadius: r,
      }}
    />
  );
}

const styleDefinitions = {
  empty: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  note: {
    fontSize: 24,
    color: colors.muted,
  },
};