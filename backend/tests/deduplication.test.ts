import {
  normalizeTitle,
  normalizeArtist,
  getLevenshteinDistance,
  getStringSimilarity
} from '../src/services/deduplicationService';

describe('Deduplication Service Helper Tests', () => {
  describe('normalizeTitle', () => {
    it('should strip common video suffixes and bracket noise', () => {
      const inputs = [
        'Shape of You - Official Video',
        'Shape Of You (Official Lyric Video)',
        'Shape Of You [Official Audio]',
        'Shape Of You HD 1080p',
        'Shape of You (Lyrics)'
      ];
      inputs.forEach(input => {
        expect(normalizeTitle(input)).toBe('shape of you');
      });
    });

    it('should strip punctuation and normalize spacing', () => {
      expect(normalizeTitle('  Shape... Of   You!  ')).toBe('shape of you');
    });

    it('should keep meaningful title information', () => {
      expect(normalizeTitle('Shape of You (Ed Sheeran Remix)')).toBe('shape of you ed sheeran remix');
    });
  });

  describe('normalizeArtist', () => {
    it('should strip vevo and topic suffixes', () => {
      expect(normalizeArtist('EdSheeranVEVO')).toBe('edsheeran');
      expect(normalizeArtist('Ed Sheeran - Topic')).toBe('ed sheeran');
      expect(normalizeArtist('Ed Sheeran Official')).toBe('ed sheeran');
    });
  });

  describe('getLevenshteinDistance & getStringSimilarity', () => {
    it('should compute exact similarity', () => {
      expect(getStringSimilarity('shape of you', 'shape of you')).toBe(1.0);
    });

    it('should handle small differences', () => {
      // Shape of You vs Shape Of You
      const sim = getStringSimilarity('shape of you', 'shape of you');
      expect(sim).toBe(1.0);
    });

    it('should calculate correct similarity for typos', () => {
      // Levenshtein distance = 1 (substitution of 'e' to 'a')
      const sim = getStringSimilarity('shape', 'shapa');
      expect(sim).toBe(0.8); // 1.0 - 1/5
    });

    it('should calculate correct similarity for distinct strings', () => {
      const sim = getStringSimilarity('shape of you', 'despacito');
      expect(sim).toBeLessThan(0.3);
    });
  });
});
