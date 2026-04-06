import React from 'react';
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PatternTemplate, PatternCategory } from '../../../src/renderer/lib/patternTemplates';

// --- Mock data ---

const mockPatterns: PatternTemplate[] = [
  {
    id: 'builtin-stairs-1',
    name: 'Stairs Up',
    category: 'stairs',
    tags: ['basic'],
    notes: [
      { beatOffset: 0, columnIndex: 0, noteType: 'playable' },
      { beatOffset: 0.25, columnIndex: 1, noteType: 'playable' },
    ],
    columnCount: 4,
    beatLength: 4,
    isBuiltIn: true,
  },
  {
    id: 'builtin-chord-1',
    name: 'Basic Chord',
    category: 'chord',
    tags: ['easy'],
    notes: [
      { beatOffset: 0, columnIndex: 0, noteType: 'playable' },
      { beatOffset: 0, columnIndex: 2, noteType: 'playable' },
    ],
    columnCount: 4,
    beatLength: 2,
    isBuiltIn: true,
  },
  {
    id: 'builtin-jack-1',
    name: 'Jack Pattern',
    category: 'jack',
    tags: ['fast', 'jack'],
    notes: [
      { beatOffset: 0, columnIndex: 0, noteType: 'playable' },
      { beatOffset: 0.5, columnIndex: 0, noteType: 'playable' },
      { beatOffset: 1, columnIndex: 0, noteType: 'playable' },
    ],
    columnCount: 1,
    beatLength: 2,
    isBuiltIn: true,
  },
  {
    id: 'builtin-roll-1',
    name: 'Roll Pattern',
    category: 'roll',
    tags: ['roll'],
    notes: [
      { beatOffset: 0, columnIndex: 0, noteType: 'playable' },
      { beatOffset: 0.5, columnIndex: 1, noteType: 'playable' },
    ],
    columnCount: 2,
    beatLength: 1,
    isBuiltIn: true,
  },
  {
    id: 'user-1',
    name: 'My Custom',
    category: 'custom',
    tags: ['my', 'pattern'],
    notes: [{ beatOffset: 0, columnIndex: 0, noteType: 'playable' }],
    columnCount: 4,
    beatLength: 1,
    isBuiltIn: false,
  },
];

const mockCategoryLabels: Record<PatternCategory, string> = {
  stairs: '계단',
  chord: '동시치기',
  jack: '잭',
  roll: '롤',
  trill: '트릴',
  scratch: '스크래치',
  stream: '스트림',
  custom: '사용자 정의',
};

// --- Mocks ---

vi.mock('../../../src/renderer/lib/patternTemplates', () => ({
  getAllPatterns: vi.fn(() => mockPatterns),
  CATEGORY_LABELS: {
    stairs: '계단',
    chord: '동시치기',
    jack: '잭',
    roll: '롤',
    trill: '트릴',
    scratch: '스크래치',
    stream: '스트림',
    custom: '사용자 정의',
  },
  saveNewPattern: vi.fn(),
  deleteUserPattern: vi.fn(),
}));

// Mock canvas getContext for PatternPreview
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
  });
});

import { PatternLibraryPanel } from '../../../src/renderer/components/PatternLibraryPanel';
import { getAllPatterns, deleteUserPattern } from '../../../src/renderer/lib/patternTemplates';

