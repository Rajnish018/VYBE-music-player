import { extractYouTubeVideoId, parseISO8601Duration } from '../src/services/youtubeService';

describe('YouTube Service Helper Tests', () => {
  describe('extractYouTubeVideoId', () => {
    it('should extract video ID from standard watch URL', () => {
      const urls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'
      ];
      urls.forEach(url => {
        expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
      });
    });

    it('should extract video ID from short shared URL', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from shorts URL', () => {
      const url = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';
      expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should return null for invalid URLs', () => {
      const invalidUrls = [
        'https://www.google.com',
        'https://www.youtube.com',
        'https://youtu.be/',
        'https://youtu.be/short', // too short ID
        '',
      ];
      invalidUrls.forEach(url => {
        expect(extractYouTubeVideoId(url)).toBeNull();
      });
    });
  });

  describe('parseISO8601Duration', () => {
    it('should parse simple minutes and seconds', () => {
      expect(parseISO8601Duration('PT3M45S')).toBe(225);
      expect(parseISO8601Duration('PT0M30S')).toBe(30);
    });

    it('should parse duration with hours', () => {
      expect(parseISO8601Duration('PT1H2M10S')).toBe(3730);
    });

    it('should parse duration with only seconds', () => {
      expect(parseISO8601Duration('PT45S')).toBe(45);
    });

    it('should parse duration with only minutes', () => {
      expect(parseISO8601Duration('PT4M')).toBe(240);
    });

    it('should return 0 for invalid inputs', () => {
      expect(parseISO8601Duration('invalid')).toBe(0);
    });
  });
});
