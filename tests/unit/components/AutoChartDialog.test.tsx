import React from 'react';
import { vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AutoChartDialog } from '../../../src/renderer/components/AutoChartDialog';

// Mock window.api
(window as any).api = {
  file: { openAudioFile: vi.fn().mockResolvedValue(null) },
  audio: { readFile: vi.fn().mockResolvedValue(new ArrayBuffer(0)) },
};

// Mock autoChart module
vi.mock('../../../src/renderer/lib/autoChart', () => ({
  generateChartFromOnsets: vi.fn().mockReturnValue([]),
  detectOnsetsFromBuffer: vi.fn().mockReturnValue([]),
  buildMarkovModel: vi.fn().mockReturnValue({}),
  suggestPattern: vi.fn().mockReturnValue([]),
}));

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  existingNotes: [] as Array<{ beat: number; column: string; columnIndex: number }>,
  laneIds: ['1', '2', '3', '4', '5', '6', '7'],
  bpm: 120,
  currentBeat: 0,
  gridSnap: 16,
  onApplyNotes: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AutoChartDialog', () => {
  it('returns null when open is false', () => {
    const { container } = render(
      <AutoChartDialog {...defaultProps} open={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders "AI 차트 생성" title when open is true', () => {
    render(<AutoChartDialog {...defaultProps} />);
    // AccessibleDialog adds a sr-only h2 plus the visible title, so use getAllByText
    const titles = screen.getAllByText('AI 차트 생성');
    expect(titles.length).toBeGreaterThanOrEqual(1);
    expect(titles[0]).toBeInTheDocument();
  });

  it('has two mode tabs: "오디오 → 차트 생성" and "패턴 제안"', () => {
    render(<AutoChartDialog {...defaultProps} />);
    expect(screen.getByText('오디오 → 차트 생성')).toBeInTheDocument();
    expect(screen.getByText('패턴 제안')).toBeInTheDocument();
  });

  it('defaults to suggest mode', () => {
    render(<AutoChartDialog {...defaultProps} />);
    // In suggest mode, the suggest button should be visible
    expect(screen.getByText('패턴 제안 생성')).toBeInTheDocument();
    // The generate-mode "오디오 파일 열기" button should NOT be visible
    expect(screen.queryByText('오디오 파일 열기')).not.toBeInTheDocument();
  });

  it('shows existing note count in suggest mode', () => {
    const notes = [
      { beat: 0, column: '1', columnIndex: 0 },
      { beat: 1, column: '2', columnIndex: 1 },
      { beat: 2, column: '3', columnIndex: 2 },
    ];
    render(<AutoChartDialog {...defaultProps} existingNotes={notes} />);
    expect(screen.getByText(/3개 노트가 있습니다/)).toBeInTheDocument();
  });

  it('shows warning when fewer than 4 notes in suggest mode', () => {
    render(
      <AutoChartDialog {...defaultProps} existingNotes={[{ beat: 0, column: '1', columnIndex: 0 }]} />,
    );
    expect(screen.getByText('최소 4개 이상의 노트가 필요합니다')).toBeInTheDocument();
  });

  it('disables suggest button when fewer than 4 notes', () => {
    render(
      <AutoChartDialog {...defaultProps} existingNotes={[{ beat: 0, column: '1', columnIndex: 0 }]} />,
    );
    const suggestBtn = screen.getByText('패턴 제안 생성').closest('button')!;
    expect(suggestBtn).toBeDisabled();
  });

  it('shows "오디오 파일 열기" button in generate mode', () => {
    render(<AutoChartDialog {...defaultProps} />);
    // Switch to generate mode
    fireEvent.click(screen.getByText('오디오 → 차트 생성'));
    expect(screen.getByText('오디오 파일 열기')).toBeInTheDocument();
  });

  it('disables generate button without audio loaded', () => {
    render(<AutoChartDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('오디오 → 차트 생성'));
    const generateBtn = screen.getByText('차트 생성').closest('button')!;
    expect(generateBtn).toBeDisabled();
  });

  it('disables apply button when no preview exists', () => {
    render(<AutoChartDialog {...defaultProps} />);
    const applyBtn = screen.getByText('적용').closest('button')!;
    expect(applyBtn).toBeDisabled();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<AutoChartDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('취소'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(<AutoChartDialog {...defaultProps} onClose={onClose} />);
    // The visible header h2 contains the title; the X button is a sibling in the same header div
    const visibleTitle = screen.getAllByText('AI 차트 생성').find(
      (el) => !el.classList.contains('sr-only'),
    )!;
    const headerDiv = visibleTitle.closest('div.flex')!;
    const xButton = headerDiv.querySelector('button')!;
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('switches between generate and suggest modes', () => {
    render(<AutoChartDialog {...defaultProps} />);
    // Default is suggest
    expect(screen.getByText('패턴 제안 생성')).toBeInTheDocument();

    // Switch to generate
    fireEvent.click(screen.getByText('오디오 → 차트 생성'));
    expect(screen.getByText('차트 생성')).toBeInTheDocument();
    expect(screen.queryByText('패턴 제안 생성')).not.toBeInTheDocument();

    // Switch back to suggest
    fireEvent.click(screen.getByText('패턴 제안'));
    expect(screen.getByText('패턴 제안 생성')).toBeInTheDocument();
  });

  it('does not show warning when 4 or more notes exist', () => {
    const notes = [
      { beat: 0, column: '1', columnIndex: 0 },
      { beat: 1, column: '2', columnIndex: 1 },
      { beat: 2, column: '3', columnIndex: 2 },
      { beat: 3, column: '4', columnIndex: 3 },
    ];
    render(<AutoChartDialog {...defaultProps} existingNotes={notes} />);
    expect(screen.queryByText('최소 4개 이상의 노트가 필요합니다')).not.toBeInTheDocument();
  });

  it('enables suggest button when 4 or more notes exist', () => {
    const notes = [
      { beat: 0, column: '1', columnIndex: 0 },
      { beat: 1, column: '2', columnIndex: 1 },
      { beat: 2, column: '3', columnIndex: 2 },
      { beat: 3, column: '4', columnIndex: 3 },
    ];
    render(<AutoChartDialog {...defaultProps} existingNotes={notes} />);
    const suggestBtn = screen.getByText('패턴 제안 생성').closest('button')!;
    expect(suggestBtn).not.toBeDisabled();
  });

  it('calls onClose when overlay background is clicked', () => {
    const onClose = vi.fn();
    render(<AutoChartDialog {...defaultProps} onClose={onClose} />);
    // The overlay is the outermost div with role="presentation" from AccessibleDialog
    const overlay = screen.getByRole('presentation');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
