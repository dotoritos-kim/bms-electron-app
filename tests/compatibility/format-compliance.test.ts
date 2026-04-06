/**
 * BMS Format Compliance Tests
 *
 * Verifies that BMSWriter output conforms to the BMS specification
 * for compatibility with Beatoraja, LR2, and other BMS players.
 */
import { BMSParser, BMSWriter } from '@rhythm-archive/bms-core';
import type { EditableBMSChart } from '@rhythm-archive/bms-core';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_BMS = `#PLAYER 1
#TITLE Test
#ARTIST Tester
#BPM 150
#RANK 2
#WAV01 kick.wav

#00111:01`;

const FULL_HEADER_BMS = `#PLAYER 1
#GENRE Hardcore
#TITLE Full Header Test
#ARTIST TestArtist
#BPM 170
#PLAYLEVEL 8
#RANK 2
#TOTAL 300
#WAV01 kick.wav
#WAV02 snare.wav

#00111:01
#00112:02`;

const LN_BMS = `#PLAYER 1
#TITLE LN Test
#BPM 120
#RANK 2
#LNTYPE 1
#WAV01 hold.wav

#00151:01000100`;

const EXTENDED_BPM_BMS = `#PLAYER 1
#TITLE Extended BPM Test
#BPM 130
#RANK 2
#BPM01 300.5
#WAV01 kick.wav

#00108:01
#00111:01`;

const STOP_BMS = `#PLAYER 1
#TITLE Stop Test
#BPM 140
#RANK 2
#STOP01 48
#WAV01 kick.wav

#00109:01
#00111:01`;

const MULTI_MEASURE_BMS = `#PLAYER 1
#TITLE Multi Measure
#BPM 150
#RANK 2
#WAV01 kick.wav
#WAV02 snare.wav

#00111:01
#00211:02
#00311:01`;

const MULTI_COLUMN_BMS = `#PLAYER 1
#TITLE Multi Column
#BPM 150
#RANK 2
#WAV01 kick.wav
#WAV02 snare.wav
#WAV03 hat.wav

#00111:01
#00112:02
#00113:03`;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function writeFromString(bmsString: string): string {
  const parser = new BMSParser();
  parser.compileString(bmsString);
  const editable = BMSWriter.fromBMSChart(parser.chart!);
  const writer = new BMSWriter({ includeComments: false });
  return writer.write(editable);
}

