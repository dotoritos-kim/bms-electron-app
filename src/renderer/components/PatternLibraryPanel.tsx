import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Layers, Trash2, Plus, Save, X, ChevronDown, ChevronRight } from 'lucide-react';
import type { PatternTemplate, PatternCategory } from '../lib/patternTemplates';
import {
  getAllPatterns,
  CATEGORY_LABELS,
  saveNewPattern,
  deleteUserPattern,
} from '../lib/patternTemplates';

interface PatternLibraryPanelProps {
  onApplyPattern: (pattern: PatternTemplate) => void;
  onSaveSelection: () => PatternTemplate | null;
}

function PatternPreview({ pattern }: { pattern: PatternTemplate }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cols = Math.max(pattern.columnCount, 1);
    const beats = Math.max(pattern.beatLength, 0.25);
    const colW = w / cols;
    const beatH = h / beats;

    // Grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * colW, 0);
      ctx.lineTo(c * colW, h);
      ctx.stroke();
    }
    for (let b = 1; b < beats; b++) {
      ctx.beginPath();
      ctx.moveTo(0, h - b * beatH);
      ctx.lineTo(w, h - b * beatH);
      ctx.stroke();
    }

    // Notes (bottom = beat 0)
    for (const note of pattern.notes) {
      const x = note.columnIndex * colW + 1;
      const y = h - (note.beatOffset + 0.125) * beatH;
      const noteW = colW - 2;
      const noteH = Math.max(3, beatH * 0.1);

      if (note.endBeatOffset !== undefined) {
        // LN body
        const endY = h - (note.endBeatOffset + 0.125) * beatH;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
        ctx.fillRect(x, endY, noteW, y - endY);
      }

      ctx.fillStyle = note.noteType === 'playable' ? '#60a5fa' : '#a78bfa';
      ctx.fillRect(x, y - noteH / 2, noteW, noteH);
    }
  }, [pattern]);

  return (
    <canvas
      ref={canvasRef}
      width={60}
      height={48}
      className="rounded bg-zinc-900 border border-zinc-700/50"
    />
  );
}

function SavePatternDialog({
  onSave,
  onClose,
}: {
  onSave: (name: string, category: PatternCategory, tags: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PatternCategory>('custom');
  const [tagStr, setTagStr] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const tags = tagStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSave(name.trim(), category, tags);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-72 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">패턴 저장</h3>
        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="패턴 이름"
            className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PatternCategory)}
            className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
          >
            {(Object.entries(CATEGORY_LABELS) as [PatternCategory, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            value={tagStr}
            onChange={(e) => setTagStr(e.target.value)}
            placeholder="태그 (쉼표 구분)"
            className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800">
              취소
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PatternLibraryPanel({ onApplyPattern, onSaveSelection }: PatternLibraryPanelProps) {
  const [patterns, setPatterns] = useState<PatternTemplate[]>(() => getAllPatterns());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['stairs', 'chord', 'jack']));
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [filter, setFilter] = useState('');

  const refreshPatterns = useCallback(() => {
    setPatterns(getAllPatterns());
  }, []);

  const grouped = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    const filtered = lowerFilter
      ? patterns.filter(
          (p) =>
            p.name.toLowerCase().includes(lowerFilter) ||
            p.tags.some((t) => t.toLowerCase().includes(lowerFilter)),
        )
      : patterns;

    const map = new Map<PatternCategory, PatternTemplate[]>();
    for (const p of filtered) {
      const list = map.get(p.category) || [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, [patterns, filter]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleSaveFromSelection = useCallback(() => {
    const result = onSaveSelection();
    if (!result) return;
    setShowSaveDialog(true);
  }, [onSaveSelection]);

  const handleSavePattern = useCallback(
    (name: string, category: PatternCategory, tags: string[]) => {
      const result = onSaveSelection();
      if (!result) return;
      saveNewPattern({
        name,
        category,
        tags,
        notes: result.notes,
        columnCount: result.columnCount,
        beatLength: result.beatLength,
      });
      refreshPatterns();
      setShowSaveDialog(false);
    },
    [onSaveSelection, refreshPatterns],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteUserPattern(id);
      refreshPatterns();
    },
    [refreshPatterns],
  );

  const categories = Object.keys(CATEGORY_LABELS) as PatternCategory[];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
        <h3 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 mb-1.5">
          <Layers className="h-3 w-3" />
          패턴 라이브러리
        </h3>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="검색..."
          className="w-full px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleSaveFromSelection}
          className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
        >
          <Plus className="h-3 w-3" />
          선택 노트를 패턴으로 저장
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {categories.map((cat) => {
          const items = grouped.get(cat);
          if (!items || items.length === 0) return null;
          const isExpanded = expandedCategories.has(cat);

          return (
            <div key={cat}>
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {CATEGORY_LABELS[cat]}
                <span className="text-zinc-600 ml-auto">{items.length}</span>
              </button>
              {isExpanded && (
                <div className="space-y-0.5 px-1.5 pb-1">
                  {items.map((pattern) => (
                    <div
                      key={pattern.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/60 group cursor-pointer transition-colors"
                      onClick={() => onApplyPattern(pattern)}
                      title={`클릭하여 현재 위치에 적용\n${pattern.notes.length}개 노트, ${pattern.beatLength}비트`}
                    >
                      <PatternPreview pattern={pattern} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-200 truncate">{pattern.name}</div>
                        <div className="text-xs text-zinc-400">
                          {pattern.notes.length}노트 · {pattern.beatLength}비트
                        </div>
                        {pattern.tags.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {pattern.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-xs px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!pattern.isBuiltIn && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(pattern.id);
                          }}
                          className="p-1.5 rounded hover:bg-red-900/50 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          title="삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {grouped.size === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-600 text-center">
            {filter ? '검색 결과 없음' : '패턴 없음'}
          </div>
        )}
      </div>

      {showSaveDialog && (
        <SavePatternDialog
          onSave={handleSavePattern}
          onClose={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
