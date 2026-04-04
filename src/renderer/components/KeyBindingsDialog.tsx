import { useState, useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { KeyBinding, KeyAction } from '../lib/keyBindings';
import {
  ACTION_CATEGORIES,
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  keyComboToDisplay,
  normalizeKeyCombo,
  saveKeyBindings,
} from '../lib/keyBindings';

interface KeyBindingsDialogProps {
  open: boolean;
  onClose: () => void;
  bindings: KeyBinding[];
  onBindingsChange: (bindings: KeyBinding[]) => void;
}

export function KeyBindingsDialog({ open, onClose, bindings, onBindingsChange }: KeyBindingsDialogProps) {
  const [editingAction, setEditingAction] = useState<KeyAction | null>(null);
  const [localBindings, setLocalBindings] = useState<KeyBinding[]>(bindings);
  const listeningRef = useRef(false);

  useEffect(() => {
    setLocalBindings(bindings);
  }, [bindings]);

  const bindingMap = new Map(localBindings.map((b) => [b.action, b]));

  const handleStartEdit = useCallback((action: KeyAction) => {
    setEditingAction(action);
    listeningRef.current = true;
  }, []);

  useEffect(() => {
    if (!editingAction) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore lone modifier keys
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      const combo = normalizeKeyCombo(e);
      setLocalBindings((prev) => {
        const next = prev.map((b) =>
          b.action === editingAction ? { ...b, key: combo } : b,
        );
        return next;
      });
      setEditingAction(null);
      listeningRef.current = false;
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [editingAction]);

  const handleSave = useCallback(() => {
    saveKeyBindings(localBindings);
    onBindingsChange(localBindings);
    onClose();
  }, [localBindings, onBindingsChange, onClose]);

  const handleReset = useCallback(() => {
    setLocalBindings(DEFAULT_BINDINGS);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-[480px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200">키 바인딩 설정</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
          {ACTION_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-3">
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">{cat.label}</h3>
              <div className="space-y-0.5">
                {cat.actions.map((action) => {
                  const binding = bindingMap.get(action);
                  const isEditing = editingAction === action;
                  const defaultBinding = DEFAULT_BINDINGS.find((b) => b.action === action);
                  const isModified = binding?.key !== defaultBinding?.key;

                  return (
                    <div
                      key={action}
                      className={`flex items-center justify-between px-2 py-1.5 rounded ${
                        isEditing ? 'bg-blue-900/30 border border-blue-700/50' : 'hover:bg-zinc-800/50'
                      }`}
                    >
                      <span className={`text-xs ${isModified ? 'text-yellow-300' : 'text-zinc-300'}`}>
                        {ACTION_LABELS[action]}
                      </span>
                      <button
                        onClick={() => handleStartEdit(action)}
                        className={`min-w-[100px] px-2 py-0.5 text-[10px] font-mono rounded text-center transition-colors ${
                          isEditing
                            ? 'bg-blue-600 text-white animate-pulse'
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                        }`}
                      >
                        {isEditing ? '키 입력 대기...' : keyComboToDisplay(binding?.key || '')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 shrink-0">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          >
            기본값 복원
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
