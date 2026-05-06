import type { EditorTool } from '@rhythm-archive/bms-editor';

export interface KeyBinding {
  /** Display label */
  label: string;
  /** Action ID */
  action: KeyAction;
  /** Key combo string, e.g. "ctrl+s", "v", "shift+Delete" */
  key: string;
}

export type KeyAction =
  // File
  | 'save'
  | 'saveAs'
  // Edit
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'selectAll'
  | 'delete'
  | 'escape'
  // Search
  | 'noteSearch'
  // Playback
  | 'playTest'
  | 'playToggle'
  // Transform
  | 'mirror'
  | 'random'
  | 'quantize'
  // Measure
  | 'insertMeasure'
  | 'deleteMeasure'
  // Move
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  // Tools
  | 'toolSelect'
  | 'toolAddNote'
  | 'toolDelete'
  | 'toolMove'
  | 'toolKeysound'
  | 'toolBpm'
  | 'toolStop'
  // A-B Loop
  | 'setLoopA'
  | 'setLoopB'
  | 'clearLoop'
  // Clipboard
  | 'clipboardHistory'
  // Panel
  | 'togglePatternPanel'
  // Diff
  | 'toggleDiff'
  // Layer
  | 'moveToBgm'
  | 'moveToPlay'
  // Bookmark / Group / Snap
  | 'addBookmark'
  | 'createGroup'
  | 'toggleSnap';

/** Fallback English labels used when i18n is not available */
export const ACTION_LABELS: Record<KeyAction, string> = {
  save: 'Save',
  saveAs: 'Save As',
  undo: 'Undo',
  redo: 'Redo',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  selectAll: 'Select All',
  delete: 'Delete',
  escape: 'Cancel / Deselect',
  noteSearch: 'Note Search',
  playTest: 'Play Test',
  playToggle: 'Play / Pause',
  mirror: 'Mirror',
  random: 'Randomize',
  quantize: 'Quantize',
  insertMeasure: 'Insert Measure',
  deleteMeasure: 'Delete Measure',
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  toolSelect: 'Select Tool',
  toolAddNote: 'Add Note Tool',
  toolDelete: 'Delete Tool',
  toolMove: 'Move Tool',
  toolKeysound: 'Keysound Tool',
  toolBpm: 'BPM Tool',
  toolStop: 'Stop Tool',
  setLoopA: 'Set Loop Start',
  setLoopB: 'Set Loop End',
  clearLoop: 'Clear Loop',
  clipboardHistory: 'Clipboard History',
  togglePatternPanel: 'Toggle Pattern Panel',
  toggleDiff: 'Toggle Diff View',
  moveToBgm: 'Selected Notes → BGM',
  moveToPlay: 'Selected Notes → Playable',
  addBookmark: 'Add Bookmark',
  createGroup: 'Create Group',
  toggleSnap: 'Toggle Snap',
};

export type ActionCategoryId =
  | 'file'
  | 'edit'
  | 'search'
  | 'playback'
  | 'transform'
  | 'measure'
  | 'move'
  | 'tools'
  | 'loop'
  | 'clipboard'
  | 'panel'
  | 'layer'
  | 'bookmark';

export const ACTION_CATEGORIES: { id: ActionCategoryId; label: string; actions: KeyAction[] }[] = [
  { id: 'file', label: 'File', actions: ['save', 'saveAs'] },
  { id: 'edit', label: 'Edit', actions: ['undo', 'redo', 'copy', 'cut', 'paste', 'selectAll', 'delete', 'escape'] },
  { id: 'search', label: 'Search', actions: ['noteSearch'] },
  { id: 'playback', label: 'Playback', actions: ['playTest', 'playToggle'] },
  { id: 'transform', label: 'Transform', actions: ['mirror', 'random', 'quantize'] },
  { id: 'measure', label: 'Measure', actions: ['insertMeasure', 'deleteMeasure'] },
  { id: 'move', label: 'Move', actions: ['moveUp', 'moveDown', 'moveLeft', 'moveRight'] },
  { id: 'tools', label: 'Tools', actions: ['toolSelect', 'toolAddNote', 'toolDelete', 'toolMove', 'toolKeysound', 'toolBpm', 'toolStop'] },
  { id: 'loop', label: 'Loop', actions: ['setLoopA', 'setLoopB', 'clearLoop'] },
  { id: 'clipboard', label: 'Clipboard', actions: ['clipboardHistory'] },
  { id: 'panel', label: 'Panel', actions: ['togglePatternPanel', 'toggleDiff'] },
  { id: 'layer', label: 'Layer', actions: ['moveToBgm', 'moveToPlay'] },
  { id: 'bookmark', label: 'Bookmark / Group', actions: ['addBookmark', 'createGroup', 'toggleSnap'] },
];

export const TOOL_ACTION_MAP: Partial<Record<KeyAction, EditorTool>> = {
  toolSelect: 'select',
  toolAddNote: 'addNote',
  toolDelete: 'delete',
  toolMove: 'move',
  toolKeysound: 'keysound',
  toolBpm: 'bpm',
  toolStop: 'stop',
};

