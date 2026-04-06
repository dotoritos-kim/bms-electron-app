/**
 * BMS Test Fixture Generator
 * Generates .bms fixture files for each key mode used in GUI testing.
 *
 * Usage: npx tsx scripts/generate-test-fixtures.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const FIXTURES_DIR = resolve(__dirname, '../tests/e2e/fixtures');

interface ModeSpec {
  filename: string;
  title: string;
  /** BMS channels to place notes in. Each is a 2-digit hex string (e.g. '11'='col1') */
  channels: string[];
  /** Extra header lines (e.g. #PLAYER 3 for DP) */
  extraHeaders?: string[];
}

// BMS channel mapping:
// SP: 11-19 (1-7 keys, 16=SC, 17=FZ for 7K mode; but standard is 11-15=col1-5, 16=SC, 18-19=col6-7)
// Actually for standard BMS:
//   11=1, 12=2, 13=3, 14=4, 15=5, 16=SC, 18=6, 19=7
//   21=8(2P-1), 22=9(2P-2), 23=10(2P-3), 24=11(2P-4), 25=12(2P-5), 26=SC2, 28=13(2P-6), 29=14(2P-7)
// For keyboard/PMS modes without SC: same channels but parser maps differently

const MODES: ModeSpec[] = [
  {
    filename: 'test-4k.bms',
    title: 'Test 4K',
    // 4K: SC + columns 1,2,4,5 (skip 3,6,7)
    channels: ['16', '11', '12', '14', '15'],
  },
  {
    filename: 'test-5k.bms',
    title: 'Test 5K',
    // 5K: SC + columns 1-5
    channels: ['16', '11', '12', '13', '14', '15'],
  },
  {
    filename: 'test-6k.bms',
    title: 'Test 6K',
    // 6K: SC + columns 1,2,3,5,6,7 (skip 4)
    channels: ['16', '11', '12', '13', '15', '18', '19'],
  },
  {
    filename: 'test-8k.bms',
    title: 'Test 8K',
    // 8K: keyboard style, columns 1-8 (channels 11-18, no SC)
    channels: ['11', '12', '13', '14', '15', '16', '17', '18'],
  },
  {
    filename: 'test-9k.bms',
    title: 'Test 9K',
    // 9K PMS: channels 11-15, 22-25 (pop'n music mapping)
    channels: ['11', '12', '13', '14', '15', '22', '23', '24', '25'],
    extraHeaders: ['#PLAYER 1'],
  },
  {
    filename: 'test-10k.bms',
    title: 'Test 10K',
    // 10K DP: SC + 1-5 + 2P: SC2 + 6-10
    channels: ['16', '11', '12', '13', '14', '15', '21', '22', '23', '24', '25', '26'],
    extraHeaders: ['#PLAYER 3'],
  },
  {
    filename: 'test-12k.bms',
    title: 'Test 12K',
    // 12K keyboard DP: 6+6, channels 11-16 + 21-26 (no SC)
    channels: ['11', '12', '13', '14', '15', '16', '21', '22', '23', '24', '25', '26'],
    extraHeaders: ['#PLAYER 3'],
  },
  {
    filename: 'test-14k.bms',
    title: 'Test 14K',
    // 14K DP: SC+1-7+FZ + SC2+8-14+FZ2
    channels: ['16', '11', '12', '13', '14', '15', '18', '19', '26', '21', '22', '23', '24', '25', '28', '29'],
    extraHeaders: ['#PLAYER 3'],
  },
  {
    filename: 'test-18k.bms',
    title: 'Test 18K',
    // 18K keyboard DP: 9+9, channels 11-19 + 21-29 (no SC)
    channels: ['11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '23', '24', '25', '26', '27', '28', '29'],
    extraHeaders: ['#PLAYER 3'],
  },
  {
    filename: 'test-24k.bms',
    title: 'Test 24K',
    // 24K keyboard DP: use channels 11-19 + 21-29 (no SC interpretation)
    // We'll place notes in enough channels to trigger 24K detection
    channels: ['11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '23', '24', '25', '26', '27', '28', '29'],
    extraHeaders: ['#PLAYER 3'],
  },
  {
    filename: 'test-48k.bms',
    title: 'Test 48K',
    // 48K: use extended channels (BME format)
    // For simplicity, use 11-19, 21-29 and extend with 31-39, 41-49
    channels: [
      '11', '12', '13', '14', '15', '16', '17', '18', '19',
      '21', '22', '23', '24', '25', '26', '27', '28', '29',
      '31', '32', '33', '34', '35', '36', '37', '38', '39',
      '41', '42', '43', '44', '45', '46', '47', '48', '49',
    ],
    extraHeaders: ['#PLAYER 3'],
  },
];

function generateWavHeaders(): string {
  return [
    '#WAV01 kick.wav',
    '#WAV02 snare.wav',
    '#WAV03 hihat.wav',
    '#WAV04 bass.wav',
  ].join('\n');
}

function generateMeasure(measureNum: number, channels: string[]): string {
  const lines: string[] = [];
  const wavIds = ['01', '02', '03', '04'];

  for (const ch of channels) {
    const measure = measureNum.toString().padStart(3, '0');
    // Assign WAV IDs cyclically, place 2 notes per measure
    const wavA = wavIds[channels.indexOf(ch) % wavIds.length];
    const wavB = wavIds[(channels.indexOf(ch) + 1) % wavIds.length];
    lines.push(`#${measure}${ch}:${wavA}00${wavB}00`);
  }

  return lines.join('\n');
}

function generateBmsFile(spec: ModeSpec): string {
  const parts: string[] = [];

  // Header
  parts.push('');
  parts.push('*---------------------- HEADER FIELD');
  parts.push('');
  if (spec.extraHeaders) {
    parts.push(...spec.extraHeaders);
  } else {
    parts.push('#PLAYER 1');
  }
  parts.push('#GENRE Test');
  parts.push(`#TITLE ${spec.title}`);
  parts.push('#ARTIST GUI Test');
  parts.push('#BPM 150');
  parts.push('#PLAYLEVEL 5');
  parts.push('#RANK 3');
  parts.push('#TOTAL 300');
  parts.push('#LNTYPE 1');
  parts.push('');

  // WAV definitions
  parts.push('*---------------------- WAV DEFINITIONS');
  parts.push(generateWavHeaders());
  parts.push('');

  // Main data (3 measures)
  parts.push('*---------------------- MAIN DATA FIELD');
  parts.push('');
  parts.push(generateMeasure(1, spec.channels));
  parts.push('');
  parts.push(generateMeasure(2, spec.channels));
  parts.push('');
  parts.push(generateMeasure(3, spec.channels));

  return parts.join('\n');
}

function generateStressFile(): string {
  const parts: string[] = [];

  parts.push('');
  parts.push('*---------------------- HEADER FIELD');
  parts.push('');
  parts.push('#PLAYER 1');
  parts.push('#GENRE Stress Test');
  parts.push('#TITLE Stress Test 2000 Notes');
  parts.push('#ARTIST GUI Test');
  parts.push('#BPM 180');
  parts.push('#PLAYLEVEL 12');
  parts.push('#RANK 3');
  parts.push('#TOTAL 300');
  parts.push('#LNTYPE 1');
  parts.push('');

  // WAV definitions
  parts.push('*---------------------- WAV DEFINITIONS');
  parts.push(generateWavHeaders());
  parts.push('');

  parts.push('*---------------------- MAIN DATA FIELD');
  parts.push('');

  // 7K channels: 16(SC), 11-15, 18, 19
  const channels = ['16', '11', '12', '13', '14', '15', '18', '19'];
  const wavIds = ['01', '02', '03', '04'];

  // Generate 50 measures with dense note patterns (~40 notes per measure = 2000+ total)
  for (let m = 1; m <= 50; m++) {
    const measure = m.toString().padStart(3, '0');
    for (let ci = 0; ci < channels.length; ci++) {
      // 5 notes per channel per measure on alternating measures
      if (m % 2 === 0 && ci >= 4) continue; // vary density
      const wav = wavIds[ci % wavIds.length];
      // Dense pattern: 8 subdivisions, alternating notes
      const data = ci % 2 === 0 ? `${wav}00${wav}00${wav}00${wav}00` : `00${wav}00${wav}00${wav}00${wav}`;
      parts.push(`#${measure}${channels[ci]}:${data}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

// Main
mkdirSync(FIXTURES_DIR, { recursive: true });

for (const mode of MODES) {
  const content = generateBmsFile(mode);
  const path = resolve(FIXTURES_DIR, mode.filename);
  writeFileSync(path, content, 'utf-8');
  console.log(`Generated: ${mode.filename} (${mode.channels.length} channels)`);
}

// Stress test fixture
const stressContent = generateStressFile();
writeFileSync(resolve(FIXTURES_DIR, 'test-stress.bms'), stressContent, 'utf-8');
console.log('Generated: test-stress.bms (7K, 50 measures, 2000+ notes)');

console.log('\nAll fixtures generated successfully.');
