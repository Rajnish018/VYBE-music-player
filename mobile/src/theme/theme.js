const darkColors = {
  bg: '#0B0B0D',
  black: '#0B0B0D',
  background: '#0B0B0D',
  white: '#F7F7FA',
  surface: '#131317',
  surface2: '#1B1B20',
  border: '#292930',
  text: '#F7F7FA',
  muted: '#9A9AA5',
  accent: '#e0b354',
  accentDark: '#111113',
  danger: '#FF5C6C',
  success: '#57D68D',
  overlay: 'rgba(0,0,0,0.72)'
};

const lightColors = {
  bg: '#F4F4F0',
  black: '#171714',
  background: '#F4F4F0',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#E9E9E3',
  border: '#D5D5CD',
  text: '#171714',
  muted: '#686860',
  accent: '#9A6500',
  accentDark: '#FFFFFF',
  danger: '#C83242',
  success: '#197A4A',
  overlay: 'rgba(0,0,0,0.48)'
};

export const colors = { ...darkColors };

export function getThemeColors(scheme) {
  return scheme === 'light' ? lightColors : darkColors;
}

export function setColorScheme(scheme) {
  Object.assign(colors, getThemeColors(scheme));
}

const colorTokens = Object.entries(darkColors).reduce((tokens, [name, value]) => {
  tokens.set(value, [...(tokens.get(value) || []), name]);
  return tokens;
}, new Map());

function getColorToken(value) {
  const matches = colorTokens.get(value);

  if (!matches) {
    return null;
  }

  if (matches.includes('text') && matches.includes('white')) {
    return 'text';
  }

  if (matches.includes('bg')) {
    return 'bg';
  }

  return matches[0];
}

function resolveThemedStyle(style, palette) {
  return Object.fromEntries(Object.entries(style).map(([property, value]) => {
    if (typeof value === 'string') {
      const token = getColorToken(value);

      if (token) {
        return [property, palette[token]];
      }
    }

    return [property, value && typeof value === 'object' && !Array.isArray(value)
      ? resolveThemedStyle(value, palette)
      : value];
  }));
}

export function createThemedStyles(styles, scheme = 'dark') {
  const palette = getThemeColors(scheme);

  return Object.fromEntries(Object.entries(styles).map(([name, style]) => [
    name,
    resolveThemedStyle(style, palette),
  ]));
}

export const spacing = { xs:6, sm:10, md:14, lg:18, xl:24, xxl:32 };
export const radius = { sm:8, md:12, lg:18, xl:26, pill:999 };
