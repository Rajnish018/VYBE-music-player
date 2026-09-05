import { MusicFile } from '@prisma/client';

export interface PlaybackSource {
  url: string;
  headers?: Record<string, string>;
}

export interface AudioPlaybackProvider {
  getPlaybackSource(musicFile: MusicFile): Promise<PlaybackSource>;
}

export class MegaPlaybackProvider implements AudioPlaybackProvider {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    // Falls back to standard localhost or customized config
    this.apiBaseUrl = apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:3000';
  }

  async getPlaybackSource(musicFile: MusicFile): Promise<PlaybackSource> {
    // Return backend proxy streaming URL
    return {
      url: `${this.apiBaseUrl}/api/tracks/${musicFile.trackId}/play`,
    };
  }
}
export const playbackService = new MegaPlaybackProvider(process.env.API_BASE_URL || '');
export default playbackService;
