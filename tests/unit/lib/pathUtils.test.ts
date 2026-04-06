// @vitest-environment node
import { dirname, basename, extname } from '../../../src/renderer/lib/pathUtils';

describe('pathUtils', () => {
  describe('dirname', () => {
    it('should return parent directory for Unix path', () => {
      expect(dirname('/home/user/file.bms')).toBe('/home/user');
    });

    it('should normalize and return parent for Windows path', () => {
      expect(dirname('C:\\Users\\test\\file.bms')).toBe('C:/Users/test');
    });

    it('should return "." when there is no slash', () => {
      expect(dirname('file.bms')).toBe('.');
    });

    it('should return "/" for a file at root', () => {
      expect(dirname('/file.bms')).toBe('/');
    });

    it('should handle deeply nested paths', () => {
      expect(dirname('/a/b/c/d.txt')).toBe('/a/b/c');
    });

    it('should handle trailing slash (returns parent without trailing slash)', () => {
      expect(dirname('/home/user/')).toBe('/home/user');
    });

    it('should handle mixed forward and back slashes', () => {
      expect(dirname('C:\\foo/bar\\baz.txt')).toBe('C:/foo/bar');
    });

    it('should return "." for an empty string', () => {
      expect(dirname('')).toBe('.');
    });
  });

  describe('basename', () => {
    it('should return filename from Unix path', () => {
      expect(basename('/home/user/file.bms')).toBe('file.bms');
    });

    it('should return filename from Windows path', () => {
      expect(basename('C:\\Users\\file.bms')).toBe('file.bms');
    });

    it('should return the string itself when there is no slash', () => {
      expect(basename('file.bms')).toBe('file.bms');
    });

    it('should return filename from nested path', () => {
      expect(basename('/a/b/c.txt')).toBe('c.txt');
    });

    it('should return filename without extension unchanged', () => {
      expect(basename('/path/to/Makefile')).toBe('Makefile');
    });

    it('should return empty string for path ending with slash', () => {
      expect(basename('/home/user/')).toBe('');
    });

    it('should return the string itself for a bare filename', () => {
      expect(basename('song.wav')).toBe('song.wav');
    });
  });

  describe('extname', () => {
    it('should return extension for normal filename', () => {
      expect(extname('file.bms')).toBe('.bms');
    });

    it('should return only the last extension for multiple dots', () => {
      expect(extname('file.test.bms')).toBe('.bms');
    });

    it('should return empty string when there is no extension', () => {
      expect(extname('Makefile')).toBe('');
    });

    it('should return the full name for dot-prefixed files (e.g. .gitignore)', () => {
      // basename is ".gitignore", lastDot is 0, substring(0) returns ".gitignore"
      expect(extname('.gitignore')).toBe('.gitignore');
    });

    it('should extract extension from a full Unix path', () => {
      expect(extname('/path/to/song.wav')).toBe('.wav');
    });

    it('should extract extension from a full Windows path', () => {
      expect(extname('C:\\Users\\test\\chart.bme')).toBe('.bme');
    });

    it('should return empty string for empty input', () => {
      expect(extname('')).toBe('');
    });

    it('should handle uppercase extensions', () => {
      expect(extname('SONG.WAV')).toBe('.WAV');
    });

    it('should return extension when path has dots in directory names', () => {
      expect(extname('/path.d/to.dir/file.txt')).toBe('.txt');
    });
  });
});
