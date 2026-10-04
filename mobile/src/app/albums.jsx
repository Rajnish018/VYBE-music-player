import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import AppShell from '../components/AppShell';
import Cover from '../components/Cover';
import { useThemeStyles } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { colors } from '../theme/theme';

export default function Albums() {
	const styles = useThemeStyles(styleDefinitions);
	const router = useRouter();
	const tracks = useStore((s) => s.tracks);
	const albums = useMemo(() => {
		const albumMap = new Map();

		tracks.forEach((track) => {
			const name = track.album || 'Single';
			const key = `${track.artist || 'Unknown'}::${name}`;

			if (!albumMap.has(key)) {
				albumMap.set(key, {
					key,
					name,
					artist: track.artist || 'Unknown Artist',
					cover: track.thumbnailUrl,
					year: track.releaseYear,
					tracks: [],
				});
			}

			albumMap.get(key).tracks.push(track);
		});

		return [...albumMap.values()];
	}, [tracks]);

	return (
		<AppShell title="Albums">
			<FlatList
				scrollEnabled={false}
				data={albums}
				numColumns={2}
				columnWrapperStyle={{ gap: 14 }}
				keyExtractor={(album) => album.key}
				renderItem={({ item }) => (
					<Pressable
						style={styles.card}
						onPress={() => router.push(`/album/${encodeURIComponent(item.key)}`)}
					>
						<Cover uri={item.cover} size={155} r={18} />
						<Text numberOfLines={1} style={styles.name}>{item.name}</Text>
						<Text numberOfLines={1} style={styles.meta}>
							{item.artist} · {item.tracks.length} songs
						</Text>
					</Pressable>
				)}
			/>
		</AppShell>
	);
}

const styleDefinitions = {
	card: { width: '47%', marginBottom: 22 },
	name: { color: colors.text, fontWeight: '800', marginTop: 9 },
	meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
};
