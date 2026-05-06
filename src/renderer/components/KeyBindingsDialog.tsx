import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { AccessibleDialog } from './AccessibleDialog';
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
  const { t } = useTranslation(['app', 'common']);
  const [editingAction, setEditingAction] = useState<KeyAction | null>(null);
  const [localBindings, setLocalBindings] = useState<KeyBinding[]>(bindings);
  const listeningRef = useRef(false);

  useEffect(() => {
    setLocalBindings(bindings);
  }, [bindings]);

  const bindingMap = useMemo(() => new Map(localBindings.map((b) => [b.action, b])), [localBindings]);

  // Detect key conflicts: key → list of actions using that key
  const conflictMap = new Map<string, KeyAction[]>();
  for (const b of localBindings) {
    const key = b.key.toLowerCase();
    if (!conflictMap.has(key)) conflictMap.set(key, []);
    conflictMap.get(key)!.push(b.action);
  }
  const conflictActions = new Set<KeyAction>();
  for (const [, actions] of conflictMap) {
    if (actions.length > 1) actions.forEach((a) => conflictActions.add(a));
  }

  const handleStartEdit = useCallback((action: KeyAction) => {
    setEditingAction(action);
    listeningRef.current = true;
  }, []);

  useEffect(() => {
    if (!editingAction) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();

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
    setEditingAction(null);
    listeningRef.current = false;
    setLocalBindings(DEFAULT_BINDINGS);
  }, []);

  return (
    <AccessibleDialog open={open} onClose={onClose} title={t('dialogs.keyBindings.title')} className="border border-zinc-700 w-[480px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200">{t('dialogs.keyBindings.title')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
          {ACTION_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">{cat.label}</h3>
              <div className="space-y-0.5">
                {cat.actions.map((action) => {
                  const binding = bindingMap.get(action);
                  const isEditing = editingAction === action;
                  const defaultBinding = DEFAULT_BINDINGS.find((b) => b.action === action);
                  const isModified = binding?.key !== defaultBinding?.key;
                  const hasConflict = conflictActions.has(action);

                  return (
                    <div
                      key={action}
                      className={`flex items-center justify-between px-2 py-1.5 rounded ${
                        isEditing ? 'bg-blue-900/30 border border-blue-700/50' : hasConflict ? 'bg-red-900/20' : 'hover:bg-zinc-800/50'
                      }`}
                    >
                      <span className={`text-xs ${hasConflict ? 'text-red-400' : isModified ? 'text-yellow-300' : 'text-zinc-300'}`}>
                        {ACTION_LABELS[action]}
                        {hasConflict && <span className="ml-1 text-xs text-red-500">{t('dialogs.keyBindings.conflictBadge')}</span>}
                      </span>
                      <button
                        onClick={() => handleStartEdit(action)}
                        className={`min-w-[100px] px-2 py-0.5 text-xs font-mono rounded text-center transition-colors ${
                          isEditing
                            ? 'bg-blue-600 text-white animate-pulse'
                            : hasConflict
                              ? 'bg-red-900/50 text-red-300 hover:bg-red-800/50 border border-red-700/50'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                        }`}
                      >
                        {isEditing ? t('dialogs.keyBindings.listening') : keyComboToDisplay(binding?.key || '')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
            >
              {t('dialogs.keyBindings.resetDefaults')}
            </button>
            {conflictActions.size > 0 && (
              <span className="text-xs text-red-400">{t('dialogs.keyBindings.conflictSummary', { count: conflictActions.size })}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
            >
              {t('common:actions.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              {t('dialogs.keyBindings.saveButton')}
            </button>
          </div>
        </div>
    </AccessibleDialog>
  );
}