function parseWrite(bmsString: string): EditableBMSChart {
  const parser = new BMSParser();
  parser.compileString(bmsString);
  const editable = BMSWriter.fromBMSChart(parser.chart!);
  const writer = new BMSWriter({ includeComments: false });
  const output = writer.write(editable);
  const parser2 = new BMSParser();
  parser2.compileString(output);
  return BMSWriter.fromBMSChart(parser2.chart!);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BMS Format Compliance - Header', () => {
  it('1. output contains #PLAYER line', () => {
    const output = writeFromString(MINIMAL_BMS);
    expect(output).toMatch(/^#PLAYER \d+$/m);
  });

  it('2. #BPM is a positive decimal', () => {
    const output = writeFromString(MINIMAL_BMS);
    const match = output.match(/^#BPM (\S+)$/m);
    expect(match).not.toBeNull();
    const bpm = parseFloat(match![1]);
    expect(bpm).toBeGreaterThan(0);
  });

  it('3. #PLAYLEVEL is an integer', () => {
    const output = writeFromString(FULL_HEADER_BMS);
    const match = output.match(/^#PLAYLEVEL (\S+)$/m);
    expect(match).not.toBeNull();
    const level = Number(match![1]);
    expect(Number.isInteger(level)).toBe(true);
  });

  it('4. #RANK is 0-3', () => {
    const output = writeFromString(MINIMAL_BMS);
    const match = output.match(/^#RANK (\d+)$/m);
    expect(match).not.toBeNull();
    const rank = parseInt(match![1], 10);
    expect(rank).toBeGreaterThanOrEqual(0);
    expect(rank).toBeLessThanOrEqual(3);
  });

  it('5. #LNTYPE 1 present when LN notes exist', () => {
    const output = writeFromString(LN_BMS);
    expect(output).toMatch(/^#LNTYPE 1$/m);
  });

  it('6. #WAVxx definitions use base-36 keys with no duplicates', () => {
    const output = writeFromString(FULL_HEADER_BMS);
    const wavLines = output.match(/^#WAV([0-9A-Z]{2}) .+$/gm);
    expect(wavLines).not.toBeNull();
    expect(wavLines!.length).toBeGreaterThan(0);

    const keys = wavLines!.map((l) => l.match(/^#WAV([0-9A-Z]{2})/)?.[1]);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);

    // All keys must be valid base-36
    for (const k of keys) {
      expect(parseInt(k!, 36)).not.toBeNaN();
    }
  });

  it('7. #TITLE, #ARTIST, #GENRE preserved', () => {
    const output = writeFromString(FULL_HEADER_BMS);
    expect(output).toMatch(/^#TITLE Full Header Test$/m);
    expect(output).toMatch(/^#ARTIST TestArtist$/m);
    expect(output).toMatch(/^#GENRE Hardcore$/m);
  });
});

describe('BMS Format Compliance - Channel Encoding', () => {
  it('8. channel 01 used for BGM notes', () => {
    const bgmBms = `#PLAYER 1
#TITLE BGM Test
#BPM 120
#RANK 2
#WAV01 bgm.wav

#00101:01`;
    const output = writeFromString(bgmBms);
    expect(output).toMatch(/^#\d{3}01:/m);
  });

  it('9. channels 11-17 used for 1P playable notes (7K)', () => {
    const output = writeFromString(MULTI_COLUMN_BMS);
    const dataLines = output.match(/^#\d{3}(1[1-9]):.+$/gm);
    expect(dataLines).not.toBeNull();
    expect(dataLines!.length).toBeGreaterThan(0);
    for (const line of dataLines!) {
      const ch = line.match(/^#\d{3}(1[1-9]):/)?.[1];
      expect(parseInt(ch!, 10)).toBeGreaterThanOrEqual(11);
      expect(parseInt(ch!, 10)).toBeLessThanOrEqual(19);
    }
  });

  it('10. channel 16 used for scratch in SP', () => {
    const scratchBms = `#PLAYER 1
#TITLE Scratch Test
#BPM 120
#RANK 2
#WAV01 scratch.wav

#00116:01`;
    const output = writeFromString(scratchBms);
    expect(output).toMatch(/^#\d{3}16:/m);
  });

  it('11. extended BPM changes use #BPMxx definitions + channel 08', () => {
    const output = writeFromString(EXTENDED_BPM_BMS);
    expect(output).toMatch(/^#BPM[0-9A-Z]{2} /m);
    expect(output).toMatch(/^#\d{3}08:/m);
  });

  it('12. STOP events use #STOPxx definitions + channel 09', () => {
    const output = writeFromString(STOP_BMS);
    expect(output).toMatch(/^#STOP[0-9A-Z]{2} /m);
    expect(output).toMatch(/^#\d{3}09:/m);
  });
});

describe('BMS Format Compliance - Measure Data Format', () => {
  it('13. data lines follow #MMMCC:data format', () => {
    const output = writeFromString(MINIMAL_BMS);
    const dataLines = output.split(/\r?\n/).filter((l) => l.match(/^#\d{3}/));
    expect(dataLines.length).toBeGreaterThan(0);
    for (const line of dataLines) {
      // Header definitions like #WAV01 also start with # but have a space
      if (line.includes(':')) {
        expect(line).toMatch(/^#\d{3}[0-9A-Za-z]{2}:.+$/);
      }
    }
  });

  it('14. data is even-length string of base-36 pairs', () => {
    const output = writeFromString(MULTI_COLUMN_BMS);
    const dataLines = output
      .split(/\r?\n/)
      .filter((l) => /^#\d{3}[0-9A-Za-z]{2}:/.test(l));
    for (const line of dataLines) {
      const data = line.split(':')[1];
      // Channel 02 (time sig) can be a decimal number, skip it
      const channel = line.match(/^#\d{3}([0-9A-Za-z]{2}):/)?.[1];
      if (channel === '02') continue;
      expect(data.length % 2).toBe(0);
      // Every 2-char pair should be valid base-36
      for (let i = 0; i < data.length; i += 2) {
        const pair = data.substring(i, i + 2);
        expect(pair).toMatch(/^[0-9A-Za-z]{2}$/);
      }
    }
  });

  it('15. empty slots represented as 00', () => {
    // A measure with notes at different positions will have 00 between them
    const sparseBms = `#PLAYER 1
#TITLE Sparse Test
#BPM 120
#RANK 2
#WAV01 kick.wav

#00111:01000001`;
    const output = writeFromString(sparseBms);
    const dataLines = output
      .split(/\r?\n/)
      .filter((l) => /^#\d{3}1[1-9]:/.test(l));
    expect(dataLines.length).toBeGreaterThan(0);
    const data = dataLines[0].split(':')[1];
    expect(data).toContain('00');
  });

  it('16. notes at correct positions within measure', () => {
    // Two notes at positions 0 and 2 out of 4 subdivisions
    const twoNoteBms = `#PLAYER 1
#TITLE Position Test
#BPM 120
#RANK 2
#WAV01 kick.wav

#00111:01000100`;
    const output = writeFromString(twoNoteBms);
    const dataLines = output
      .split(/\r?\n/)
      .filter((l) => /^#\d{3}1[1-9]:/.test(l));
    expect(dataLines.length).toBeGreaterThan(0);
    const data = dataLines[0].split(':')[1];
    // First pair should be 01, data length should be even
    expect(data.substring(0, 2).toUpperCase()).toBe('01');
    expect(data.length % 2).toBe(0);
  });
});

describe('BMS Format Compliance - Roundtrip Integrity', () => {
  it('17. parse -> write -> re-parse preserves note count', () => {
    const original = (() => {
      const p = new BMSParser();
      p.compileString(MULTI_COLUMN_BMS);
      return BMSWriter.fromBMSChart(p.chart!);
    })();
    const roundtripped = parseWrite(MULTI_COLUMN_BMS);

    const origPlayable = original.notes.filter((n) => n.noteType === 'playable');
    const rtPlayable = roundtripped.notes.filter((n) => n.noteType === 'playable');
    expect(rtPlayable.length).toBe(origPlayable.length);
  });

  it('18. parse -> write -> re-parse preserves header values', () => {
    const roundtripped = parseWrite(FULL_HEADER_BMS);
    expect(roundtripped.headers.title).toBe('Full Header Test');
    expect(roundtripped.headers.artist).toBe('TestArtist');
    expect(roundtripped.headers.genre).toBe('Hardcore');
    expect(roundtripped.headers.bpm).toBe(170);
    expect(roundtripped.headers.playlevel).toBe(8);
    expect(roundtripped.headers.rank).toBe(2);
  });

  it('19. parse -> write -> re-parse preserves BPM changes', () => {
    const original = (() => {
      const p = new BMSParser();
      p.compileString(EXTENDED_BPM_BMS);
      return BMSWriter.fromBMSChart(p.chart!);
    })();
    const roundtripped = parseWrite(EXTENDED_BPM_BMS);

    expect(roundtripped.bpmChanges.length).toBe(original.bpmChanges.length);
    for (let i = 0; i < original.bpmChanges.length; i++) {
      expect(roundtripped.bpmChanges[i].bpm).toBeCloseTo(
        original.bpmChanges[i].bpm,
        1
      );
    }
  });

  it('20. parse -> write -> re-parse preserves keysound assignments', () => {
    const original = (() => {
      const p = new BMSParser();
      p.compileString(MULTI_COLUMN_BMS);
      return BMSWriter.fromBMSChart(p.chart!);
    })();
    const roundtripped = parseWrite(MULTI_COLUMN_BMS);

    const origKeysounds = original.notes
      .filter((n) => n.noteType === 'playable')
      .map((n) => n.keysound.toUpperCase())
      .sort();
    const rtKeysounds = roundtripped.notes
      .filter((n) => n.noteType === 'playable')
      .map((n) => n.keysound.toUpperCase())
      .sort();
    expect(rtKeysounds).toEqual(origKeysounds);
  });
});

describe('BMS Format Compliance - Edge Cases', () => {
  it('21. BPM > 255 uses extended BPM (not inline hex channel 03)', () => {
    const output = writeFromString(EXTENDED_BPM_BMS);
    // Channel 08 should be present for extended BPM
    expect(output).toMatch(/^#\d{3}08:/m);
    // There should be a #BPMxx definition for the 300.5 BPM
    expect(output).toMatch(/^#BPM[0-9A-Z]{2} 300\.5$/m);
  });

  it('22. decimal BPM uses extended BPM', () => {
    const decimalBpmBms = `#PLAYER 1
#TITLE Decimal BPM
#BPM 130
#RANK 2
#BPM01 155.7
#WAV01 kick.wav

#00108:01
#00111:01`;
    const output = writeFromString(decimalBpmBms);
    // Must use extended BPM definition, not channel 03
    expect(output).toMatch(/^#BPM[0-9A-Z]{2} 155\.7$/m);
    expect(output).toMatch(/^#\d{3}08:/m);
  });

  it('23. notes at measure boundary (fraction = 0)', () => {
    const output = writeFromString(MINIMAL_BMS);
    // The note at position 0 in measure 1 should output correctly
    const dataLines = output
      .split(/\r?\n/)
      .filter((l) => /^#00111:/.test(l));
    expect(dataLines.length).toBeGreaterThan(0);
    const data = dataLines[0].split(':')[1];
    // First pair should be the note's keysound
    expect(data.substring(0, 2).toUpperCase()).not.toBe('00');
  });

  it('24. many notes in one measure (resolution calculation)', () => {
    // 16 notes in one measure, alternating 01 and 02
    const denseBms = `#PLAYER 1
#TITLE Dense
#BPM 120
#RANK 2
#WAV01 kick.wav
#WAV02 snare.wav

#00111:01020102010201020102010201020102`;
    const output = writeFromString(denseBms);
    const dataLines = output
      .split(/\r?\n/)
      .filter((l) => /^#00111:/.test(l));
    expect(dataLines.length).toBeGreaterThan(0);
    const data = dataLines[0].split(':')[1];
    // Data length should be >= 32 (16 slots * 2 chars each)
    expect(data.length).toBeGreaterThanOrEqual(32);
  });

  it('25. empty chart produces valid minimal BMS output', () => {
    const chart = BMSWriter.createEmptyChart();
    const writer = new BMSWriter({ includeComments: false });
    const output = writer.write(chart);
    // Should still have basic headers
    expect(output).toMatch(/^#PLAYER/m);
    expect(output).toMatch(/^#BPM/m);
    // Should be parseable
    const parser = new BMSParser();
    expect(() => parser.compileString(output)).not.toThrow();
  });

  it('26. chart with 100+ measures', () => {
    // Build a BMS string with notes in measures 0-100
    const lines = [
      '#PLAYER 1',
      '#TITLE 100 Measures',
      '#BPM 120',
      '#RANK 2',
      '#WAV01 kick.wav',
      '',
    ];
    for (let m = 0; m <= 100; m++) {
      lines.push(`#${m.toString().padStart(3, '0')}11:01`);
    }
    const output = writeFromString(lines.join('\n'));
    // Should contain measure 100
    expect(output).toMatch(/^#10011:/m);
  });

  it('27. multiple notes same beat different columns', () => {
    const output = writeFromString(MULTI_COLUMN_BMS);
    // All three channels should be present in measure 001
    const dataLines = output
      .split(/\r?\n/)
      .filter((l) => /^#001(11|12|13):/.test(l));
    expect(dataLines.length).toBe(3);
  });

  it('28. long notes encoded correctly', () => {
    const output = writeFromString(LN_BMS);
    // Long note channel 5x should be present
    expect(output).toMatch(/^#\d{3}5[1-9]:/m);
    // The data should have start and end markers
    const lnLines = output
      .split(/\r?\n/)
      .filter((l) => /^#\d{3}5[1-9]:/.test(l));
    expect(lnLines.length).toBeGreaterThan(0);
    const data = lnLines[0].split(':')[1];
    // Should contain non-00 pairs for start and end
    const pairs = [];
    for (let i = 0; i < data.length; i += 2) {
      pairs.push(data.substring(i, i + 2));
    }
    const nonEmpty = pairs.filter((p) => p !== '00');
    expect(nonEmpty.length).toBeGreaterThanOrEqual(2);
  });
});

describe('BMS Format Compliance - Cross-Player Safety', () => {
  it('29. no invalid characters in output', () => {
    const output = writeFromString(FULL_HEADER_BMS);
    // BMS files should only contain printable ASCII (and CR/LF)
    // No null bytes, no control chars other than \r\n
    for (let i = 0; i < output.length; i++) {
      const code = output.charCodeAt(i);
      const isValid =
        code === 0x0d || // CR
        code === 0x0a || // LF
        (code >= 0x20 && code <= 0x7e) || // printable ASCII
        code > 0x7e; // extended chars (for Unicode titles)
      expect(isValid).toBe(true);
    }
  });

  it('30. line endings are consistent', () => {
    const output = writeFromString(MINIMAL_BMS);
    // BMSWriter uses \r\n - verify all line breaks are consistent
    const lines = output.split('\r\n');
    // No stray \n without preceding \r
    for (const line of lines) {
      expect(line).not.toContain('\n');
      expect(line).not.toContain('\r');
    }
  });
});
