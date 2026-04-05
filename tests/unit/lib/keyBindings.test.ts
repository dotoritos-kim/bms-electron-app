import {
  loadKeyBindings,
  saveKeyBindings,
  resetKeyBindings,
  normalizeKeyCombo,
  keyComboToDisplay,
  buildActionMap,
  DEFAULT_BINDINGS,
  ACTION_LABELS,
  ACTION_CATEGORIES,
  TOOL_ACTION_MAP,
  type KeyAction,
  type KeyBinding,
} from '../../../src/renderer/lib/keyBindings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockKeyEvent = (overrides: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    key: '',
    ...overrides,
  } as KeyboardEvent);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// normalizeKeyCombo
// ---------------------------------------------------------------------------

describe('normalizeKeyCombo', () => {
  it('returns simple key as lowercase', () => {
    expect(normalizeKeyCombo(mockKeyEvent({ key: 'v' }))).toBe('v');
  });

  it('maps Ctrl+S correctly', () => {
    expect(normalizeKeyCombo(mockKeyEvent({ ctrlKey: true, key: 's' }))).toBe('ctrl+s');
  });

  it('maps Ctrl+Shift+I correctly', () => {
    expect(
      normalizeKeyCombo(mockKeyEvent({ ctrlKey: true, shiftKey: true, key: 'I' })),
    ).toBe('ctrl+shift+i');
  });

  it('normalizes space key (e.key=" ") to "space"', () => {
    expect(normalizeKeyCombo(mockKeyEvent({ key: ' ' }))).toBe('space');
  });

  it('treats metaKey the same as ctrlKey', () => {
    expect(normalizeKeyCombo(mockKeyEvent({ metaKey: true, key: 's' }))).toBe('ctrl+s');
  });

  it('maps Alt+key correctly', () => {
    expect(normalizeKeyCombo(mockKeyEvent({ altKey: true, key: 'v' }))).toBe('alt+v');
  });

  it('maps arrow keys correctly', () => {
    expect(normalizeKeyCombo(mockKeyEvent({ key: 'ArrowUp' }))).toBe('arrowup');
    expect(normalizeKeyCombo(mockKeyEvent({ key: 'ArrowDown' }))).toBe('arrowdown');
    expect(normalizeKeyCombo(mockKeyEvent({ key: 'ArrowLeft' }))).toBe('arrowleft');
    expect(normalizeKeyCombo(mockKeyEvent({ key: 'ArrowRight' }))).toBe('arrowright');
  });

  it('handles Ctrl+Shift+Alt combo', () => {
    expect(
      normalizeKeyCombo(
        mockKeyEvent({ ctrlKey: true, shiftKey: true, altKey: true, key: 'x' }),
      ),
    ).toBe('ctrl+shift+alt+x');
  });

  it('lowercases uppercase letter keys', () => {
    expect(normalizeKeyCombo(mockKeyEvent({ key: 'V' }))).toBe('v');
  });

  it('handles function keys', () => {
    expect(normalizeKeyCombo(mockKeyEvent({ key: 'F5' }))).toBe('f5');
  });
});

// ---------------------------------------------------------------------------
// keyComboToDisplay
// ---------------------------------------------------------------------------

describe('keyComboToDisplay', () => {
  it('displays ctrl+s as Ctrl+S', () => {
    expect(keyComboToDisplay('ctrl+s')).toBe('Ctrl+S');
  });

  it('displays ctrl+shift+i as Ctrl+Shift+I', () => {
    expect(keyComboToDisplay('ctrl+shift+i')).toBe('Ctrl+Shift+I');
  });

  it('displays arrowup as up arrow symbol', () => {
    expect(keyComboToDisplay('arrowup')).toBe('\u2191');
  });

  it('displays arrowdown as down arrow symbol', () => {
    expect(keyComboToDisplay('arrowdown')).toBe('\u2193');
  });

  it('displays arrowleft as left arrow symbol', () => {
    expect(keyComboToDisplay('arrowleft')).toBe('\u2190');
  });

  it('displays arrowright as right arrow symbol', () => {
    expect(keyComboToDisplay('arrowright')).toBe('\u2192');
  });

  it('displays space as Space', () => {
    expect(keyComboToDisplay('space')).toBe('Space');
  });

  it('displays delete as Del', () => {
    expect(keyComboToDisplay('delete')).toBe('Del');
  });

  it('displays escape as Esc', () => {
    expect(keyComboToDisplay('escape')).toBe('Esc');
  });

  it('displays backspace as Backspace', () => {
    expect(keyComboToDisplay('backspace')).toBe('Backspace');
  });

  it('displays enter as Enter', () => {
    expect(keyComboToDisplay('enter')).toBe('Enter');
  });

  it('displays tab as Tab', () => {
    expect(keyComboToDisplay('tab')).toBe('Tab');
  });

  it('keeps multi-char non-special keys as-is (e.g. f5)', () => {
    expect(keyComboToDisplay('f5')).toBe('f5');
  });

  it('uppercases single-char keys', () => {
    expect(keyComboToDisplay('v')).toBe('V');
  });

  it('handles alt modifier', () => {
    expect(keyComboToDisplay('alt+v')).toBe('Alt+V');
  });
});

