import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { DragAxisLock } from '@rhythm-archive/bms-editor';
import { AccessibleDialog } from './AccessibleDialog';
import { useEditorOptions, BGM_LANES_IN_VIEW_RANGE } from '../stores/editorOptionsStore';
import type { BgmLaneLayout } from '../lib/bgmLanes';

const DRAG_AXIS_OPTIONS = [
  { value: 'free', label: 'dialogs.editorOptions.dragAxis.options.free' },
  { value: 'auto', label: 'dialogs.editorOptions.dragAxis.options.auto' },
  { value: 'horizontal', label: 'dialogs.editorOptions.dragAxis.options.horizontal' },
  { value: 'vertical', label: 'dialogs.editorOptions.dragAxis.options.vertical' },
] as const satisfies readonly { value: DragAxisLock; label: string }[];
const BGM_LAYOUT_OPTIONS = [
  { value: 'packed', label: 'dialogs.editorOptions.bgmLayout.options.packed' },
  { value: 'source', label: 'dialogs.editorOptions.bgmLayout.options.source' },
] as const satisfies readonly { value: BgmLaneLayout; label: string }[];

interface EditorOptionsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Editor options (applied immediately, kept for every chart). */
export function EditorOptionsDialog({ open, onClose }: EditorOptionsDialogProps) {
  const { t } = useTranslation(['app', 'common']);
  const { dragAxisLock, bgmLaneLayout, bgmLanesInView, setOptions, resetOptions } = useEditorOptions();

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title={t('dialogs.editorOptions.title')}
      className="border border-zinc-700 w-[460px] flex flex-col"
    >
      <div className="px-4 pb-1 pt-1">
        <p className="text-xs text-zinc-400">{t('dialogs.editorOptions.description')}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 text-xs">
        <fieldset>
          <legend className="font-medium text-zinc-200 mb-0.5">{t('dialogs.editorOptions.dragAxis.label')}</legend>
          <p className="text-zinc-500 mb-1.5">{t('dialogs.editorOptions.dragAxis.description')}</p>
          <div className="space-y-1">
            {DRAG_AXIS_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-zinc-100">
                <input
                  type="radio"
                  name="editor-option-drag-axis"
                  value={value}
                  checked={dragAxisLock === value}
                  onChange={() => setOptions({ dragAxisLock: value })}
                  data-testid={`editor-option-drag-axis-${value}`}
                />
                {t(label)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-medium text-zinc-200 mb-0.5">{t('dialogs.editorOptions.bgmLayout.label')}</legend>
          <p className="text-zinc-500 mb-1.5">{t('dialogs.editorOptions.bgmLayout.description')}</p>
          <div className="space-y-1">
            {BGM_LAYOUT_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-zinc-100">
                <input
                  type="radio"
                  name="editor-option-bgm-layout"
                  value={value}
                  checked={bgmLaneLayout === value}
                  onChange={() => setOptions({ bgmLaneLayout: value })}
                  data-testid={`editor-option-bgm-layout-${value}`}
                />
                {t(label)}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="editor-option-bgm-lanes" className="block font-medium text-zinc-200 mb-0.5">
            {t('dialogs.editorOptions.bgmLanesInView.label')}
          </label>
          <p className="text-zinc-500 mb-1.5">{t('dialogs.editorOptions.bgmLanesInView.description')}</p>
          <div className="flex items-center gap-2">
            <input
              id="editor-option-bgm-lanes"
              type="range"
              min={BGM_LANES_IN_VIEW_RANGE.min}
              max={BGM_LANES_IN_VIEW_RANGE.max}
              value={bgmLanesInView}
              onChange={(e) => setOptions({ bgmLanesInView: Number(e.target.value) })}
              className="flex-1"
              data-testid="editor-option-bgm-lanes"
            />
            <span className="w-8 text-right tabular-nums text-zinc-300">{bgmLanesInView}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-700">
        <button
          onClick={resetOptions}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          {t('dialogs.editorOptions.resetButton')}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          {t('common:actions.close')}
        </button>
      </div>
    </AccessibleDialog>
  );
}
