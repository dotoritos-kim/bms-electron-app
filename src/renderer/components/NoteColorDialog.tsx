import React, { useState, useEffect } from 'react';
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
  const active = value ?? defaultColor;
  const isCustom = !!value;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded hover:bg-zinc-800/50 group">
      {/* Color swatch + picker */}
      <label className="relative cursor-pointer shrink-0" title={`${label} 색상 선택`}>
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
            <span className="text-[9px] bg-blue-900/60 text-blue-300 px-1 py-0.5 rounded">커스텀</span>
          )}
        </div>
        <div className="text-[10px] text-zinc-500">{description}</div>
      </div>

      {/* Hex display */}
      <span className="text-[10px] font-mono text-zinc-400 w-16 text-right">{active}</span>

      {/* Reset button */}
      {isCustom && (
        <button
          onClick={() => onChange(undefined)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
          title="기본값으로 초기화"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      {!isCustom && <div className="w-6" />}
    </div>
  );
}

const COLOR_FIELDS: {
  key: keyof NoteColorSettings;
  label: string;
  description: string;
  defaultColor: string;
}[] = [
  { key: 'playable', label: '플레이어블 노트', description: '일반 노트 (레인 색상 오버라이드)', defaultColor: '#88aaff' },
  { key: 'invisible', label: '인비저블 노트', description: '보이지 않는 노트', defaultColor: '#3a5499' },
  { key: 'landmine', label: '지뢰 노트', description: '레인에 닿으면 판정 감소', defaultColor: '#ff4444' },
  { key: 'bgm', label: 'BGM 노트', description: '배경음 노트', defaultColor: '#666666' },
  { key: 'selection', label: '선택 하이라이트', description: '선택된 노트 외곽선', defaultColor: '#00ffff' },
  { key: 'background', label: '캔버스 배경', description: '에디터 캔버스 배경색', defaultColor: '#0a0a1a' },
];

interface NoteColorDialogProps {
  open: boolean;
  onClose: () => void;
  colors: NoteColorSettings;
  onSetColor: (key: keyof NoteColorSettings, value: string) => void;
  onResetAll: () => void;
}

export function NoteColorDialog({ open, onClose, colors, onSetColor, onResetAll }: NoteColorDialogProps) {
  // Local state for live preview without touching store until confirm
  const [local, setLocal] = useState<NoteColorSettings>({});

  // Sync local state when dialog opens
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
    // 초기화된 색상이 있으면 전체 리셋 후 재적용, 아니면 바로 적용
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
    onResetAll();
  }

  const hasAnyCustom = COLOR_FIELDS.some((f) => local[f.key] !== undefined);

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title="노트 색상 설정"
      className="border border-zinc-700 w-[420px] flex flex-col"
    >
      <div className="px-4 pb-1 pt-1">
        <p className="text-[11px] text-zinc-500">
          노트 타입별 색상을 변경합니다. 색상 칸을 클릭하여 색을 선택하세요.
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
          전체 초기화
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            적용
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
