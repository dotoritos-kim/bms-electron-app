/**
 * Phase 4: Editor panel logic and store UI state tests.
 *
 * Since BeatKeysoundPanel, ChartStatsView, BpmTapDialog, and estimateDifficulty
 * are inline in Editor.tsx (not exported), we test their logic through:
 * - Pure function extraction tests (estimateDifficulty logic)
 * - Zustand store UI state (toggle panels, toast, etc.)
 */
import { vi } from 'vitest';
import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

// --- Helpers ---
function store() {
  return useEditorStore.getState();
}

function mockNote(overrides: Partial<EditableBMSNote> = {}): EditableBMSNote {
  return {
    id: `n${Math.random()}`,
    beat: 0,
    measure: 0,
    fraction: 0,
    column: 'K1',
    keysound: '01',
    noteType: 'playable',
    ...overrides,
  } as EditableBMSNote;
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState());
});

// ============================================================
// estimateDifficulty logic (recreated from Editor.tsx lines 174-202)
// We test the logic directly rather than importing (it's not exported)
// ============================================================
function estimateDifficulty(notes: EditableBMSNote[], bpm: number, totalBeats: number): number {
  if (notes.length === 0 || totalBeats <= 0) return 0;
  const playableNotes = notes.filter((n) => n.noteType === 'playable' || n.noteType === 'invisible');
  const totalPlayable = playableNotes.length;
  if (totalPlayable === 0) return 0;

  const durationSec = (totalBeats / bpm) * 60;
  const nps = totalPlayable / Math.max(durationSec, 1);

  const beatBuckets = new Map<number, number>();
  for (const n of playableNotes) {
    const bucket = Math.floor(n.beat);
    beatBuckets.set(bucket, (beatBuckets.get(bucket) || 0) + 1);
  }
  const peakDensity = Math.max(...beatBuckets.values(), 0);

  const lnCount = playableNotes.filter((n) => n.endBeat !== undefined).length;
  const lnRatio = lnCount / totalPlayable;

  const bpmFactor = Math.min(bpm / 200, 1.5);

  const rawScore = (nps * 2.5) + (peakDensity * 0.8) + (bpmFactor * 2) + (lnRatio * 1.5);
  return Math.max(1, Math.min(12, Math.round(rawScore)));
}

