// --- Types ---

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiMapping {
  /** MIDI note number → BMS lane ID */
  noteToLane: Map<number, string>;
  /** Preset name */
  presetName: string;
}

export type MidiRecordingMode = 'off' | 'step' | 'realtime';

export interface MidiNoteEvent {
  note: number;
  velocity: number;
  timestamp: number;
}

// --- MIDI Access ---

let midiAccess: MIDIAccess | null = null;
let currentInput: MIDIInput | null = null;
let noteCallback: ((event: MidiNoteEvent) => void) | null = null;

export async function requestMidiAccess(): Promise<MIDIAccess | null> {
  if (midiAccess) return midiAccess;
  try {
    midiAccess = await navigator.requestMIDIAccess();
    return midiAccess;
  } catch (err) {
    console.warn('[MIDI] Access denied or not available:', err);
    return null;
  }
}

export function getMidiInputDevices(): MidiDevice[] {
  if (!midiAccess) return [];
  const devices: MidiDevice[] = [];
  midiAccess.inputs.forEach((input) => {
    devices.push({
      id: input.id,
      name: input.name || `MIDI Input ${input.id}`,
      manufacturer: input.manufacturer || 'Unknown',
    });
  });
  return devices;
}

export function connectMidiInput(
  deviceId: string,
  onNote: (event: MidiNoteEvent) => void,
): boolean {
  if (!midiAccess) return false;
  disconnectMidiInput();

  const input = midiAccess.inputs.get(deviceId);
  if (!input) return false;

  noteCallback = onNote;
  currentInput = input;

  input.onmidimessage = (msg) => {
    if (!msg.data || msg.data.length < 3) return;
    const [status, note, velocity] = msg.data;
    // Note On (0x90) with velocity > 0
    if ((status & 0xf0) === 0x90 && velocity > 0) {
      noteCallback?.({ note, velocity, timestamp: msg.timeStamp });
    }
  };

  return true;
}

export function disconnectMidiInput(): void {
  if (currentInput) {
    currentInput.onmidimessage = null;
    currentInput = null;
  }
  noteCallback = null;
}

export function isConnected(): boolean {
  return currentInput !== null;
}

// --- Mapping presets ---

export function createDefaultMapping(laneIds: string[]): MidiMapping {
  const noteToLane = new Map<number, string>();
  // Map MIDI notes 36-42 (kick, snare, hi-hat area) to lanes
  // Also map C3-B3 (48-59) for keyboard-style input
  laneIds.forEach((lane, i) => {
    if (i < 12) noteToLane.set(48 + i, lane); // C3+
    if (i < 7) noteToLane.set(36 + i, lane);  // Low drum area
  });
  return { noteToLane, presetName: 'Default' };
}

export function createIidxMapping(laneIds: string[]): MidiMapping {
  const noteToLane = new Map<number, string>();
  // IIDX controller layout: 7 keys + scratch
  // Typical MIDI mapping: keys = 48-54, scratch = 55-56
  const iidxNotes = [48, 49, 50, 51, 52, 53, 54];
  laneIds.forEach((lane, i) => {
    if (i < iidxNotes.length) noteToLane.set(iidxNotes[i], lane);
  });
  return { noteToLane, presetName: 'IIDX Controller' };
}

export function createKeyboardMapping(laneIds: string[]): MidiMapping {
  const noteToLane = new Map<number, string>();
  // Piano keyboard C4-B4 range
  const keys = [60, 62, 64, 65, 67, 69, 71]; // C D E F G A B
  laneIds.forEach((lane, i) => {
    if (i < keys.length) noteToLane.set(keys[i], lane);
  });
  return { noteToLane, presetName: 'Piano Keyboard' };
}

// --- Storage ---

const MAPPING_STORAGE_KEY = 'bms-editor-midi-mapping';

export function saveMidiMapping(mapping: MidiMapping): void {
  const data = {
    entries: Array.from(mapping.noteToLane.entries()),
    presetName: mapping.presetName,
  };
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(data));
}

export function loadMidiMapping(): MidiMapping | null {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      noteToLane: new Map(data.entries),
      presetName: data.presetName || 'Custom',
    };
  } catch {
    return null;
  }
}
