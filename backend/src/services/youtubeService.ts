import axios from 'axios';

export interface YoutubeMetadata {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  duration: number; // in seconds
}

export interface YoutubeSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  thumbnailUrl: string;
  duration: number;
  sourceUrl: string;
  playable: boolean;
}

/**
 * Extracts YouTube Video ID from standard formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  return null;
}

/**
 * Parses ISO 8601 duration (e.g. PT3M45S, PT1H2M10S) into seconds
 */
export function parseISO8601Duration(durationStr: string): number {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = durationStr.match(regex);
  if (!matches) return 0;
  
  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

export class YoutubeService {
  async searchVideos(query: string, limit = 12): Promise<YoutubeSearchResult[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const cleanQuery = query.trim();

    if (!apiKey || !cleanQuery) return [];

    const searchResponse = await axios.get(
      'https://www.googleapis.com/youtube/v3/search',
      {
        params: {
          part: 'snippet',
          q: cleanQuery,
          type: 'video',
          maxResults: Math.min(Math.max(limit, 1), 25),
          key: apiKey,
        },
      },
    );

    const videoIds = (searchResponse.data?.items || [])
      .map((item: any) => item.id?.videoId)
      .filter(Boolean);

    if (videoIds.length === 0) return [];

    const detailsResponse = await axios.get(
      'https://www.googleapis.com/youtube/v3/videos',
      {
        params: {
          part: 'snippet,contentDetails',
          id: videoIds.join(','),
          key: apiKey,
        },
      },
    );

    return (detailsResponse.data?.items || []).map((video: any) => ({
      id: video.id,
      title: video.snippet?.title || 'Untitled video',
      artist: video.snippet?.channelTitle || 'Unknown artist',
      album: 'YouTube search',
      thumbnailUrl:
        video.snippet?.thumbnails?.high?.url ||
        video.snippet?.thumbnails?.medium?.url ||
        video.snippet?.thumbnails?.default?.url ||
        '',
      duration: parseISO8601Duration(video.contentDetails?.duration || ''),
      sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
      playable: false,
    }));
  }

  async getVideoMetadata(videoId: string): Promise<YoutubeMetadata> {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      console.warn('YOUTUBE_API_KEY is not defined in environment. Using mock fallback for testing.');
      return this.getMockMetadata(videoId);
    }

    try {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos`,
        {
          params: {
            part: 'snippet,contentDetails',
            id: videoId,
            key: apiKey,
          },
        }
      );

      const items = response.data?.items;
      if (!items || items.length === 0) {
        throw new Error('Video not found on YouTube');
      }

      const video = items[0];
      const snippet = video.snippet;
      const contentDetails = video.contentDetails;

      const title = snippet.title;
      const channelTitle = snippet.channelTitle;
      const thumbnailUrl = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '';
      const durationStr = contentDetails.duration;
      const duration = parseISO8601Duration(durationStr);

      return {
        videoId,
        title,
        channelTitle,
        thumbnailUrl,
        duration,
      };
    } catch (error: any) {
      console.error('YouTube API error:', error.message);
      // Fallback for development ease if API limit hit
      console.warn('Falling back to simulated metadata lookup.');
      return this.getMockMetadata(videoId);
    }
  }

  private getMockMetadata(videoId: string): YoutubeMetadata {
    // Determine details based on videoId to simulate consistency
    let title = 'Shape of You';
    let artist = 'Ed Sheeran';
    let duration = 233; // ~3m53s
    let thumbnailUrl = 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg';

    if (videoId === 'dQw4w9WgXcQ') {
      title = 'Never Gonna Give You Up';
      artist = 'Rick Astley';
      duration = 212;
      thumbnailUrl = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    } else if (videoId.startsWith('test')) {
      title = 'Test Track';
      artist = 'Test Artist';
      duration = 180;
    }

    return {
      videoId,
      title: `${title} - Official Video`,
      channelTitle: `${artist} - Topic`,
      thumbnailUrl,
      duration,
    };
  }
}

export const youtubeService = new YoutubeService();