// ============================================================
// ChartStatsView logic (recreated from Editor.tsx lines 204-235)
// ============================================================
function computeChartStats(notes: EditableBMSNote[], bpm: number, totalBeats: number) {
  const playable = notes.filter((n) => n.noteType === 'playable').length;
  const invisible = notes.filter((n) => n.noteType === 'invisible').length;
  const landmine = notes.filter((n) => n.noteType === 'landmine').length;
  const bgm = notes.filter((n) => n.noteType === 'bgm').length;
  const ln = notes.filter((n) => n.endBeat !== undefined).length;
  const durationSec = totalBeats > 0 && bpm > 0 ? (totalBeats / bpm) * 60 : 0;
  const nps = durationSec > 0 ? playable / durationSec : 0;
  const measures = totalBeats > 0 ? Math.ceil(totalBeats / 4) : 0;
  return { playable, invisible, landmine, bgm, ln, durationSec, nps, measures };
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ============================================================
describe('estimateDifficulty', () => {
  it('returns 0 for empty notes', () => {
    expect(estimateDifficulty([], 150, 32)).toBe(0);
  });

  it('returns 0 when totalBeats <= 0', () => {
    expect(estimateDifficulty([mockNote()], 150, 0)).toBe(0);
    expect(estimateDifficulty([mockNote()], 150, -1)).toBe(0);
  });

  it('returns 0 when only bgm notes (no playable)', () => {
    const notes = [mockNote({ noteType: 'bgm' }), mockNote({ noteType: 'bgm' })];
    expect(estimateDifficulty(notes, 150, 32)).toBe(0);
  });

  it('returns value between 1 and 12', () => {
    const notes = Array.from({ length: 50 }, (_, i) =>
      mockNote({ beat: i * 0.5, noteType: 'playable' })
    );
    const result = estimateDifficulty(notes, 150, 100);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(12);
  });

  it('higher NPS produces higher difficulty', () => {
    // Few notes over long duration
    const sparseNotes = Array.from({ length: 10 }, (_, i) =>
      mockNote({ beat: i * 4, noteType: 'playable' })
    );
    // Many notes over same duration
    const denseNotes = Array.from({ length: 100 }, (_, i) =>
      mockNote({ beat: i * 0.4, noteType: 'playable' })
    );
    const sparse = estimateDifficulty(sparseNotes, 150, 40);
    const dense = estimateDifficulty(denseNotes, 150, 40);
    expect(dense).toBeGreaterThanOrEqual(sparse);
  });

  it('higher BPM contributes to difficulty', () => {
    const notes = Array.from({ length: 20 }, (_, i) =>
      mockNote({ beat: i * 2, noteType: 'playable' })
    );
    const lowBpm = estimateDifficulty(notes, 80, 40);
    const highBpm = estimateDifficulty(notes, 250, 40);
    expect(highBpm).toBeGreaterThanOrEqual(lowBpm);
  });

  it('LN ratio contributes to difficulty', () => {
    const noLn = Array.from({ length: 20 }, (_, i) =>
      mockNote({ beat: i * 2, noteType: 'playable' })
    );
    const withLn = Array.from({ length: 20 }, (_, i) =>
      mockNote({ beat: i * 2, noteType: 'playable', endBeat: i * 2 + 1 })
    );
    const noLnDiff = estimateDifficulty(noLn, 150, 40);
    const withLnDiff = estimateDifficulty(withLn, 150, 40);
    expect(withLnDiff).toBeGreaterThanOrEqual(noLnDiff);
  });

  it('counts invisible notes as playable for difficulty', () => {
    const notes = Array.from({ length: 20 }, (_, i) =>
      mockNote({ beat: i * 2, noteType: 'invisible' })
    );
    expect(estimateDifficulty(notes, 150, 40)).toBeGreaterThan(0);
  });

  it('clamps to 12 for extremely dense charts', () => {
    // 500 notes in 4 beats at 300 BPM
    const notes = Array.from({ length: 500 }, (_, i) =>
      mockNote({ beat: i * 0.008, noteType: 'playable' })
    );
    expect(estimateDifficulty(notes, 300, 4)).toBe(12);
  });
});

// ============================================================
describe('computeChartStats', () => {
  it('counts notes by type correctly', () => {
    const notes = [
      mockNote({ noteType: 'playable' }),
      mockNote({ noteType: 'playable' }),
      mockNote({ noteType: 'bgm' }),
      mockNote({ noteType: 'invisible' }),
      mockNote({ noteType: 'landmine' }),
    ];
    const stats = computeChartStats(notes, 150, 16);
    expect(stats.playable).toBe(2);
    expect(stats.bgm).toBe(1);
    expect(stats.invisible).toBe(1);
    expect(stats.landmine).toBe(1);
  });

  it('counts LN notes (those with endBeat)', () => {
    const notes = [
      mockNote({ noteType: 'playable', endBeat: 2 }),
      mockNote({ noteType: 'playable' }),
    ];
    const stats = computeChartStats(notes, 150, 16);
    expect(stats.ln).toBe(1);
  });

  it('calculates NPS correctly', () => {
    // 10 playable notes, 150 BPM, 16 beats
    // Duration = (16/150)*60 = 6.4 seconds
    // NPS = 10 / 6.4 = 1.5625
    const notes = Array.from({ length: 10 }, (_, i) =>
      mockNote({ beat: i * 1.5, noteType: 'playable' })
    );
    const stats = computeChartStats(notes, 150, 16);
    expect(stats.nps).toBeCloseTo(1.5625, 2);
  });

  it('calculates measures correctly', () => {
    const stats = computeChartStats([], 150, 16);
    expect(stats.measures).toBe(4); // 16/4 = 4

    const stats2 = computeChartStats([], 150, 17);
    expect(stats2.measures).toBe(5); // ceil(17/4) = 5
  });

  it('handles zero totalBeats', () => {
    const stats = computeChartStats([mockNote()], 150, 0);
    expect(stats.durationSec).toBe(0);
    expect(stats.nps).toBe(0);
    expect(stats.measures).toBe(0);
  });

  it('handles zero BPM', () => {
    const stats = computeChartStats([mockNote()], 0, 16);
    expect(stats.durationSec).toBe(0);
    expect(stats.nps).toBe(0);
  });
});

// ============================================================
describe('formatTime', () => {
  it('formats seconds to m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('truncates fractional seconds', () => {
    expect(formatTime(5.9)).toBe('0:05');
    expect(formatTime(59.99)).toBe('0:59');
  });
});

