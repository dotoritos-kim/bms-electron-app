/**
 * Editor options (persisted in localStorage, shared by every chart).
 */
import { create } from 'zustand';
import type { DragAxisLock } from '@rhythm-archive/bms-editor';
import type { BgmLaneLayout } from '../lib/bgmLanes';

export interface EditorOptions {
  /** How a dragged note may move: freely, or along one axis only. */
  dragAxisLock: DragAxisLock;
  /**
   * BGM lane layout used when a chart is opened (a .bms.meta layout wins).
   * Default: as written in the file (#xxx01 line order, as BMSE / iBMSC show it).
   */
  bgmLaneLayout: BgmLaneLayout;
  /** BGM lanes kept on screen next to the key lanes; more scroll sideways. */
  bgmLanesInView: number;
}

export const DEFAULT_EDITOR_OPTIONS: EditorOptions = {
  dragAxisLock: 'free',
  bgmLaneLayout: 'source',
  bgmLanesInView: 12,
};

export const BGM_LANES_IN_VIEW_RANGE = { min: 1, max: 64 } as const;

const STORAGE_KEY = 'editor-options';
/**
 * Version of the stored options. Unversioned records (0.6.0-0.8.0) hold
 * `bgmLaneLayout: 'packed'` because that was the default whenever any option
 * was changed, not because it was chosen: their layout is dropped so the
 * current default applies.
 */
const STORAGE_VERSION = 2;
const DRAG_AXIS_LOCKS: readonly DragAxisLock[] = ['free', 'auto', 'horizontal', 'vertical'];
const BGM_LANE_LAYOUTS: readonly BgmLaneLayout[] = ['packed', 'source'];

/** Options from a stored value; unknown / corrupt fields fall back to the defaults. */
export function parseEditorOptions(raw: unknown): EditorOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lanes = Number(o.bgmLanesInView);
  return {
    dragAxisLock: DRAG_AXIS_LOCKS.includes(o.dragAxisLock as DragAxisLock)
      ? o.dragAxisLock as DragAxisLock : DEFAULT_EDITOR_OPTIONS.dragAxisLock,
    bgmLaneLayout: BGM_LANE_LAYOUTS.includes(o.bgmLaneLayout as BgmLaneLayout)
      ? o.bgmLaneLayout as BgmLaneLayout : DEFAULT_EDITOR_OPTIONS.bgmLaneLayout,
    bgmLanesInView: Number.isFinite(lanes)
      ? Math.max(BGM_LANES_IN_VIEW_RANGE.min, Math.min(BGM_LANES_IN_VIEW_RANGE.max, Math.round(lanes)))
      : DEFAULT_EDITOR_OPTIONS.bgmLanesInView,
  };
}

/** Options from the stored JSON value, older records migrated. */
export function migrateStoredOptions(stored: unknown): EditorOptions {
  if (!stored || typeof stored !== 'object') return parseEditorOptions(null);
  const o = { ...(stored as Record<string, unknown>) };
  if (o.version !== STORAGE_VERSION) delete o.bgmLaneLayout;
  return parseEditorOptions(o);
}

function load(): EditorOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return migrateStoredOptions(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_EDITOR_OPTIONS };
  }
}

interface EditorOptionsState extends EditorOptions {
  setOptions: (patch: Partial<EditorOptions>) => void;
  resetOptions: () => void;
}

const persist = (options: EditorOptions) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...options, version: STORAGE_VERSION })); } catch { /* quota */ }
};

export const useEditorOptions = create<EditorOptionsState>((set, get) => ({
  ...load(),
  setOptions: (patch) => {
    const { setOptions: _s, resetOptions: _r, ...current } = get();
    const next = parseEditorOptions({ ...current, ...patch });
    persist(next);
    set(next);
  },
  resetOptions: () => {
    persist(DEFAULT_EDITOR_OPTIONS);
    set({ ...DEFAULT_EDITOR_OPTIONS });
  },
}));