describe('PatternLibraryPanel', () => {
  let onApplyPattern: ReturnType<typeof vi.fn>;
  let onSaveSelection: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (getAllPatterns as ReturnType<typeof vi.fn>).mockReturnValue(mockPatterns);
    onApplyPattern = vi.fn();
    onSaveSelection = vi.fn().mockReturnValue(null);
  });

  function renderPanel() {
    return render(
      <PatternLibraryPanel
        onApplyPattern={onApplyPattern}
        onSaveSelection={onSaveSelection}
      />,
    );
  }

  // 1. Renders title
  it('renders the panel title', () => {
    renderPanel();
    expect(screen.getByText('패턴 라이브러리')).toBeInTheDocument();
  });

  // 2. Shows search input
  it('shows search input with placeholder', () => {
    renderPanel();
    const input = screen.getByPlaceholderText('검색...');
    expect(input).toBeInTheDocument();
  });

  // 3. Shows save selection button
  it('shows the save selection button', () => {
    renderPanel();
    expect(screen.getByText('선택 노트를 패턴으로 저장')).toBeInTheDocument();
  });

  // 4. Renders category sections with CATEGORY_LABELS
  it('renders category labels for categories that have patterns', () => {
    renderPanel();
    // Categories with patterns in our mock: stairs, chord, jack, roll, custom
    expect(screen.getByText('계단')).toBeInTheDocument();
    expect(screen.getByText('동시치기')).toBeInTheDocument();
    expect(screen.getByText('잭')).toBeInTheDocument();
    expect(screen.getByText('롤')).toBeInTheDocument();
    expect(screen.getByText('사용자 정의')).toBeInTheDocument();
  });

  // 5. Initially expanded categories: stairs, chord, jack
  it('initially expands stairs, chord, and jack categories', () => {
    renderPanel();
    // Patterns in initially expanded categories should be visible
    expect(screen.getByText('Stairs Up')).toBeInTheDocument();
    expect(screen.getByText('Basic Chord')).toBeInTheDocument();
    expect(screen.getByText('Jack Pattern')).toBeInTheDocument();
  });

  // 6. Initially collapsed categories don't show patterns
  it('does not show patterns in initially collapsed categories', () => {
    renderPanel();
    // 'roll' and 'custom' are not in the initial expanded set
    expect(screen.queryByText('Roll Pattern')).not.toBeInTheDocument();
    expect(screen.queryByText('My Custom')).not.toBeInTheDocument();
  });

  // 7. Clicking collapsed category expands it
  it('expands a collapsed category when clicked', () => {
    renderPanel();
    // 'roll' category is collapsed by default
    expect(screen.queryByText('Roll Pattern')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('롤'));

    expect(screen.getByText('Roll Pattern')).toBeInTheDocument();
  });

  // 8. Clicking expanded category collapses it
  it('collapses an expanded category when clicked', () => {
    renderPanel();
    expect(screen.getByText('Stairs Up')).toBeInTheDocument();

    fireEvent.click(screen.getByText('계단'));

    expect(screen.queryByText('Stairs Up')).not.toBeInTheDocument();
  });

  // 9. Each pattern shows note count and beat length info
  it('shows note count and beat length for each visible pattern', () => {
    renderPanel();
    // Stairs Up: 2 notes, 4 beats
    expect(screen.getByText('2노트 · 4비트')).toBeInTheDocument();
    // Basic Chord: 2 notes, 2 beats
    expect(screen.getByText('2노트 · 2비트')).toBeInTheDocument();
    // Jack Pattern: 3 notes, 2 beats
    expect(screen.getByText('3노트 · 2비트')).toBeInTheDocument();
  });

  // 10. Clicking a pattern calls onApplyPattern
  it('calls onApplyPattern with the pattern when clicked', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Stairs Up'));

    expect(onApplyPattern).toHaveBeenCalledTimes(1);
    expect(onApplyPattern).toHaveBeenCalledWith(mockPatterns[0]);
  });

  // 11. Search filtering: typing filters patterns by name
  it('filters patterns by name when searching', () => {
    renderPanel();
    const input = screen.getByPlaceholderText('검색...');

    fireEvent.change(input, { target: { value: 'Stairs' } });

    expect(screen.getByText('Stairs Up')).toBeInTheDocument();
    expect(screen.queryByText('Basic Chord')).not.toBeInTheDocument();
    expect(screen.queryByText('Jack Pattern')).not.toBeInTheDocument();
  });

  // 12. Search filtering by tags
  it('filters patterns by tag when searching', () => {
    renderPanel();
    const input = screen.getByPlaceholderText('검색...');

    fireEvent.change(input, { target: { value: 'fast' } });

    // Jack Pattern has tag 'fast' and is in initially expanded category
    expect(screen.getByText('Jack Pattern')).toBeInTheDocument();
    expect(screen.queryByText('Stairs Up')).not.toBeInTheDocument();
    expect(screen.queryByText('Basic Chord')).not.toBeInTheDocument();
  });

  // 13. Shows "검색 결과 없음" when nothing matches
  it('shows empty message when search yields no results', () => {
    renderPanel();
    const input = screen.getByPlaceholderText('검색...');

    fireEvent.change(input, { target: { value: 'zzz_nonexistent_zzz' } });

    expect(screen.getByText('검색 결과 없음')).toBeInTheDocument();
  });

  // 14. Built-in patterns don't show delete button
  it('does not render delete button for built-in patterns', () => {
    renderPanel();
    // All visible patterns (stairs, chord, jack) are built-in
    const deleteButtons = screen.queryAllByTitle('삭제');
    expect(deleteButtons).toHaveLength(0);
  });

  // 15. User patterns show delete button
  it('renders delete button for user (non-built-in) patterns', () => {
    renderPanel();
    // Expand 'custom' category to see user pattern
    fireEvent.click(screen.getByText('사용자 정의'));

    const deleteButtons = screen.getAllByTitle('삭제');
    expect(deleteButtons).toHaveLength(1);
  });

  // 16. Clicking delete calls deleteUserPattern and refreshes
  it('calls deleteUserPattern when delete button is clicked', () => {
    renderPanel();
    // Expand custom category
    fireEvent.click(screen.getByText('사용자 정의'));

    const deleteButton = screen.getByTitle('삭제');
    fireEvent.click(deleteButton);

    expect(deleteUserPattern).toHaveBeenCalledWith('user-1');
  });

  // 17. Delete button click does not trigger onApplyPattern
  it('does not call onApplyPattern when delete button is clicked', () => {
    renderPanel();
    fireEvent.click(screen.getByText('사용자 정의'));

    const deleteButton = screen.getByTitle('삭제');
    fireEvent.click(deleteButton);

    expect(onApplyPattern).not.toHaveBeenCalled();
  });
});
