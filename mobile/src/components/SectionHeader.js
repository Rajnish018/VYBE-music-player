import { Text, View } from 'react-native';
import { useThemeStyles } from '../context/ThemeContext';
import { colors } from '../theme/theme';

const styleDefinitions = {
	row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 },
	title: { fontSize: 20, fontWeight: '900', color: colors.text },
	action: { color: colors.muted, fontWeight: '700' },
};

export default function SectionHeader({ title, action, onAction }) {
	const styles = useThemeStyles(styleDefinitions);

	return (
		<View style={styles.row}>
			<Text style={styles.title}>{title}</Text>
			{action ? <Text onPress={onAction} style={styles.action}>{action}</Text> : null}
		</View>
	);
}
