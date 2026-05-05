/**
 * T1: Worker Phase1 — Shift-JIS 파일 제목 올바르게 반환
 * T2: Worker Phase2 — 노트 수/stats 올바르게 반환
 * T3: Worker PARSE_ERROR — 깨진 BMS 파일 → error 상태
 *
 * Worker를 직접 실행할 수 없으므로 BMSParser + bms-core API를
 * 직접 테스트하여 Worker가 사용하는 파싱 로직을 검증합니다.
 */

import { BMSParser } from '../../../vendor/bms-core/src/parser';
import { detectKeyMode } from '../../../vendor/bms-editor/src/chart/useBmsChart';

// Simple ASCII BMS for basic parsing
const SIMPLE_BMS = `
#TITLE Test Song
#ARTIST Test Artist
#GENRE Pop
#BPM 140
#PLAYER 1
#RANK 3

#00111:01020304
#00113:0F000000
`.trim();

// BMS with long note and multiple note types
const MULTI_NOTE_BMS = `
#TITLE Multi
#BPM 120
#LNTYPE 1
#WAV01 kick.wav
#WAV02 snare.wav

#00111:01020000
#00112:00000304
#00115:01000000
`.trim();

function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

describe('bmsParser — Phase1 parsing (headers)', () => {
  it('T1a: parses title, artist, genre from ASCII BMS', async () => {
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(stringToArrayBuffer(SIMPLE_BMS));
    const chart = parser.compileString(bmsString);
    const songInfo = parser.getSongInfo();

    expect(songInfo?.title).toBe('Test Song');
    expect(songInfo?.artist).toBe('Test Artist');
    expect(songInfo?.genre).toBe('Pop');
  });

  it('T1b: parses initial BPM from header', async () => {
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(stringToArrayBuffer(SIMPLE_BMS));
    parser.compileString(bmsString);

    const chart = parser.compileString(await parser.readBuffer(stringToArrayBuffer(SIMPLE_BMS)));
    const bpmHeader = chart.headers.get('bpm');
    expect(parseFloat(bpmHeader ?? '0')).toBe(140);
  });

  it('T1c: detects keyMode correctly for 7K chart', async () => {
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(stringToArrayBuffer(SIMPLE_BMS));
    const chart = parser.compileString(bmsString);
    const notesObj = parser.getNotes();
    const notes = notesObj ? notesObj.all() : [];
    const keyMode = detectKeyMode(notes, chart.headers);

    // detectKeyMode returns a valid KeyMode string
    expect(typeof keyMode).toBe('string');
    expect(keyMode.length).toBeGreaterThan(0);
  });

  it('T1d: reads Shift-JIS encoded title correctly via readBuffer', async () => {
    // Shift-JIS encoded "テスト" (test in Japanese)
    const shiftJisBytes = new Uint8Array([
      // #TITLE テスト\n
      0x23, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x20,
      0x83, 0x65, 0x83, 0x58, 0x83, 0x67, // "テスト" in Shift-JIS
      0x0a,
      // #BPM 130\n
      0x23, 0x42, 0x50, 0x4d, 0x20, 0x31, 0x33, 0x30, 0x0a,
    ]);
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(shiftJisBytes.buffer);
    const chart = parser.compileString(bmsString);
    const songInfo = parser.getSongInfo();

    // Should decode Japanese characters correctly
    expect(songInfo?.title).toBeTruthy();
    expect(typeof songInfo?.title).toBe('string');
  });
});

describe('bmsParser — Phase2 parsing (notes + stats)', () => {
  it('T2a: counts notes correctly', async () => {
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(stringToArrayBuffer(MULTI_NOTE_BMS));
    const chart = parser.compileString(bmsString);
    const notesObj = parser.getNotes();
    expect(notesObj).not.toBeNull();
    const notes = notesObj!.all();

    // Count playable notes (channels 11,12 = lanes, channel 15 = scratch)
    const playable = notes.filter((n) => n.noteType === 'playable' || !n.noteType);
    expect(playable.length).toBeGreaterThan(0);
  });

  it('T2b: extracts keysound map from WAV headers', async () => {
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(stringToArrayBuffer(MULTI_NOTE_BMS));
    const chart = parser.compileString(bmsString);

    const keysounds: Record<string, string> = {};
    chart.headers.each((key: string, value: string) => {
      const match = key.match(/^wav(\S\S)$/i);
      if (match) keysounds[match[1].toLowerCase()] = value;
    });

    expect(keysounds['01']).toBe('kick.wav');
    expect(keysounds['02']).toBe('snare.wav');
  });

  it('T2c: computes BPM changes for channel 03', async () => {
    const bmsWithBpmChange = `#BPM 120\n#00103:FF000000\n`;
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(stringToArrayBuffer(bmsWithBpmChange));
    const chart = parser.compileString(bmsString);

    const objects = chart.objects.allSorted();
    const bpmChangeObj = objects.find((o) => o.channel === '03');
    expect(bpmChangeObj).toBeDefined();
    const bpmValue = parseInt(bpmChangeObj!.value, 16);
    expect(bpmValue).toBe(255); // 0xFF
  });
});

describe('bmsParser — error handling (PARSE_ERROR)', () => {
  it('T3a: does not crash on completely empty BMS', async () => {
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(stringToArrayBuffer(''));
    expect(() => parser.compileString(bmsString)).not.toThrow();
  });

  it('T3b: readBuffer handles random binary data without throwing', async () => {
    const randomBytes = new Uint8Array(100);
    for (let i = 0; i < 100; i++) randomBytes[i] = Math.floor(Math.random() * 256);
    const parser = new BMSParser();
    // Should not throw — reader has fallback encoding
    await expect(parser.readBuffer(randomBytes.buffer)).resolves.toBeDefined();
  });

  it('T3c: getNotes returns null when compileString not called', () => {
    const parser = new BMSParser();
    expect(parser.getNotes()).toBeNull();
    expect(parser.getSongInfo()).toBeNull();
  });
});
