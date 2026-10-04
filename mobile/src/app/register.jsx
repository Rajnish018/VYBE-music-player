import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useThemeStyles } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { colors, radius } from '../theme/theme';

export default function Register() {
	const styles = useThemeStyles(styleDefinitions);
	const router = useRouter();
	const register = useStore((s) => s.login);
	const loading = useStore((s) => s.loading);
	const error = useStore((s) => s.error);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');

	const submit = async () => {
		try {
			await register(email.trim(), password, true);
			router.replace('/dashboard');
		} catch {}
	};

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			style={[styles.root, { backgroundColor: colors.bg }]}
		>
			<View style={styles.card}>
				<Text style={styles.eyebrow}>PRIVATE MUSIC LIBRARY</Text>
				<Text style={styles.logo}>MEGA</Text>
				<Text style={styles.title}>Create your library</Text>
				<Text style={styles.copy}>Create an account to access your personal music collection.</Text>
				<Text style={styles.label}>Email</Text>
				<TextInput
					autoCapitalize="none"
					keyboardType="email-address"
					style={styles.input}
					value={email}
					onChangeText={setEmail}
					placeholder="you@example.com"
					placeholderTextColor={colors.muted}
				/>
				<Text style={styles.label}>Password</Text>
				<TextInput
					secureTextEntry
					style={styles.input}
					value={password}
					onChangeText={setPassword}
					placeholder="At least 6 characters"
					placeholderTextColor={colors.muted}
				/>
				{error ? <Text style={styles.error}>{error}</Text> : null}
				<Pressable style={styles.button} onPress={submit} disabled={loading}>
					<Text style={styles.buttonText}>{loading ? 'Creating…' : 'Create account'}</Text>
				</Pressable>
				<Link href="/login" style={styles.link}>Already registered? Sign in</Link>
			</View>
		</KeyboardAvoidingView>
	);
}

const styleDefinitions = {
	root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 22 },
	card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: 24 },
	eyebrow: { fontSize: 10, letterSpacing: 2, color: colors.muted, fontWeight: '800' },
	logo: { fontSize: 36, fontWeight: '900', letterSpacing: 4, color: colors.text, marginTop: 10 },
	title: { fontSize: 28, fontWeight: '900', color: colors.text, marginTop: 20 },
	copy: { color: colors.muted, lineHeight: 21, marginTop: 8, marginBottom: 25 },
	label: { color: colors.text, fontWeight: '700', marginTop: 12, marginBottom: 7 },
	input: { height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, paddingHorizontal: 14, backgroundColor: colors.surface2 },
	button: { height: 52, marginTop: 22, borderRadius: radius.md, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
	buttonText: { color: colors.accentDark, fontWeight: '900' },
	link: { color: colors.muted, textAlign: 'center', marginTop: 18 },
	error: { color: colors.danger, marginTop: 12 },
};