// ============================================================
describe('EditorStore UI State', () => {
  describe('toggleLeftPanel', () => {
    it('toggles showLeftPanel between true and false', () => {
      const initial = store().showLeftPanel;
      store().toggleLeftPanel();
      expect(store().showLeftPanel).toBe(!initial);
      store().toggleLeftPanel();
      expect(store().showLeftPanel).toBe(initial);
    });
  });

  describe('toggleRightPanel', () => {
    it('toggles showRightPanel between true and false', () => {
      const initial = store().showRightPanel;
      store().toggleRightPanel();
      expect(store().showRightPanel).toBe(!initial);
      store().toggleRightPanel();
      expect(store().showRightPanel).toBe(initial);
    });
  });

  describe('toggleHeaderCollapsed', () => {
    it('toggles headerCollapsed between true and false', () => {
      const initial = store().headerCollapsed;
      store().toggleHeaderCollapsed();
      expect(store().headerCollapsed).toBe(!initial);
      store().toggleHeaderCollapsed();
      expect(store().headerCollapsed).toBe(initial);
    });
  });

  describe('setToast', () => {
    it('sets toast message with type', () => {
      store().setToast({ message: 'Success!', type: 'success' });
      expect(store().toast).toEqual({ message: 'Success!', type: 'success' });
    });

    it('sets error toast', () => {
      store().setToast({ message: 'Failed!', type: 'error' });
      expect(store().toast).toEqual({ message: 'Failed!', type: 'error' });
    });

    it('can be cleared by setting null', () => {
      store().setToast({ message: 'msg', type: 'success' });
      store().setToast(null);
      expect(store().toast).toBeNull();
    });
  });

  describe('setShowBackConfirm', () => {
    it('sets showBackConfirm flag', () => {
      store().setShowBackConfirm(true);
      expect(store().showBackConfirm).toBe(true);
      store().setShowBackConfirm(false);
      expect(store().showBackConfirm).toBe(false);
    });
  });

  describe('setInputDialog', () => {
    it('sets input dialog state for BPM add', () => {
      store().setInputDialog({ type: 'bpm-add', beat: 4, defaultValue: '150' });
      expect(store().inputDialog).toEqual({ type: 'bpm-add', beat: 4, defaultValue: '150' });
    });

    it('sets input dialog state for STOP edit', () => {
      store().setInputDialog({ type: 'stop-edit', beat: 8, defaultValue: '192' });
      expect(store().inputDialog?.type).toBe('stop-edit');
    });

    it('clears input dialog with null', () => {
      store().setInputDialog({ type: 'bpm-add', beat: 0, defaultValue: '120' });
      store().setInputDialog(null);
      expect(store().inputDialog).toBeNull();
    });
  });

  describe('setAudioPhase', () => {
    it('transitions through audio phases', () => {
      expect(store().audioPhase).toBe('idle');
      store().setAudioPhase('loading');
      expect(store().audioPhase).toBe('loading');
      store().setAudioPhase('ready');
      expect(store().audioPhase).toBe('ready');
      store().setAudioPhase('playing');
      expect(store().audioPhase).toBe('playing');
      store().setAudioPhase('paused');
      expect(store().audioPhase).toBe('paused');
    });
  });

  describe('setPlaybackSpeed', () => {
    it('sets playback speed', () => {
      store().setPlaybackSpeed(0.5);
      expect(store().playbackSpeed).toBe(0.5);
      store().setPlaybackSpeed(2);
      expect(store().playbackSpeed).toBe(2);
    });
  });

  describe('setVolume', () => {
    it('sets volume', () => {
      store().setVolume(0);
      expect(store().volume).toBe(0);
      store().setVolume(0.5);
      expect(store().volume).toBe(0.5);
      store().setVolume(1);
      expect(store().volume).toBe(1);
    });
  });

  describe('setCurrentBeat', () => {
    it('updates current beat', () => {
      store().setCurrentBeat(8);
      expect(store().currentBeat).toBe(8);
      store().setCurrentBeat(0);
      expect(store().currentBeat).toBe(0);
    });
  });

  describe('setHasUnsavedChanges', () => {
    it('sets dirty flag', () => {
      store().setHasUnsavedChanges(true);
      expect(store().hasUnsavedChanges).toBe(true);
      store().setHasUnsavedChanges(false);
      expect(store().hasUnsavedChanges).toBe(false);
    });
  });

  describe('A-B Loop', () => {
    it('sets loop A and B points', () => {
      store().setLoopA(4);
      expect(store().loopA).toBe(4);
      store().setLoopB(16);
      expect(store().loopB).toBe(16);
    });

    it('clears loop points with null', () => {
      store().setLoopA(4);
      store().setLoopB(16);
      store().setLoopA(null);
      store().setLoopB(null);
      expect(store().loopA).toBeNull();
      expect(store().loopB).toBeNull();
    });
  });
});
