import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlayerProvider } from '../context/PlayerContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { useStore } from '../store/store';
function ThemedNavigation(){const {scheme,palette}=useTheme();return <><StatusBar style={scheme==='dark'?'light':'dark'}/><View style={{flex:1,backgroundColor:palette.bg}}><Stack screenOptions={{headerShown:false,freezeOnBlur:false,contentStyle:{backgroundColor:palette.bg}}}/></View></>}
export default function Layout(){const token=useStore(s=>s.token);return <SafeAreaProvider><ThemeProvider><PlayerProvider token={token}><ThemedNavigation/></PlayerProvider></ThemeProvider></SafeAreaProvider>}