// ---------------------------------------------------------------------------
// buildActionMap
// ---------------------------------------------------------------------------

describe('buildActionMap', () => {
  it('returns a Map with correct size from DEFAULT_BINDINGS', () => {
    const map = buildActionMap(DEFAULT_BINDINGS);
    expect(map.size).toBe(DEFAULT_BINDINGS.length);
  });

  it('maps ctrl+s to save', () => {
    const map = buildActionMap(DEFAULT_BINDINGS);
    expect(map.get('ctrl+s')).toBe('save');
  });

  it('maps space to playToggle', () => {
    const map = buildActionMap(DEFAULT_BINDINGS);
    expect(map.get('space')).toBe('playToggle');
  });

  it('lowercases all keys in the map', () => {
    const bindings: KeyBinding[] = [
      { label: 'Test', action: 'save', key: 'Ctrl+S' },
    ];
    const map = buildActionMap(bindings);
    expect(map.has('ctrl+s')).toBe(true);
    expect(map.has('Ctrl+S')).toBe(false);
  });

  it('last binding wins when duplicates exist', () => {
    const bindings: KeyBinding[] = [
      { label: 'A', action: 'save', key: 'ctrl+s' },
      { label: 'B', action: 'undo', key: 'ctrl+s' },
    ];
    const map = buildActionMap(bindings);
    expect(map.get('ctrl+s')).toBe('undo');
  });

  it('handles custom bindings', () => {
    const bindings: KeyBinding[] = [
      { label: 'Custom', action: 'mirror', key: 'alt+m' },
    ];
    const map = buildActionMap(bindings);
    expect(map.get('alt+m')).toBe('mirror');
  });
});

// ---------------------------------------------------------------------------
// loadKeyBindings
// ---------------------------------------------------------------------------

describe('loadKeyBindings', () => {
  it('returns DEFAULT_BINDINGS when nothing saved', () => {
    const result = loadKeyBindings();
    expect(result).toEqual(DEFAULT_BINDINGS);
  });

  it('returns saved overrides merged with defaults', () => {
    const custom: KeyBinding[] = [
      { label: 'Save Custom', action: 'save', key: 'ctrl+shift+s' },
    ];
    localStorage.setItem('bms-editor-keybindings', JSON.stringify(custom));

    const result = loadKeyBindings();
    const saveBinding = result.find((b) => b.action === 'save');
    expect(saveBinding?.key).toBe('ctrl+shift+s');
    expect(saveBinding?.label).toBe('Save Custom');
    // Other bindings should still be defaults
    expect(result.length).toBe(DEFAULT_BINDINGS.length);
  });

  it('returns DEFAULT_BINDINGS on corrupt JSON', () => {
    localStorage.setItem('bms-editor-keybindings', 'not valid json{{{');
    expect(loadKeyBindings()).toEqual(DEFAULT_BINDINGS);
  });

  it('fills missing actions from defaults (partial save)', () => {
    const partial: KeyBinding[] = [
      { label: 'Undo Custom', action: 'undo', key: 'ctrl+shift+z' },
    ];
    localStorage.setItem('bms-editor-keybindings', JSON.stringify(partial));

    const result = loadKeyBindings();
    expect(result.length).toBe(DEFAULT_BINDINGS.length);

    const undoBinding = result.find((b) => b.action === 'undo');
    expect(undoBinding?.key).toBe('ctrl+shift+z');

    const saveBinding = result.find((b) => b.action === 'save');
    expect(saveBinding?.key).toBe('ctrl+s'); // default
  });

  it('lowercases saved keys', () => {
    const custom: KeyBinding[] = [
      { label: 'Save', action: 'save', key: 'Ctrl+S' },
    ];
    localStorage.setItem('bms-editor-keybindings', JSON.stringify(custom));

    const result = loadKeyBindings();
    const saveBinding = result.find((b) => b.action === 'save');
    expect(saveBinding?.key).toBe('ctrl+s');
  });

  it('preserves order of DEFAULT_BINDINGS', () => {
    const custom: KeyBinding[] = [
      { label: 'Redo', action: 'redo', key: 'ctrl+shift+z' },
      { label: 'Save', action: 'save', key: 'ctrl+shift+s' },
    ];
    localStorage.setItem('bms-editor-keybindings', JSON.stringify(custom));

    const result = loadKeyBindings();
    // save should come before redo (matching DEFAULT_BINDINGS order)
    const saveIdx = result.findIndex((b) => b.action === 'save');
    const redoIdx = result.findIndex((b) => b.action === 'redo');
    expect(saveIdx).toBeLessThan(redoIdx);
  });
});

// ---------------------------------------------------------------------------
// saveKeyBindings
// ---------------------------------------------------------------------------

