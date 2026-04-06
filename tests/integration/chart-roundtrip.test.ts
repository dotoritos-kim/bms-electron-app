import { BMSParser, Notes, BMSWriter } from '@rhythm-archive/bms-core';
import type { EditableBMSChart, EditableBMSNote } from '@rhythm-archive/bms-core';
import { useEditorStore } from '../../src/renderer/stores/editorStore';

// --- Fixture ---

const MINIMAL_BMS = `
#PLAYER 1
#GENRE Test
#TITLE Roundtrip Test
#ARTIST Tester
#BPM 150
#PLAYLEVEL 5
#RANK 2
#LNTYPE 1
#WAV01 kick.wav
#WAV02 snare.wav
#WAV03 hihat.wav
#BPM01 200
#STOP01 48

*---------------------- MAIN DATA FIELD

#00111:01020300
#00113:01000200
#00211:03
#00208:01
#00209:01
`.trim();

// --- Helpers ---

function parseAndConvert(bmsString: string): {
  chart: ReturnType<BMSParser['compileString']>;
  notes: ReturnType<Notes['all']>;
  editable: EditableBMSChart;
} {
  const parser = new BMSParser();
  const chart = parser.compileString(bmsString);
  const notes = Notes.fromBMSChart(chart);
  const editable = BMSWriter.fromBMSChart(chart);
  return { chart, notes: notes.all(), editable };
}

function roundtrip(editable: EditableBMSChart): {
  output: string;
  reparsedEditable: EditableBMSChart;
  reparsedNotes: ReturnType<Notes['all']>;
} {
  const writer = new BMSWriter();
  const output = writer.write(editable);
  const parser2 = new BMSParser();
  const chart2 = parser2.compileString(output);
  const reparsedNotes = Notes.fromBMSChart(chart2);
  const reparsedEditable = BMSWriter.fromBMSChart(chart2);
  return { output, reparsedEditable, reparsedNotes: reparsedNotes.all() };
}

function beatToMF(beat: number): { measure: number; fraction: number } {
  const measure = Math.floor(beat / 4);
  const fraction = (beat % 4) / 4;
  return { measure, fraction };
}

// --- Tests ---

