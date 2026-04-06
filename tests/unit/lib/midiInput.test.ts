import {
  createDefaultMapping,
  createIidxMapping,
  createKeyboardMapping,
  saveMidiMapping,
  loadMidiMapping,
} from '../../../src/renderer/lib/midiInput';

const STORAGE_KEY = 'bms-editor-midi-mapping';

// Helper to get a fresh module with reset state
async function freshMidiModule() {
  vi.resetModules();
  return await import('../../../src/renderer/lib/midiInput');
}

// Mock MIDIAccess factory
function createMockMidiAccess(inputs: Array<{ id: string; name: string; manufacturer: string }>) {
  const inputMap = new Map<string, any>();
  inputs.forEach((inp) => {
    inputMap.set(inp.id, {
      id: inp.id,
      name: inp.name,
      manufacturer: inp.manufacturer,
      onmidimessage: null,
    });
  });
  return { inputs: inputMap } as unknown as MIDIAccess;
}

describe('midiInput', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // --- createDefaultMapping ---

  describe('createDefaultMapping', () => {
    it('returns a MidiMapping with presetName "Default"', () => {
      const mapping = createDefaultMapping(['1', '2', '3']);
      expect(mapping.presetName).toBe('Default');
      expect(mapping.noteToLane).toBeInstanceOf(Map);
    });

    it('maps MIDI 48-59 (C3-B3) to first 12 lanes', () => {
      const lanes = Array.from({ length: 12 }, (_, i) => `lane${i}`);
      const mapping = createDefaultMapping(lanes);
      for (let i = 0; i < 12; i++) {
        expect(mapping.noteToLane.get(48 + i)).toBe(`lane${i}`);
      }
    });

    it('maps MIDI 36-42 to first 7 lanes', () => {
      const lanes = Array.from({ length: 7 }, (_, i) => `lane${i}`);
      const mapping = createDefaultMapping(lanes);
      for (let i = 0; i < 7; i++) {
        expect(mapping.noteToLane.get(36 + i)).toBe(`lane${i}`);
      }
    });

    it('with 3 lanes, only maps 3 notes in each range', () => {
      const lanes = ['a', 'b', 'c'];
      const mapping = createDefaultMapping(lanes);
      // C3 range: only 48, 49, 50
      expect(mapping.noteToLane.get(48)).toBe('a');
      expect(mapping.noteToLane.get(49)).toBe('b');
      expect(mapping.noteToLane.get(50)).toBe('c');
      expect(mapping.noteToLane.has(51)).toBe(false);
      // Low drum range: only 36, 37, 38
      expect(mapping.noteToLane.get(36)).toBe('a');
      expect(mapping.noteToLane.get(37)).toBe('b');
      expect(mapping.noteToLane.get(38)).toBe('c');
      expect(mapping.noteToLane.has(39)).toBe(false);
    });

    it('with 12+ lanes, all 12 C3 notes are mapped', () => {
      const lanes = Array.from({ length: 16 }, (_, i) => `lane${i}`);
      const mapping = createDefaultMapping(lanes);
      for (let i = 0; i < 12; i++) {
        expect(mapping.noteToLane.has(48 + i)).toBe(true);
      }
      // Only first 7 in the drum range
      for (let i = 0; i < 7; i++) {
        expect(mapping.noteToLane.has(36 + i)).toBe(true);
      }
    });
  });

  // --- createIidxMapping ---

  describe('createIidxMapping', () => {
    it('returns a MidiMapping with presetName "IIDX Controller"', () => {
      const mapping = createIidxMapping(['1']);
      expect(mapping.presetName).toBe('IIDX Controller');
    });

    it('maps MIDI 48-54 to first 7 lanes', () => {
      const lanes = Array.from({ length: 7 }, (_, i) => `k${i}`);
      const mapping = createIidxMapping(lanes);
      for (let i = 0; i < 7; i++) {
        expect(mapping.noteToLane.get(48 + i)).toBe(`k${i}`);
      }
    });

    it('with fewer than 7 lanes, only maps available lanes', () => {
      const lanes = ['x', 'y', 'z'];
      const mapping = createIidxMapping(lanes);
      expect(mapping.noteToLane.get(48)).toBe('x');
      expect(mapping.noteToLane.get(49)).toBe('y');
      expect(mapping.noteToLane.get(50)).toBe('z');
      expect(mapping.noteToLane.has(51)).toBe(false);
      expect(mapping.noteToLane.size).toBe(3);
    });
  });

  // --- createKeyboardMapping ---

  describe('createKeyboardMapping', () => {
    it('returns a MidiMapping with presetName "Piano Keyboard"', () => {
      const mapping = createKeyboardMapping(['1']);
      expect(mapping.presetName).toBe('Piano Keyboard');
    });

    it('maps MIDI notes [60,62,64,65,67,69,71] (C D E F G A B)', () => {
      const lanes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      const mapping = createKeyboardMapping(lanes);
      const expectedNotes = [60, 62, 64, 65, 67, 69, 71];
      expectedNotes.forEach((note, i) => {
        expect(mapping.noteToLane.get(note)).toBe(lanes[i]);
      });
    });

    it('with 7 lanes, all are mapped', () => {
      const lanes = Array.from({ length: 7 }, (_, i) => `lane${i}`);
      const mapping = createKeyboardMapping(lanes);
      expect(mapping.noteToLane.size).toBe(7);
    });
  });

  // --- saveMidiMapping / loadMidiMapping ---

  describe('saveMidiMapping / loadMidiMapping', () => {
    it('roundtrips correctly (Map preserved via entries array)', () => {
      const original = createDefaultMapping(['a', 'b', 'c', 'd', 'e']);
      saveMidiMapping(original);
      const loaded = loadMidiMapping();

      expect(loaded).not.toBeNull();
      expect(loaded!.presetName).toBe(original.presetName);
      expect(loaded!.noteToLane.size).toBe(original.noteToLane.size);
      for (const [key, value] of original.noteToLane) {
        expect(loaded!.noteToLane.get(key)).toBe(value);
      }
    });

    it('returns null when no saved data exists', () => {
      expect(loadMidiMapping()).toBeNull();
    });

    it('returns null for corrupt JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
      expect(loadMidiMapping()).toBeNull();
    });

    it('preserves presetName through save/load', () => {
      const mapping = createIidxMapping(['1', '2', '3']);
      saveMidiMapping(mapping);
      const loaded = loadMidiMapping();
      expect(loaded!.presetName).toBe('IIDX Controller');
    });
  });

  // --- requestMidiAccess ---

  describe('requestMidiAccess', () => {
    it('returns MIDIAccess on success', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });

      const result = await mod.requestMidiAccess();
      expect(result).toBe(mockAccess);
    });

    it('returns cached MIDIAccess on second call', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([]);
      const mockFn = vi.fn().mockResolvedValue(mockAccess);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: mockFn,
        writable: true,
        configurable: true,
      });

      await mod.requestMidiAccess();
      await mod.requestMidiAccess();
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('returns null when MIDI access is denied', async () => {
      const mod = await freshMidiModule();
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockRejectedValue(new Error('Access denied')),
        writable: true,
        configurable: true,
      });

      const result = await mod.requestMidiAccess();
      expect(result).toBeNull();
    });
  });

  // --- getMidiInputDevices ---

  describe('getMidiInputDevices', () => {
    it('returns empty array when no MIDI access', async () => {
      const mod = await freshMidiModule();
      expect(mod.getMidiInputDevices()).toEqual([]);
    });

    it('returns device list after MIDI access', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([
        { id: 'dev1', name: 'Keyboard', manufacturer: 'Yamaha' },
        { id: 'dev2', name: 'Pad', manufacturer: 'Akai' },
      ]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });

      await mod.requestMidiAccess();
      const devices = mod.getMidiInputDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0]).toEqual({ id: 'dev1', name: 'Keyboard', manufacturer: 'Yamaha' });
      expect(devices[1]).toEqual({ id: 'dev2', name: 'Pad', manufacturer: 'Akai' });
    });

    it('uses fallback name for unnamed device', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([
        { id: 'x', name: '', manufacturer: '' },
      ]);
      // Override to set name/manufacturer to empty string
      const input = mockAccess.inputs.get('x')!;
      input.name = '';
      input.manufacturer = '';
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });

      await mod.requestMidiAccess();
      const devices = mod.getMidiInputDevices();
      expect(devices[0].name).toBe('MIDI Input x');
      expect(devices[0].manufacturer).toBe('Unknown');
    });
  });

  // --- connectMidiInput / disconnectMidiInput / isConnected ---

  describe('connectMidiInput / disconnectMidiInput / isConnected', () => {
    it('returns false when no MIDI access', async () => {
      const mod = await freshMidiModule();
      expect(mod.connectMidiInput('dev1', vi.fn())).toBe(false);
    });

    it('returns false for unknown device ID', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([{ id: 'dev1', name: 'KB', manufacturer: 'X' }]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });
      await mod.requestMidiAccess();

      expect(mod.connectMidiInput('nonexistent', vi.fn())).toBe(false);
    });

    it('connects to a valid device', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([{ id: 'dev1', name: 'KB', manufacturer: 'X' }]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });
      await mod.requestMidiAccess();

      const onNote = vi.fn();
      const result = mod.connectMidiInput('dev1', onNote);
      expect(result).toBe(true);
      expect(mod.isConnected()).toBe(true);
    });

    it('fires callback on Note On message', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([{ id: 'dev1', name: 'KB', manufacturer: 'X' }]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });
      await mod.requestMidiAccess();

      const onNote = vi.fn();
      mod.connectMidiInput('dev1', onNote);

      // Simulate Note On: status=0x90, note=60, velocity=100
      const input = mockAccess.inputs.get('dev1')!;
      input.onmidimessage({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 1234 });

      expect(onNote).toHaveBeenCalledWith({ note: 60, velocity: 100, timestamp: 1234 });
    });

    it('ignores Note Off (velocity 0)', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([{ id: 'dev1', name: 'KB', manufacturer: 'X' }]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });
      await mod.requestMidiAccess();

      const onNote = vi.fn();
      mod.connectMidiInput('dev1', onNote);

      const input = mockAccess.inputs.get('dev1')!;
      // Note On with velocity 0 = Note Off
      input.onmidimessage({ data: new Uint8Array([0x90, 60, 0]), timeStamp: 0 });
      expect(onNote).not.toHaveBeenCalled();
    });

    it('ignores non-note messages (Control Change)', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([{ id: 'dev1', name: 'KB', manufacturer: 'X' }]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });
      await mod.requestMidiAccess();

      const onNote = vi.fn();
      mod.connectMidiInput('dev1', onNote);

      const input = mockAccess.inputs.get('dev1')!;
      // CC message: 0xB0
      input.onmidimessage({ data: new Uint8Array([0xB0, 1, 64]), timeStamp: 0 });
      expect(onNote).not.toHaveBeenCalled();
    });

    it('ignores short messages (< 3 bytes)', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([{ id: 'dev1', name: 'KB', manufacturer: 'X' }]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });
      await mod.requestMidiAccess();

      const onNote = vi.fn();
      mod.connectMidiInput('dev1', onNote);

      const input = mockAccess.inputs.get('dev1')!;
      input.onmidimessage({ data: new Uint8Array([0x90]), timeStamp: 0 });
      expect(onNote).not.toHaveBeenCalled();
    });

    it('disconnects properly', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([{ id: 'dev1', name: 'KB', manufacturer: 'X' }]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });
      await mod.requestMidiAccess();

      mod.connectMidiInput('dev1', vi.fn());
      expect(mod.isConnected()).toBe(true);

      mod.disconnectMidiInput();
      expect(mod.isConnected()).toBe(false);
    });

    it('disconnects old device when connecting new one', async () => {
      const mod = await freshMidiModule();
      const mockAccess = createMockMidiAccess([
        { id: 'dev1', name: 'KB1', manufacturer: 'X' },
        { id: 'dev2', name: 'KB2', manufacturer: 'Y' },
      ]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(mockAccess),
        writable: true,
        configurable: true,
      });
      await mod.requestMidiAccess();

      mod.connectMidiInput('dev1', vi.fn());
      const input1 = mockAccess.inputs.get('dev1')!;
      expect(input1.onmidimessage).not.toBeNull();

      mod.connectMidiInput('dev2', vi.fn());
      expect(input1.onmidimessage).toBeNull(); // old device disconnected
      expect(mod.isConnected()).toBe(true);
    });
  });
});
