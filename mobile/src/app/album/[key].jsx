import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import AppShell from '../../components/AppShell';
import Cover from '../../components/Cover';
import TrackList from '../../components/TrackList';
import { usePlayer } from '../../context/PlayerContext';
import { useThemeStyles } from '../../context/ThemeContext';
import { useStore } from '../../store/store';
import { colors } from '../../theme/theme';

export default function AlbumDetail() {
	const styles = useThemeStyles(styleDefinitions);
	const { key } = useLocalSearchParams();
	const tracks = useStore((s) => s.tracks);
	const favorites = useStore((s) => s.favorites);
	const toggle = useStore((s) => s.toggleFavorite);
	const player = usePlayer();
	const decoded = decodeURIComponent(String(key || ''));
	const album = useMemo(() => {
		const [artist, name] = decoded.split('::');
		const albumTracks = tracks.filter(
			(track) => (track.artist || 'Unknown Artist') === artist &&
				(track.album || 'Single') === name
		);

		return {
			artist,
			name,
			tracks: albumTracks,
			cover: albumTracks[0]?.thumbnailUrl,
			year: albumTracks[0]?.releaseYear,
		};
	}, [tracks, decoded]);

	return (
		<AppShell title="Album">
			<View style={styles.hero}>
				<Cover uri={album.cover} size={190} r={20} />
				<Text style={styles.name}>{album.name}</Text>
				<Text style={styles.artist}>{album.artist}</Text>
				<Text style={styles.meta}>
					{album.year ? `${album.year} · ` : ''}{album.tracks.length} songs
				</Text>
				<Pressable
					style={styles.play}
					onPress={() => album.tracks[0] && player.play(album.tracks[0], album.tracks)}
				>
					<Text style={styles.playText}>▶  Play album</Text>
				</Pressable>
			</View>
			<TrackList
				tracks={album.tracks}
				activeTrack={player.activeTrack}
				isPlaying={player.isPlaying}
				onSelect={(track) => player.play(track, album.tracks)}
				onFavorite={toggle}
				favoriteIds={new Set(favorites.map((track) => String(track.id)))}
			/>
		</AppShell>
	);
}

const styleDefinitions = {
	hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 24 },
	name: { fontSize: 26, fontWeight: '900', color: colors.text, marginTop: 15, textAlign: 'center' },
	artist: { color: colors.muted, marginTop: 5 },
	meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
	play: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12, marginTop: 17 },
	playText: { color: colors.accentDark, fontWeight: '900' },
};