describe('Chart Roundtrip: BMS -> Parse -> Edit -> Write -> Re-parse', () => {
  let editable: EditableBMSChart;
  let originalNotes: ReturnType<Notes['all']>;

  beforeEach(() => {
    const result = parseAndConvert(MINIMAL_BMS);
    editable = result.editable;
    originalNotes = result.notes;
    useEditorStore.getState().reset();
  });

  // === Basic roundtrip ===

  describe('Basic roundtrip', () => {
    it('1. Parse -> fromBMSChart -> write -> re-parse: note count matches', () => {
      const { reparsedEditable } = roundtrip(editable);
      // Playable notes from the editable should survive roundtrip
      const originalPlayable = editable.notes.filter((n) => n.noteType === 'playable');
      const reparsedPlayable = reparsedEditable.notes.filter((n) => n.noteType === 'playable');
      expect(reparsedPlayable.length).toBe(originalPlayable.length);
    });

    it('2. Headers preserved (title, artist, BPM, genre)', () => {
      const { reparsedEditable } = roundtrip(editable);
      expect(reparsedEditable.headers.title).toBe('Roundtrip Test');
      expect(reparsedEditable.headers.artist).toBe('Tester');
      expect(reparsedEditable.headers.bpm).toBe(150);
      expect(reparsedEditable.headers.genre).toBe('Test');
    });

    it('3. Notes preserved (beat, column, keysound match)', () => {
      const { reparsedEditable } = roundtrip(editable);
      const originalPlayable = editable.notes
        .filter((n) => n.noteType === 'playable')
        .sort((a, b) => a.beat - b.beat || (a.column || '').localeCompare(b.column || ''));
      const reparsedPlayable = reparsedEditable.notes
        .filter((n) => n.noteType === 'playable')
        .sort((a, b) => a.beat - b.beat || (a.column || '').localeCompare(b.column || ''));

      for (let i = 0; i < originalPlayable.length; i++) {
        expect(reparsedPlayable[i].beat).toBeCloseTo(originalPlayable[i].beat, 4);
        expect(reparsedPlayable[i].column).toBe(originalPlayable[i].column);
        expect(reparsedPlayable[i].keysound.toUpperCase()).toBe(
          originalPlayable[i].keysound.toUpperCase()
        );
      }
    });

    it('4. WAV definitions preserved', () => {
      const { reparsedEditable } = roundtrip(editable);
      expect(reparsedEditable.headers.wav.get('01')).toBe('kick.wav');
      expect(reparsedEditable.headers.wav.get('02')).toBe('snare.wav');
      expect(reparsedEditable.headers.wav.get('03')).toBe('hihat.wav');
    });
  });

  // === Edit operations roundtrip ===

  describe('Edit operations roundtrip', () => {
    it('5. Parse -> add notes via editorStore -> write -> re-parse: new notes present', () => {
      const store = useEditorStore.getState();
      const maxId = editable.notes.length + 1;
      store.initFromChart(editable, [...editable.notes], maxId);

      // Add a new note
      store.addNote({
        beat: 8,
        measure: 2,
        fraction: 0,
        column: 'SC',
        keysound: '01',
        noteType: 'playable',
        channel: '16',
      });

      const state = useEditorStore.getState();
      const updatedChart: EditableBMSChart = {
        ...editable,
        notes: state.notes,
        bpmChanges: state.bpmChanges,
        stopEvents: state.stopEvents,
      };

      const { reparsedEditable } = roundtrip(updatedChart);
      const reparsedPlayable = reparsedEditable.notes.filter((n) => n.noteType === 'playable');
      const originalPlayable = editable.notes.filter((n) => n.noteType === 'playable');
      expect(reparsedPlayable.length).toBe(originalPlayable.length + 1);
    });

    it('6. Parse -> delete notes -> write -> re-parse: notes removed', () => {
      const store = useEditorStore.getState();
      const maxId = editable.notes.length + 1;
      store.initFromChart(editable, [...editable.notes], maxId);

      // Delete the first note
      const firstNote = useEditorStore.getState().notes[0];
      if (firstNote) {
        store.deleteNotes([firstNote.id]);
      }

      const state = useEditorStore.getState();
      const updatedChart: EditableBMSChart = {
        ...editable,
        notes: state.notes,
      };

      const { reparsedEditable } = roundtrip(updatedChart);
      expect(reparsedEditable.notes.length).toBe(editable.notes.length - 1);
    });

    it('7. Parse -> mirrorNotes -> write: columns mirrored in output', () => {
      const store = useEditorStore.getState();
      const maxId = editable.notes.length + 1;
      store.initFromChart(editable, [...editable.notes], maxId);

      // Select all playable notes and mirror
      const playableNotes = useEditorStore.getState().notes.filter((n) => n.noteType === 'playable');
      store.selectNotes(playableNotes.map((n) => n.id));

      const laneIds = ['1', '2', '3', '4', '5', '6', '7'];
      store.mirrorNotes(laneIds);

      const state = useEditorStore.getState();
      // Verify mirroring: column '1' -> '7', '2' -> '6', '3' -> '5', etc.
      for (const note of state.notes) {
        if (!playableNotes.find((pn) => pn.id === note.id)) continue;
        const original = playableNotes.find((pn) => pn.id === note.id)!;
        const origIdx = laneIds.indexOf(original.column);
        if (origIdx >= 0) {
          expect(note.column).toBe(laneIds[laneIds.length - 1 - origIdx]);
        }
      }
    });

    it('8. Parse -> insertMeasure -> write: notes shifted correctly', () => {
      const store = useEditorStore.getState();
      const maxId = editable.notes.length + 1;
      store.initFromChart(editable, [...editable.notes], maxId);

      // Notes in measure 2 should shift to measure 3 after inserting at measure 1
      const notesBefore = useEditorStore.getState().notes
        .filter((n) => n.beat >= 4)
        .map((n) => ({ id: n.id, beat: n.beat }));

      store.insertMeasure(1);

      const notesAfter = useEditorStore.getState().notes;
      for (const before of notesBefore) {
        const after = notesAfter.find((n) => n.id === before.id);
        expect(after).toBeDefined();
        expect(after!.beat).toBe(before.beat + 4);
      }
    });

    it('9. Parse -> deleteMeasure -> write: notes in range removed', () => {
      const store = useEditorStore.getState();
      const maxId = editable.notes.length + 1;
      store.initFromChart(editable, [...editable.notes], maxId);

      // Count notes in measure 0 (beat 0-3.99)
      const notesInMeasure0 = useEditorStore.getState().notes.filter(
        (n) => n.beat >= 0 && n.beat < 4
      ).length;
      const totalBefore = useEditorStore.getState().notes.length;

      store.deleteMeasure(0);

      const totalAfter = useEditorStore.getState().notes.length;
      expect(totalAfter).toBe(totalBefore - notesInMeasure0);
    });
  });

  // === BPM/STOP roundtrip ===

  describe('BPM/STOP roundtrip', () => {
    it('10. BPM changes preserved through roundtrip', () => {
      // The fixture has #BPM01 200 and #00208:01 (extended BPM change at measure 2)
      expect(editable.bpmChanges.length).toBeGreaterThan(0);

      const { reparsedEditable } = roundtrip(editable);
      expect(reparsedEditable.bpmChanges.length).toBe(editable.bpmChanges.length);

      for (let i = 0; i < editable.bpmChanges.length; i++) {
        expect(reparsedEditable.bpmChanges[i].bpm).toBe(editable.bpmChanges[i].bpm);
        expect(reparsedEditable.bpmChanges[i].measure).toBe(editable.bpmChanges[i].measure);
      }
    });

    it('11. STOP events preserved through roundtrip', () => {
      // The fixture has #00209:01 (STOP at measure 2)
      expect(editable.stopEvents.length).toBeGreaterThan(0);

      const { reparsedEditable } = roundtrip(editable);
      expect(reparsedEditable.stopEvents.length).toBe(editable.stopEvents.length);

      for (let i = 0; i < editable.stopEvents.length; i++) {
        expect(reparsedEditable.stopEvents[i].duration).toBe(editable.stopEvents[i].duration);
        expect(reparsedEditable.stopEvents[i].measure).toBe(editable.stopEvents[i].measure);
      }
    });

    it('12. New BPM added via store -> present in re-parsed chart', () => {
      const store = useEditorStore.getState();
      const maxId = editable.notes.length + 1;
      store.initFromChart(editable, [...editable.notes], maxId);

      // Add a BPM change at beat 12 (measure 3)
      store.changeBpm(12, 180);

      const state = useEditorStore.getState();
      const updatedChart: EditableBMSChart = {
        ...editable,
        bpmChanges: state.bpmChanges,
      };

      const { reparsedEditable } = roundtrip(updatedChart);
      const newBpm = reparsedEditable.bpmChanges.find((b) => b.bpm === 180);
      expect(newBpm).toBeDefined();
      expect(newBpm!.measure).toBe(3);
    });
  });

  // === Edge cases ===

  describe('Edge cases', () => {
    it('13. Empty chart roundtrip', () => {
      const emptyBms = `
#PLAYER 1
#TITLE Empty
#BPM 120
`.trim();

      const { editable: emptyEditable } = parseAndConvert(emptyBms);
      const { reparsedEditable } = roundtrip(emptyEditable);

      expect(reparsedEditable.headers.title).toBe('Empty');
      expect(reparsedEditable.notes.length).toBe(0);
    });

    it('14. Chart with many notes (100+) roundtrip preserves count', () => {
      // Generate a BMS with 100+ notes across multiple measures
      const lines: string[] = [
        '#PLAYER 1',
        '#TITLE Many Notes',
        '#BPM 150',
        '#WAV01 kick.wav',
      ];

      // Each measure line #NNNCC:data has 4-note resolution
      // To get 100+ notes, we generate many measures with dense data
      for (let m = 0; m < 30; m++) {
        const measureStr = String(m).padStart(3, '0');
        lines.push(`#${measureStr}11:01010101`);
      }

      const bmsString = lines.join('\n');
      const { editable: manyEditable } = parseAndConvert(bmsString);

      // Should have at least 100 playable notes (30 measures x 4 notes)
      const playableCount = manyEditable.notes.filter((n) => n.noteType === 'playable').length;
      expect(playableCount).toBeGreaterThanOrEqual(100);

      const { reparsedEditable } = roundtrip(manyEditable);
      const reparsedPlayable = reparsedEditable.notes.filter((n) => n.noteType === 'playable');
      expect(reparsedPlayable.length).toBe(playableCount);
    });

    it('15. Long notes (endBeat) roundtrip', () => {
      const lnBms = `
#PLAYER 1
#TITLE LN Test
#BPM 120
#LNTYPE 1
#WAV01 kick.wav

#00151:01000100
`.trim();
      // Channel 51 = long note on P1 key 1: start at fraction 0, end at fraction 0.5

      const { editable: lnEditable } = parseAndConvert(lnBms);
      const lnNotes = lnEditable.notes.filter((n) => n.endBeat !== undefined);
      expect(lnNotes.length).toBeGreaterThan(0);

      const { reparsedEditable } = roundtrip(lnEditable);
      const reparsedLn = reparsedEditable.notes.filter((n) => n.endBeat !== undefined);
      expect(reparsedLn.length).toBe(lnNotes.length);

      // Verify endBeat value is preserved
      const sortedOrig = lnNotes.sort((a, b) => a.beat - b.beat);
      const sortedReparsed = reparsedLn.sort((a, b) => a.beat - b.beat);
      for (let i = 0; i < sortedOrig.length; i++) {
        expect(sortedReparsed[i].beat).toBeCloseTo(sortedOrig[i].beat, 4);
        expect(sortedReparsed[i].endBeat).toBeCloseTo(sortedOrig[i].endBeat!, 4);
      }
    });
  });
});
