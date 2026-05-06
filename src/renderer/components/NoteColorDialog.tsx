import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibleDialog } from './AccessibleDialog';
import { RotateCcw } from 'lucide-react';

export interface NoteColorSettings {
  playable?: string;
  invisible?: string;
  landmine?: string;
  bgm?: string;
  selection?: string;
  background?: string;
}

interface ColorRowProps {
  label: string;
  description: string;
  defaultColor: string;
  value: string | undefined;
  onChange: (color: string | undefined) => void;
}

function ColorRow({ label, description, defaultColor, value, onChange }: ColorRowProps) {
  const { t } = useTranslation('app');
  const active = value ?? defaultColor;
  const isCustom = !!value;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded hover:bg-zinc-800/50 group">
      {/* Color swatch + picker */}
      <label className="relative cursor-pointer shrink-0" title={t('dialogs.noteColor.swatchTooltip', { label })}>
        <div
          className="w-7 h-7 rounded border border-zinc-600 group-hover:border-zinc-400 transition-colors"
          style={{ backgroundColor: active }}
        />
        <input
          type="color"
          value={active}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </label>

      {/* Labels */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-200">{label}</span>
          {isCustom && (
            <span className="text-xs bg-blue-900/60 text-blue-300 px-1 py-0.5 rounded">{t('dialogs.noteColor.customBadge')}</span>
          )}
        </div>
        <div className="text-xs text-zinc-500">{description}</div>
      </div>

      {/* Hex display */}
      <span className="text-xs font-mono text-zinc-400 w-16 text-right">{active}</span>

      {/* Reset button */}
      {isCustom && (
        <button
          onClick={() => onChange(undefined)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
          title={t('dialogs.noteColor.resetTooltip')}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      {!isCustom && <div className="w-6" />}
    </div>
  );
}

const COLOR_FIELD_KEYS: { key: keyof NoteColorSettings; defaultColor: string }[] = [
  { key: 'playable', defaultColor: '#88aaff' },
  { key: 'invisible', defaultColor: '#3a5499' },
  { key: 'landmine', defaultColor: '#ff4444' },
  { key: 'bgm', defaultColor: '#666666' },
  { key: 'selection', defaultColor: '#00ffff' },
  { key: 'background', defaultColor: '#0a0a1a' },
];

interface NoteColorDialogProps {
  open: boolean;
  onClose: () => void;
  colors: NoteColorSettings;
  onSetColor: (key: keyof NoteColorSettings, value: string) => void;
  onResetAll: () => void;
}

export function NoteColorDialog({ open, onClose, colors, onSetColor, onResetAll }: NoteColorDialogProps) {
  const { t } = useTranslation(['app', 'common']);
  const [local, setLocal] = useState<NoteColorSettings>({});

  const COLOR_FIELDS = COLOR_FIELD_KEYS.map(({ key, defaultColor }) => ({
    key,
    defaultColor,
    label: t(`dialogs.noteColor.fields.${key}.label`),
    description: t(`dialogs.noteColor.fields.${key}.description`),
  }));

  useEffect(() => {
    if (open) setLocal(colors);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(key: keyof NoteColorSettings, value: string | undefined) {
    setLocal((prev) => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  function handleApply() {
    const hasAnyClear = COLOR_FIELDS.some((f) => colors[f.key] !== undefined && local[f.key] === undefined);
    if (hasAnyClear) onResetAll();
    for (const field of COLOR_FIELDS) {
      const val = local[field.key];
      if (val !== undefined) onSetColor(field.key, val);
    }
    onClose();
  }

  function handleReset() {
    setLocal({});
  }

  const hasAnyCustom = COLOR_FIELDS.some((f) => local[f.key] !== undefined);

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title={t('dialogs.noteColor.title')}
      className="border border-zinc-700 w-[420px] flex flex-col"
    >
      <div className="px-4 pb-1 pt-1">
        <p className="text-xs text-zinc-400">
          {t('dialogs.noteColor.description')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {COLOR_FIELDS.map((field) => (
          <ColorRow
            key={field.key}
            label={field.label}
            description={field.description}
            defaultColor={field.defaultColor}
            value={local[field.key]}
            onChange={(v) => handleChange(field.key, v)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-700">
        <button
          onClick={handleReset}
          disabled={!hasAnyCustom}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          {t('dialogs.noteColor.resetAllButton')}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {t('common:actions.cancel')}
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            {t('dialogs.noteColor.applyButton')}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