describe('saveKeyBindings', () => {
  it('saves JSON to localStorage', () => {
    const bindings: KeyBinding[] = [
      { label: 'Test', action: 'save', key: 'ctrl+shift+s' },
    ];
    saveKeyBindings(bindings);
    const stored = localStorage.getItem('bms-editor-keybindings');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(bindings);
  });

  it('saved bindings can be loaded back', () => {
    const custom: KeyBinding[] = DEFAULT_BINDINGS.map((b) =>
      b.action === 'save' ? { ...b, key: 'ctrl+shift+s' } : b,
    );
    saveKeyBindings(custom);

    const result = loadKeyBindings();
    const saveBinding = result.find((b) => b.action === 'save');
    expect(saveBinding?.key).toBe('ctrl+shift+s');
  });
});

// ---------------------------------------------------------------------------
// resetKeyBindings
// ---------------------------------------------------------------------------

describe('resetKeyBindings', () => {
  it('removes saved bindings from localStorage', () => {
    saveKeyBindings(DEFAULT_BINDINGS);
    expect(localStorage.getItem('bms-editor-keybindings')).not.toBeNull();

    resetKeyBindings();
    expect(localStorage.getItem('bms-editor-keybindings')).toBeNull();
  });

  it('loadKeyBindings returns defaults after reset', () => {
    const custom: KeyBinding[] = [
      { label: 'Custom', action: 'save', key: 'alt+s' },
    ];
    saveKeyBindings(custom);
    resetKeyBindings();

    expect(loadKeyBindings()).toEqual(DEFAULT_BINDINGS);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DEFAULT_BINDINGS', () => {
  it('has 37 entries', () => {
    expect(DEFAULT_BINDINGS).toHaveLength(37);
  });

  it('every binding has required fields', () => {
    for (const binding of DEFAULT_BINDINGS) {
      expect(binding).toHaveProperty('label');
      expect(binding).toHaveProperty('action');
      expect(binding).toHaveProperty('key');
      expect(binding.label).toBeTruthy();
      expect(binding.action).toBeTruthy();
      expect(binding.key).toBeTruthy();
    }
  });

  it('all actions are unique', () => {
    const actions = DEFAULT_BINDINGS.map((b) => b.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('all keys are lowercase', () => {
    for (const binding of DEFAULT_BINDINGS) {
      expect(binding.key).toBe(binding.key.toLowerCase());
    }
  });
});

describe('ACTION_LABELS', () => {
  it('has an entry for every KeyAction in DEFAULT_BINDINGS', () => {
    for (const binding of DEFAULT_BINDINGS) {
      expect(ACTION_LABELS).toHaveProperty(binding.action);
      expect(ACTION_LABELS[binding.action]).toBeTruthy();
    }
  });

  it('has exactly as many entries as unique actions', () => {
    const labelKeys = Object.keys(ACTION_LABELS);
    const uniqueActions = new Set(DEFAULT_BINDINGS.map((b) => b.action));
    expect(labelKeys.length).toBe(uniqueActions.size);
  });
});

describe('ACTION_CATEGORIES', () => {
  it('covers all actions from DEFAULT_BINDINGS', () => {
    const categorizedActions = ACTION_CATEGORIES.flatMap((c) => c.actions);
    const defaultActions = DEFAULT_BINDINGS.map((b) => b.action);

    for (const action of defaultActions) {
      expect(categorizedActions).toContain(action);
    }
  });

  it('has no duplicate actions across categories', () => {
    const all = ACTION_CATEGORIES.flatMap((c) => c.actions);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every category has a label and at least one action', () => {
    for (const cat of ACTION_CATEGORIES) {
      expect(cat.label).toBeTruthy();
      expect(cat.actions.length).toBeGreaterThan(0);
    }
  });
});

describe('TOOL_ACTION_MAP', () => {
  it('maps exactly 7 tool actions', () => {
    expect(Object.keys(TOOL_ACTION_MAP)).toHaveLength(7);
  });

  it('maps all tool* actions from DEFAULT_BINDINGS', () => {
    const toolActions = DEFAULT_BINDINGS.filter((b) => b.action.startsWith('tool')).map(
      (b) => b.action,
    );
    for (const action of toolActions) {
      expect(TOOL_ACTION_MAP).toHaveProperty(action);
    }
  });

  it('maps to correct EditorTool values', () => {
    expect(TOOL_ACTION_MAP.toolSelect).toBe('select');
    expect(TOOL_ACTION_MAP.toolAddNote).toBe('addNote');
    expect(TOOL_ACTION_MAP.toolDelete).toBe('delete');
    expect(TOOL_ACTION_MAP.toolMove).toBe('move');
    expect(TOOL_ACTION_MAP.toolKeysound).toBe('keysound');
    expect(TOOL_ACTION_MAP.toolBpm).toBe('bpm');
    expect(TOOL_ACTION_MAP.toolStop).toBe('stop');
  });
});
