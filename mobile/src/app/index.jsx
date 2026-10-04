import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { colors } from '../theme/theme';

export default function Index() {
	useTheme();
	const initialized = useStore((s) => s.initialized);
	const initializing = useStore((s) => s.initializing);
	const token = useStore((s) => s.token);
	const initialize = useStore((s) => s.initialize);

	useEffect(() => {
		initialize();
	}, []);

	if (initializing || !initialized) {
		return (
			<View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
				<ActivityIndicator color={colors.text} />
			</View>
		);
	}

	return <Redirect href={token ? '/dashboard' : '/login'} />;
}
