import type { NoteType } from '@rhythm-archive/bms-core';

// --- Types ---

export interface PatternNote {
  /** Relative beat offset from pattern start */
  beatOffset: number;
  /** Column index (0-based, relative within pattern) */
  columnIndex: number;
  noteType: NoteType;
  /** For long notes: relative endBeat offset */
  endBeatOffset?: number;
}

export interface PatternTemplate {
  id: string;
  name: string;
  category: PatternCategory;
  tags: string[];
  notes: PatternNote[];
  /** How many columns this pattern spans */
  columnCount: number;
  /** Total beat length of the pattern */
  beatLength: number;
  isBuiltIn: boolean;
}

export type PatternCategory =
  | 'stairs'
  | 'chord'
  | 'jack'
  | 'roll'
  | 'trill'
  | 'scratch'
  | 'stream'
  | 'custom';

export const CATEGORY_LABELS: Record<PatternCategory, string> = {
  stairs: '계단',
  chord: '동시치기',
  jack: '잭',
  roll: '롤',
  trill: '트릴',
  scratch: '스크래치',
  stream: '스트림',
  custom: '사용자 정의',
};

// --- Built-in patterns ---

function makeId(prefix: string, idx: number): string {
  return `builtin-${prefix}-${idx}`;
}

const BUILT_IN_PATTERNS: PatternTemplate[] = [
  // Stairs (ascending)
  {
    id: makeId('stairs', 1),
    name: '계단 (오름)',
    category: 'stairs',
    tags: ['basic', '7key'],
    notes: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
      beatOffset: i * 0.25,
      columnIndex: i,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 7,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Stairs (descending)
  {
    id: makeId('stairs', 2),
    name: '계단 (내림)',
    category: 'stairs',
    tags: ['basic', '7key'],
    notes: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
      beatOffset: i * 0.25,
      columnIndex: 6 - i,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 7,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Stairs (ascending, 16th)
  {
    id: makeId('stairs', 3),
    name: '16분 계단 (오름)',
    category: 'stairs',
    tags: ['fast', '7key'],
    notes: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
      beatOffset: i * 0.125,
      columnIndex: i,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 7,
    beatLength: 1,
    isBuiltIn: true,
  },
  // Chord (2 notes)
  {
    id: makeId('chord', 1),
    name: '2겹 동시',
    category: 'chord',
    tags: ['basic'],
    notes: [
      { beatOffset: 0, columnIndex: 0, noteType: 'playable' as NoteType },
      { beatOffset: 0, columnIndex: 3, noteType: 'playable' as NoteType },
    ],
    columnCount: 4,
    beatLength: 0.25,
    isBuiltIn: true,
  },
  // Chord (3 notes)
  {
    id: makeId('chord', 2),
    name: '3겹 동시',
    category: 'chord',
    tags: ['basic'],
    notes: [
      { beatOffset: 0, columnIndex: 0, noteType: 'playable' as NoteType },
      { beatOffset: 0, columnIndex: 2, noteType: 'playable' as NoteType },
      { beatOffset: 0, columnIndex: 4, noteType: 'playable' as NoteType },
    ],
    columnCount: 5,
    beatLength: 0.25,
    isBuiltIn: true,
  },
  // Chord (4 notes)
  {
    id: makeId('chord', 3),
    name: '4겹 동시',
    category: 'chord',
    tags: ['dense'],
    notes: [
      { beatOffset: 0, columnIndex: 0, noteType: 'playable' as NoteType },
      { beatOffset: 0, columnIndex: 1, noteType: 'playable' as NoteType },
      { beatOffset: 0, columnIndex: 2, noteType: 'playable' as NoteType },
      { beatOffset: 0, columnIndex: 3, noteType: 'playable' as NoteType },
    ],
    columnCount: 4,
    beatLength: 0.25,
    isBuiltIn: true,
  },
  // Chord stream (repeated 2-note chords)
  {
    id: makeId('chord', 4),
    name: '동시치기 스트림',
    category: 'chord',
    tags: ['stream'],
    notes: [0, 1, 2, 3].flatMap((i) => [
      { beatOffset: i * 0.5, columnIndex: i % 2 === 0 ? 0 : 2, noteType: 'playable' as NoteType },
      { beatOffset: i * 0.5, columnIndex: i % 2 === 0 ? 3 : 5, noteType: 'playable' as NoteType },
    ]),
    columnCount: 6,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Jack (same column rapid)
  {
    id: makeId('jack', 1),
    name: '8분 잭',
    category: 'jack',
    tags: ['basic'],
    notes: [0, 1, 2, 3].map((i) => ({
      beatOffset: i * 0.5,
      columnIndex: 0,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 1,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Jack (16th)
  {
    id: makeId('jack', 2),
    name: '16분 잭',
    category: 'jack',
    tags: ['fast'],
    notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      beatOffset: i * 0.25,
      columnIndex: 0,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 1,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Double jack
  {
    id: makeId('jack', 3),
    name: '더블 잭',
    category: 'jack',
    tags: ['dense'],
    notes: [0, 1, 2, 3].flatMap((i) => [
      { beatOffset: i * 0.5, columnIndex: 0, noteType: 'playable' as NoteType },
      { beatOffset: i * 0.5, columnIndex: 1, noteType: 'playable' as NoteType },
    ]),
    columnCount: 2,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Roll (2-column alternating)
  {
    id: makeId('roll', 1),
    name: '8분 롤',
    category: 'roll',
    tags: ['basic'],
    notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      beatOffset: i * 0.5,
      columnIndex: i % 2,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 2,
    beatLength: 4,
    isBuiltIn: true,
  },
  // Roll (16th)
  {
    id: makeId('roll', 2),
    name: '16분 롤',
    category: 'roll',
    tags: ['fast'],
    notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      beatOffset: i * 0.25,
      columnIndex: i % 2,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 2,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Trill (fast alternating)
  {
    id: makeId('trill', 1),
    name: '16분 트릴',
    category: 'trill',
    tags: ['fast'],
    notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => ({
      beatOffset: i * 0.125,
      columnIndex: i % 2,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 2,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Trill (32nd burst)
  {
    id: makeId('trill', 2),
    name: '32분 트릴 버스트',
    category: 'trill',
    tags: ['burst'],
    notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      beatOffset: i * 0.0625,
      columnIndex: i % 2,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 2,
    beatLength: 0.5,
    isBuiltIn: true,
  },
  // Scratch pattern
  {
    id: makeId('scratch', 1),
    name: '스크래치 연타',
    category: 'scratch',
    tags: ['scratch'],
    notes: [0, 1, 2, 3].map((i) => ({
      beatOffset: i * 0.5,
      columnIndex: 0,
      noteType: 'playable' as NoteType,
    })),
    columnCount: 1,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Scratch + keys
  {
    id: makeId('scratch', 2),
    name: '스크래치 + 키',
    category: 'scratch',
    tags: ['mixed'],
    notes: [
      { beatOffset: 0, columnIndex: 0, noteType: 'playable' as NoteType },
      { beatOffset: 0, columnIndex: 3, noteType: 'playable' as NoteType },
      { beatOffset: 0.5, columnIndex: 2, noteType: 'playable' as NoteType },
      { beatOffset: 1, columnIndex: 0, noteType: 'playable' as NoteType },
      { beatOffset: 1, columnIndex: 4, noteType: 'playable' as NoteType },
      { beatOffset: 1.5, columnIndex: 1, noteType: 'playable' as NoteType },
    ],
    columnCount: 5,
    beatLength: 2,
    isBuiltIn: true,
  },
  // Stream (continuous flowing notes)
  {
    id: makeId('stream', 1),
    name: '8분 스트림',
    category: 'stream',
    tags: ['basic'],
    notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      beatOffset: i * 0.5,
      columnIndex: [0, 2, 4, 6, 1, 3, 5, 0][i],
      noteType: 'playable' as NoteType,
    })),
    columnCount: 7,
    beatLength: 4,
    isBuiltIn: true,
  },
  // Dense stream (16th)
  {
    id: makeId('stream', 2),
    name: '16분 스트림',
    category: 'stream',
    tags: ['fast'],
    notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => ({
      beatOffset: i * 0.25,
      columnIndex: [0, 3, 1, 4, 2, 5, 3, 6, 0, 4, 1, 5, 2, 6, 3, 0][i],
      noteType: 'playable' as NoteType,
    })),
    columnCount: 7,
    beatLength: 4,
    isBuiltIn: true,
  },
];

// --- Storage ---

const STORAGE_KEY = 'bms-editor-patterns';

export function loadUserPatterns(): PatternTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PatternTemplate[];
  } catch {
    return [];
  }
}

export function saveUserPatterns(patterns: PatternTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
}

export function getAllPatterns(): PatternTemplate[] {
  return [...BUILT_IN_PATTERNS, ...loadUserPatterns()];
}

export function getPatternsByCategory(category: PatternCategory): PatternTemplate[] {
  return getAllPatterns().filter((p) => p.category === category);
}

export function saveNewPattern(pattern: Omit<PatternTemplate, 'id' | 'isBuiltIn'>): PatternTemplate {
  const userPatterns = loadUserPatterns();
  const newPattern: PatternTemplate = {
    ...pattern,
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    isBuiltIn: false,
  };
  userPatterns.push(newPattern);
  saveUserPatterns(userPatterns);
  return newPattern;
}

export function deleteUserPattern(id: string): void {
  const userPatterns = loadUserPatterns().filter((p) => p.id !== id);
  saveUserPatterns(userPatterns);
}

export function getBuiltInPatterns(): PatternTemplate[] {
  return BUILT_IN_PATTERNS;
}