export const DEFAULT_BINDINGS: KeyBinding[] = [
  { label: 'Save', action: 'save', key: 'ctrl+s' },
  { label: 'Save As', action: 'saveAs', key: 'ctrl+shift+s' },
  { label: 'Undo', action: 'undo', key: 'ctrl+z' },
  { label: 'Redo', action: 'redo', key: 'ctrl+y' },
  { label: 'Copy', action: 'copy', key: 'ctrl+c' },
  { label: 'Cut', action: 'cut', key: 'ctrl+x' },
  { label: 'Paste', action: 'paste', key: 'ctrl+v' },
  { label: 'Select All', action: 'selectAll', key: 'ctrl+a' },
  { label: 'Delete', action: 'delete', key: 'delete' },
  { label: 'Cancel', action: 'escape', key: 'escape' },
  { label: 'Note Search', action: 'noteSearch', key: 'ctrl+f' },
  { label: 'Play Test', action: 'playTest', key: 'f5' },
  { label: 'Play / Pause', action: 'playToggle', key: 'space' },
  { label: 'Mirror', action: 'mirror', key: 'ctrl+m' },
  { label: 'Randomize', action: 'random', key: 'ctrl+r' },
  { label: 'Quantize', action: 'quantize', key: 'q' },
  { label: 'Insert Measure', action: 'insertMeasure', key: 'ctrl+shift+i' },
  { label: 'Delete Measure', action: 'deleteMeasure', key: 'ctrl+shift+d' },
  { label: 'Move Up', action: 'moveUp', key: 'arrowup' },
  { label: 'Move Down', action: 'moveDown', key: 'arrowdown' },
  { label: 'Move Left', action: 'moveLeft', key: 'arrowleft' },
  { label: 'Move Right', action: 'moveRight', key: 'arrowright' },
  { label: 'Select Tool', action: 'toolSelect', key: 'v' },
  { label: 'Select Tool (num)', action: 'toolSelect', key: '1' },
  { label: 'Add Note', action: 'toolAddNote', key: 'a' },
  { label: 'Add Note (num)', action: 'toolAddNote', key: '2' },
  { label: 'Delete Tool', action: 'toolDelete', key: 'd' },
  { label: 'Delete Tool (num)', action: 'toolDelete', key: '3' },
  { label: 'Move Tool', action: 'toolMove', key: 'm' },
  { label: 'Move Tool (num)', action: 'toolMove', key: '4' },
  { label: 'Keysound Tool', action: 'toolKeysound', key: 'k' },
  { label: 'Keysound Tool (num)', action: 'toolKeysound', key: '5' },
  { label: 'BPM Tool', action: 'toolBpm', key: 'b' },
  { label: 'BPM Tool (num)', action: 'toolBpm', key: '6' },
  { label: 'Stop Tool', action: 'toolStop', key: 't' },
  { label: 'Stop Tool (num)', action: 'toolStop', key: '7' },
  { label: 'Set Loop Start', action: 'setLoopA', key: '[' },
  { label: 'Set Loop End', action: 'setLoopB', key: ']' },
  { label: 'Clear Loop', action: 'clearLoop', key: '\\' },
  { label: 'Clipboard History', action: 'clipboardHistory', key: 'ctrl+shift+v' },
  { label: 'Pattern Panel', action: 'togglePatternPanel', key: 'p' },
  { label: 'Diff View', action: 'toggleDiff', key: 'ctrl+d' },
  { label: 'Move to BGM', action: 'moveToBgm', key: 'ctrl+shift+b' },
  { label: 'Move to Playable', action: 'moveToPlay', key: 'ctrl+shift+p' },
  { label: 'Add Bookmark', action: 'addBookmark', key: 'ctrl+b' },
  { label: 'Create Group', action: 'createGroup', key: 'ctrl+g' },
  { label: 'Toggle Snap', action: 'toggleSnap', key: 'g' },
];

// --- Storage ---

const STORAGE_KEY = 'bms-editor-keybindings';

export function loadKeyBindings(): KeyBinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BINDINGS;
    const saved = JSON.parse(raw) as KeyBinding[];
    // Normalize old saved keys to lowercase for consistency
    const savedMap = new Map(saved.map((b) => [b.action, { ...b, key: b.key.toLowerCase() }]));
    return DEFAULT_BINDINGS.map((def) => savedMap.get(def.action) || def);
  } catch {
    return DEFAULT_BINDINGS;
  }
}

export function saveKeyBindings(bindings: KeyBinding[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

export function resetKeyBindings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// --- Key matching ---

export function normalizeKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  let key = e.key;
  // Normalize Space key (e.key returns ' ' for Space)
  if (key === ' ') key = 'Space';
  // Lowercase all keys for consistent matching with buildActionMap
  key = key.toLowerCase();

  parts.push(key);
  return parts.join('+');
}

export function keyComboToDisplay(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      switch (p.toLowerCase()) {
        case 'ctrl': return 'Ctrl';
        case 'shift': return 'Shift';
        case 'alt': return 'Alt';
        case 'arrowup': return '↑';
        case 'arrowdown': return '↓';
        case 'arrowleft': return '←';
        case 'arrowright': return '→';
        case 'space': return 'Space';
        case 'delete': return 'Del';
        case 'escape': return 'Esc';
        case 'backspace': return 'Backspace';
        case 'enter': return 'Enter';
        case 'tab': return 'Tab';
        default: return p.length === 1 ? p.toUpperCase() : p;
      }
    })
    .join('+');
}

export function buildActionMap(bindings: KeyBinding[]): Map<string, KeyAction> {
  const map = new Map<string, KeyAction>();
  for (const b of bindings) {
    map.set(b.key.toLowerCase(), b.action);
  }
  return map;
}
