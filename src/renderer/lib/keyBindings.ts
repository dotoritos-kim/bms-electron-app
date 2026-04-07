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

export const ACTION_LABELS: Record<KeyAction, string> = {
  save: '저장',
  saveAs: '다른 이름으로 저장',
  undo: '실행 취소',
  redo: '다시 실행',
  copy: '복사',
  cut: '잘라내기',
  paste: '붙여넣기',
  selectAll: '전체 선택',
  delete: '삭제',
  escape: '취소/선택 해제',
  noteSearch: '노트 검색',
  playTest: '플레이 테스트',
  playToggle: '재생/일시정지',
  mirror: '미러',
  random: '랜덤',
  quantize: '퀀타이즈',
  insertMeasure: '마디 삽입',
  deleteMeasure: '마디 삭제',
  moveUp: '위로 이동',
  moveDown: '아래로 이동',
  moveLeft: '왼쪽 이동',
  moveRight: '오른쪽 이동',
  toolSelect: '선택 도구',
  toolAddNote: '노트 추가 도구',
  toolDelete: '삭제 도구',
  toolMove: '이동 도구',
  toolKeysound: '키음 도구',
  toolBpm: 'BPM 도구',
  toolStop: 'STOP 도구',
  setLoopA: '루프 시작점',
  setLoopB: '루프 끝점',
  clearLoop: '루프 해제',
  togglePatternPanel: '패턴 패널 전환',
  toggleDiff: '변경사항 비교',
  moveToBgm: '선택 노트 → BGM',
  moveToPlay: '선택 노트 → 플레이',
  addBookmark: '북마크 추가',
  createGroup: '그룹 생성',
  toggleSnap: '스냅 토글',
};

export const ACTION_CATEGORIES: { label: string; actions: KeyAction[] }[] = [
  { label: '파일', actions: ['save', 'saveAs'] },
  { label: '편집', actions: ['undo', 'redo', 'copy', 'cut', 'paste', 'selectAll', 'delete', 'escape'] },
  { label: '검색', actions: ['noteSearch'] },
  { label: '재생', actions: ['playTest', 'playToggle'] },
  { label: '변환', actions: ['mirror', 'random', 'quantize'] },
  { label: '마디', actions: ['insertMeasure', 'deleteMeasure'] },
  { label: '이동', actions: ['moveUp', 'moveDown', 'moveLeft', 'moveRight'] },
  { label: '도구', actions: ['toolSelect', 'toolAddNote', 'toolDelete', 'toolMove', 'toolKeysound', 'toolBpm', 'toolStop'] },
  { label: '루프', actions: ['setLoopA', 'setLoopB', 'clearLoop'] },
  { label: '패널', actions: ['togglePatternPanel', 'toggleDiff'] },
  { label: '레이어', actions: ['moveToBgm', 'moveToPlay'] },
  { label: '북마크/그룹', actions: ['addBookmark', 'createGroup', 'toggleSnap'] },
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
  { label: '저장', action: 'save', key: 'ctrl+s' },
  { label: '다른 이름으로 저장', action: 'saveAs', key: 'ctrl+shift+s' },
  { label: '실행 취소', action: 'undo', key: 'ctrl+z' },
  { label: '다시 실행', action: 'redo', key: 'ctrl+y' },
  { label: '복사', action: 'copy', key: 'ctrl+c' },
  { label: '잘라내기', action: 'cut', key: 'ctrl+x' },
  { label: '붙여넣기', action: 'paste', key: 'ctrl+v' },
  { label: '전체 선택', action: 'selectAll', key: 'ctrl+a' },
  { label: '삭제', action: 'delete', key: 'delete' },
  { label: '취소', action: 'escape', key: 'escape' },
  { label: '노트 검색', action: 'noteSearch', key: 'ctrl+f' },
  { label: '플레이 테스트', action: 'playTest', key: 'f5' },
  { label: '재생/일시정지', action: 'playToggle', key: 'space' },
  { label: '미러', action: 'mirror', key: 'ctrl+m' },
  { label: '랜덤', action: 'random', key: 'ctrl+r' },
  { label: '퀀타이즈', action: 'quantize', key: 'q' },
  { label: '마디 삽입', action: 'insertMeasure', key: 'ctrl+shift+i' },
  { label: '마디 삭제', action: 'deleteMeasure', key: 'ctrl+shift+d' },
  { label: '위로 이동', action: 'moveUp', key: 'arrowup' },
  { label: '아래로 이동', action: 'moveDown', key: 'arrowdown' },
  { label: '왼쪽 이동', action: 'moveLeft', key: 'arrowleft' },
  { label: '오른쪽 이동', action: 'moveRight', key: 'arrowright' },
  { label: '선택 도구', action: 'toolSelect', key: 'v' },
  { label: '노트 추가', action: 'toolAddNote', key: 'a' },
  { label: '삭제 도구', action: 'toolDelete', key: 'd' },
  { label: '이동 도구', action: 'toolMove', key: 'm' },
  { label: '키음 도구', action: 'toolKeysound', key: 'k' },
  { label: 'BPM 도구', action: 'toolBpm', key: 'b' },
  { label: 'STOP 도구', action: 'toolStop', key: 't' },
  { label: '루프 시작점', action: 'setLoopA', key: '[' },
  { label: '루프 끝점', action: 'setLoopB', key: ']' },
  { label: '루프 해제', action: 'clearLoop', key: '\\' },
  { label: '패턴 패널', action: 'togglePatternPanel', key: 'p' },
  { label: '변경사항 비교', action: 'toggleDiff', key: 'ctrl+d' },
  { label: 'BGM으로 이동', action: 'moveToBgm', key: 'ctrl+shift+b' },
  { label: '플레이로 이동', action: 'moveToPlay', key: 'ctrl+shift+p' },
  { label: '북마크 추가', action: 'addBookmark', key: 'ctrl+b' },
  { label: '그룹 생성', action: 'createGroup', key: 'ctrl+g' },
  { label: '스냅 토글', action: 'toggleSnap', key: 'g' },
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
