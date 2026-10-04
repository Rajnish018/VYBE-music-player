import {
  createContext,
  useContext,
  useState,
} from 'react';

import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import {
  usePathname,
  useRouter,
} from 'expo-router';

import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from './Icon';
import MiniPlayer from './MiniPlayer';
import ShareModal from './ShareModal';

import { useTheme, useThemeStyles } from '../context/ThemeContext';
import { colors } from '../theme/theme';


/* -------------------------------------------------------------------------- */
/* Share Context                                                              */
/* -------------------------------------------------------------------------- */

export const ShareContext = createContext(() => {});

export const useShare = () => useContext(ShareContext);


/* -------------------------------------------------------------------------- */
/* App Shell                                                                  */
/* -------------------------------------------------------------------------- */

export default function AppShell({
  children,
  title,
  scroll = true,
}) {
  const { palette } = useTheme();
  const styles = useThemeStyles(styleDefinitions);
  const router = useRouter();
  const path = usePathname();

  const [share, setShare] = useState(null);


  /* ------------------------------------------------------------------------ */
  /* Bottom navigation                                                        */
  /* ------------------------------------------------------------------------ */

  const nav = [
    {
      key: 'dashboard',
      icon: 'home-outline',
      label: 'Home',
      route: '/dashboard',
    },
    {
      key: 'discover',
      icon: 'search-outline',
      label: 'Discover',
      route: '/discover',
    },
    {
      key: 'library',
      icon: 'library-outline',
      label: 'Library',
      route: '/library',
    },
    {
      key: 'favorites',
      icon: 'heart-outline',
      label: 'Favorites',
      route: '/favorites',
    },
    {
      key: 'artists',
      icon: 'people-outline',
      label: 'Artists',
      route: '/artists',
    },
  ];


  /* ------------------------------------------------------------------------ */
  /* Navigation                                                               */
  /* ------------------------------------------------------------------------ */

  const handleNavigation = (route) => {
    router.replace(route);
  };


  /* ------------------------------------------------------------------------ */
  /* Active navigation                                                        */
  /* ------------------------------------------------------------------------ */

  const isActive = (key) => {
    if (!path) {
      return false;
    }

    if (key === 'artists') {
      return path.includes('artist');
    }

    return path.includes(key);
  };


  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <ShareContext.Provider value={setShare}>
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}>
        <View style={[styles.root, { backgroundColor: palette.bg }]}>

          {/* ---------------------------------------------------------------- */}
          {/* Header                                                            */}
          {/* ---------------------------------------------------------------- */}

          <View style={styles.header}>

            <View style={styles.headerLeft}>
              <Text style={styles.brand}>
                MEGA
              </Text>

              {title ? (
                <Text style={styles.heading}>
                  {title}
                </Text>
              ) : null}
            </View>

            <Pressable
              style={styles.profileButton}
              onPress={() => router.push('/settings')}
              hitSlop={10}
            >
              <Icon
                name="person-circle-outline"
                size={29}
                color={colors.text}
              />
            </Pressable>

          </View>


          {/* ---------------------------------------------------------------- */}
          {/* Page Content                                                      */}
          {/* ---------------------------------------------------------------- */}

          {scroll ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.content}>
              {children}
            </View>
          )}


          {/* ---------------------------------------------------------------- */}
          {/* Mini Player                                                       */}
          {/* ---------------------------------------------------------------- */}

          <MiniPlayer />


          {/* ---------------------------------------------------------------- */}
          {/* Bottom Navigation                                                 */}
          {/* ---------------------------------------------------------------- */}

          <View style={styles.nav}>

            {nav.map((item) => {
              const active = isActive(item.key);

              const iconName = active
                ? item.icon.replace('-outline', '')
                : item.icon;

              return (
                <Pressable
                  key={item.key}
                  style={styles.navItem}
                  onPress={() => handleNavigation(item.route)}
                  hitSlop={5}
                >
                  <Icon
                    name={iconName}
                    size={22}
                    color={
                      active
                        ? colors.accent
                        : colors.muted
                    }
                  />

                  <Text
                    style={[
                      styles.navText,
                      active && styles.navActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}

          </View>


          {/* ---------------------------------------------------------------- */}
          {/* Share Modal                                                       */}
          {/* ---------------------------------------------------------------- */}

          <ShareModal
            track={share}
            onClose={() => setShare(null)}
          />

        </View>
      </SafeAreaView>
    </ShareContext.Provider>
  );
}


/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styleDefinitions = {

  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerLeft: {
    flex: 1,
  },

  brand: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3,
    color: colors.muted,
  },

  heading: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    marginTop: 3,
  },

  profileButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingBottom: 150,
  },

  nav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,

    height: 67,

    backgroundColor: colors.surface,

    borderTopWidth: 1,
    borderTopColor: colors.border,

    flexDirection: 'row',
    justifyContent: 'space-around',

    paddingTop: 8,
  },

  navItem: {
    alignItems: 'center',
    justifyContent: 'flex-start',

    width: '20%',
  },

  navText: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
  },

  navActive: {
    color: colors.accent,
    fontWeight: '800',
  },

};
