import {
  getBuiltInPatterns,
  getAllPatterns,
  getPatternsByCategory,
  loadUserPatterns,
  saveNewPattern,
  deleteUserPattern,
  resolveCategoryLabel,
  saveUserPatterns,
} from '../../../src/renderer/lib/patternTemplates';
import type { PatternTemplate, PatternCategory } from '../../../src/renderer/lib/patternTemplates';

const STORAGE_KEY = 'bms-editor-patterns';

describe('patternTemplates', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getBuiltInPatterns', () => {
    it('returns 18 patterns', () => {
      expect(getBuiltInPatterns()).toHaveLength(18);
    });

    it('all have isBuiltIn: true', () => {
      for (const p of getBuiltInPatterns()) {
        expect(p.isBuiltIn).toBe(true);
      }
    });

    it('all have required fields', () => {
      for (const p of getBuiltInPatterns()) {
        expect(p.id).toBeDefined();
        expect(typeof p.id).toBe('string');
        expect(p.nameKey).toBeDefined();
        expect(typeof p.nameKey).toBe('string');
        expect(p.category).toBeDefined();
        expect(p.notes).toBeDefined();
        expect(Array.isArray(p.notes)).toBe(true);
        expect(typeof p.columnCount).toBe('number');
        expect(typeof p.beatLength).toBe('number');
      }
    });

    it('all IDs start with "builtin-"', () => {
      for (const p of getBuiltInPatterns()) {
        expect(p.id).toMatch(/^builtin-/);
      }
    });
  });

  describe('getAllPatterns', () => {
    it('returns built-in only (18) when no user patterns exist', () => {
      const all = getAllPatterns();
      expect(all).toHaveLength(18);
    });

    it('returns merged list with user patterns', () => {
      const userPattern: PatternTemplate = {
        id: 'user-test-1',
        nameKey: 'Test Pattern',
        category: 'custom',
        tags: [],
        notes: [{ beatOffset: 0, columnIndex: 0, noteType: 'playable' }],
        columnCount: 1,
        beatLength: 1,
        isBuiltIn: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([userPattern]));

      const all = getAllPatterns();
      expect(all).toHaveLength(19);
    });

    it('built-in patterns come first', () => {
      const userPattern: PatternTemplate = {
        id: 'user-test-1',
        nameKey: 'Test Pattern',
        category: 'custom',
        tags: [],
        notes: [],
        columnCount: 1,
        beatLength: 1,
        isBuiltIn: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([userPattern]));

      const all = getAllPatterns();
      // First 18 should be built-in
      for (let i = 0; i < 18; i++) {
        expect(all[i].isBuiltIn).toBe(true);
      }
      // Last one is user pattern
      expect(all[18].isBuiltIn).toBe(false);
    });
  });

  describe('getPatternsByCategory', () => {
    it('returns 3 stairs patterns', () => {
      expect(getPatternsByCategory('stairs')).toHaveLength(3);
    });

    it('returns 4 chord patterns', () => {
      expect(getPatternsByCategory('chord')).toHaveLength(4);
    });

    it('returns 3 jack patterns', () => {
      expect(getPatternsByCategory('jack')).toHaveLength(3);
    });

    it('returns 0 custom patterns by default', () => {
      expect(getPatternsByCategory('custom')).toHaveLength(0);
    });

    it('includes user patterns of same category', () => {
      const userPattern: PatternTemplate = {
        id: 'user-stairs-1',
        nameKey: 'Custom Stairs',
        category: 'stairs',
        tags: [],
        notes: [],
        columnCount: 7,
        beatLength: 2,
        isBuiltIn: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([userPattern]));

      expect(getPatternsByCategory('stairs')).toHaveLength(4);
    });
  });

  describe('loadUserPatterns', () => {
    it('returns empty array when no localStorage data', () => {
      expect(loadUserPatterns()).toEqual([]);
    });

    it('returns parsed array for valid data', () => {
      const patterns: PatternTemplate[] = [
        {
          id: 'user-1',
          nameKey: 'Test',
          category: 'custom',
          tags: [],
          notes: [],
          columnCount: 1,
          beatLength: 1,
          isBuiltIn: false,
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
      const loaded = loadUserPatterns();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('user-1');
    });

    it('returns empty array for corrupt JSON (graceful fallback)', () => {
      localStorage.setItem(STORAGE_KEY, '{not valid json!!!');
      expect(loadUserPatterns()).toEqual([]);
    });
  });

  describe('saveNewPattern', () => {
    it('creates pattern with generated id starting with "user-"', () => {
      const result = saveNewPattern({
        nameKey: 'My Pattern',
        category: 'custom',
        tags: ['test'],
        notes: [{ beatOffset: 0, columnIndex: 0, noteType: 'playable' }],
        columnCount: 1,
        beatLength: 1,
      });
      expect(result.id).toMatch(/^user-/);
    });

    it('sets isBuiltIn to false', () => {
      const result = saveNewPattern({
        nameKey: 'My Pattern',
        category: 'custom',
        tags: [],
        notes: [],
        columnCount: 1,
        beatLength: 1,
      });
      expect(result.isBuiltIn).toBe(false);
    });

    it('saves to localStorage', () => {
      saveNewPattern({
        nameKey: 'Saved Pattern',
        category: 'jack',
        tags: [],
        notes: [],
        columnCount: 1,
        beatLength: 1,
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored).toHaveLength(1);
      expect(stored[0].nameKey).toBe('Saved Pattern');
    });

    it('subsequent getAllPatterns includes the saved pattern', () => {
      saveNewPattern({
        nameKey: 'Included Pattern',
        category: 'custom',
        tags: [],
        notes: [],
        columnCount: 1,
        beatLength: 1,
      });
      const all = getAllPatterns();
      expect(all).toHaveLength(19);
      expect(all.some((p) => p.nameKey === 'Included Pattern')).toBe(true);
    });
  });

  describe('deleteUserPattern', () => {
    beforeEach(() => {
      // Set up two user patterns
      const patterns: PatternTemplate[] = [
        {
          id: 'user-del-1',
          nameKey: 'Delete Me',
          category: 'custom',
          tags: [],
          notes: [],
          columnCount: 1,
          beatLength: 1,
          isBuiltIn: false,
        },
        {
          id: 'user-del-2',
          nameKey: 'Keep Me',
          category: 'custom',
          tags: [],
          notes: [],
          columnCount: 1,
          beatLength: 1,
          isBuiltIn: false,
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
    });

    it('removes the pattern by id', () => {
      deleteUserPattern('user-del-1');
      const remaining = loadUserPatterns();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('user-del-2');
    });

    it('other patterns remain after deletion', () => {
      deleteUserPattern('user-del-1');
      const remaining = loadUserPatterns();
      expect(remaining.some((p) => p.nameKey === 'Keep Me')).toBe(true);
    });

    it('deleting non-existent id is safe', () => {
      deleteUserPattern('user-nonexistent');
      const remaining = loadUserPatterns();
      expect(remaining).toHaveLength(2);
    });
  });

  describe('resolveCategoryLabel', () => {
    const allCategories: PatternCategory[] = [
      'stairs', 'chord', 'jack', 'roll', 'trill', 'scratch', 'stream', 'custom',
    ];

    it('returns a non-empty string for all 8 categories', () => {
      for (const cat of allCategories) {
        const label = resolveCategoryLabel(cat);
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }
    });
  });
});
