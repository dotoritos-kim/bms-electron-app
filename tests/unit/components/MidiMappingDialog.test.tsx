import React from 'react';
import { vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MidiMappingDialog } from '../../../src/renderer/components/MidiMappingDialog';
import type { MidiMapping, MidiRecordingMode } from '../../../src/renderer/lib/midiInput';

// Mock the midiInput module
vi.mock('../../../src/renderer/lib/midiInput', async () => {
  const actual = await vi.importActual('../../../src/renderer/lib/midiInput');
  return {
    ...actual,
    requestMidiAccess: vi.fn().mockResolvedValue(undefined),
    getMidiInputDevices: vi.fn().mockReturnValue([]),
    connectMidiInput: vi.fn().mockReturnValue(true),
    disconnectMidiInput: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    saveMidiMapping: vi.fn(),
  };
});

const createDefaultMapping = (): MidiMapping => ({
  noteToLane: new Map<number, string>(),
  presetName: 'Default',
});

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  laneIds: ['SC', '1', '2', '3', '4', '5', '6', '7'],
  mapping: createDefaultMapping(),
  onMappingChange: vi.fn(),
  recordingMode: 'off' as MidiRecordingMode,
  onRecordingModeChange: vi.fn(),
  onMidiNote: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to render and wait for async effects (requestMidiAccess) to settle
async function renderDialog(props = defaultProps) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<MidiMappingDialog {...props} />);
  });
  return result!;
}

describe('MidiMappingDialog', () => {
  it('returns null when open is false', async () => {
    const { container } = await renderDialog({ ...defaultProps, open: false });
    expect(container.innerHTML).toBe('');
  });

  it('renders "MIDI 설정" title when open is true', async () => {
    await renderDialog();
    // AccessibleDialog adds a sr-only h2 plus the visible title
    const titles = screen.getAllByText('MIDI 설정');
    expect(titles.length).toBeGreaterThanOrEqual(1);
    expect(titles[0]).toBeInTheDocument();
  });

  it('shows "MIDI 장치가 감지되지 않습니다" when no devices', async () => {
    await renderDialog();
    expect(screen.getByText('MIDI 장치가 감지되지 않습니다')).toBeInTheDocument();
  });

  it('shows three recording mode buttons', async () => {
    await renderDialog();
    expect(screen.getByText('끄기')).toBeInTheDocument();
    expect(screen.getByText('스텝')).toBeInTheDocument();
    expect(screen.getByText('실시간')).toBeInTheDocument();
  });

  it('calls onRecordingModeChange when clicking recording mode button', async () => {
    const onRecordingModeChange = vi.fn();
    await renderDialog({ ...defaultProps, onRecordingModeChange });
    fireEvent.click(screen.getByText('스텝'));
    expect(onRecordingModeChange).toHaveBeenCalledWith('step');
  });

  it('shows "MIDI 레코딩 비활성화" description when mode is off', async () => {
    await renderDialog({ ...defaultProps, recordingMode: 'off' });
    expect(screen.getByText('MIDI 레코딩 비활성화')).toBeInTheDocument();
  });

  it('shows step mode description when mode is step', async () => {
    await renderDialog({ ...defaultProps, recordingMode: 'step' });
    expect(
      screen.getByText('스텝: MIDI 입력 → 현재 위치에 노트 배치 후 자동 전진'),
    ).toBeInTheDocument();
  });

  it('shows realtime mode description when mode is realtime', async () => {
    await renderDialog({ ...defaultProps, recordingMode: 'realtime' });
    expect(
      screen.getByText('실시간: 재생 중 MIDI 입력 → 재생 위치에 배치'),
    ).toBeInTheDocument();
  });

  it('shows three preset buttons: Default, IIDX, Piano', async () => {
    await renderDialog();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('IIDX')).toBeInTheDocument();
    expect(screen.getByText('Piano')).toBeInTheDocument();
  });

  it('calls onMappingChange when clicking a preset button', async () => {
    const onMappingChange = vi.fn();
    await renderDialog({ ...defaultProps, onMappingChange });
    fireEvent.click(screen.getByText('IIDX'));
    expect(onMappingChange).toHaveBeenCalledTimes(1);
    const calledMapping = onMappingChange.mock.calls[0][0] as MidiMapping;
    expect(calledMapping.presetName).toBe('IIDX Controller');
  });

  it('shows lane mapping list with all laneIds', async () => {
    await renderDialog();
    for (const lane of defaultProps.laneIds) {
      expect(screen.getByText(lane)).toBeInTheDocument();
    }
  });

  it('shows a Learn button for each lane', async () => {
    await renderDialog();
    const learnButtons = screen.getAllByText('Learn');
    expect(learnButtons).toHaveLength(defaultProps.laneIds.length);
  });

  it('shows "대기중..." after clicking Learn', async () => {
    await renderDialog();
    const learnButtons = screen.getAllByText('Learn');
    fireEvent.click(learnButtons[0]);
    expect(screen.getByText('대기중...')).toBeInTheDocument();
  });

  it('shows "닫기" button that calls onClose', async () => {
    const onClose = vi.fn();
    await renderDialog({ ...defaultProps, onClose });
    fireEvent.click(screen.getByText('닫기'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables connect button when no device is selected', async () => {
    await renderDialog();
    const connectBtn = screen.getByText('연결').closest('button')!;
    expect(connectBtn).toBeDisabled();
  });
});
