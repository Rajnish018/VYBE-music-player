import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AppShell from '../components/AppShell';
import { useThemeStyles } from '../context/ThemeContext';
import { adminApi } from '../lib/api';
import { useStore } from '../store/store';
import { colors } from '../theme/theme';

export default function Admin() {
	const styles = useThemeStyles(styleDefinitions);
	const token = useStore((s) => s.token);
	const refresh = useStore((s) => s.refresh);
	const [file, setFile] = useState(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');

	const pick = async () => {
		const result = await DocumentPicker.getDocumentAsync({
			type: 'audio/*',
			copyToCacheDirectory: true,
		});

		if (!result.canceled) {
			setFile(result.assets[0]);
		}
	};

	const upload = async () => {
		if (!file) {
			return;
		}

		setBusy(true);
		setMessage('');

		try {
			const form = new FormData();
			form.append('audio', {
				uri: file.uri,
				name: file.name || 'track.mp3',
				type: file.mimeType || 'audio/mpeg',
			});
			await adminApi.uploadTrack(form, token);
			setFile(null);
			await refresh();
			setMessage('Track uploaded successfully.');
		} catch (error) {
			setMessage(error.message || 'Upload failed.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<AppShell title="Admin">
			<View style={styles.card}>
				<Text style={styles.eyebrow}>ADMINISTRATION</Text>
				<Text style={styles.title}>Upload music</Text>
				<Text style={styles.copy}>
					Upload an audio file to the same backend used by the web admin panel. Metadata processing remains server-side.
				</Text>
				<Pressable style={styles.pick} onPress={pick}>
					<Text style={styles.pickText}>{file ? file.name : 'Choose audio file'}</Text>
				</Pressable>
				<Pressable
					disabled={!file || busy}
					style={[styles.button, (!file || busy) && styles.disabled]}
					onPress={upload}
				>
					<Text style={styles.buttonText}>{busy ? 'Uploading…' : 'Upload track'}</Text>
				</Pressable>
				{message ? <Text style={styles.msg}>{message}</Text> : null}
			</View>
		</AppShell>
	);
}

const styleDefinitions = {
	card: { marginTop: 16, padding: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20 },
	eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
	title: { color: colors.text, fontSize: 25, fontWeight: '900', marginTop: 8 },
	copy: { color: colors.muted, lineHeight: 20, marginTop: 8 },
	pick: { marginTop: 22, minHeight: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 15 },
	pickText: { color: colors.text },
	button: { marginTop: 12, height: 52, borderRadius: 12, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
	disabled: { opacity: 0.35 },
	buttonText: { color: colors.accentDark, fontWeight: '900' },
	msg: { color: colors.success, marginTop: 14 },
};
