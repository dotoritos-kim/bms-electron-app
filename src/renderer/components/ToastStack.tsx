import { useState, useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  createdAt: number;
}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div role="status" aria-live="polite" aria-atomic="false" className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-medium shadow-lg animate-[slideIn_0.2s_ease-out] ${
            t.type === 'success' ? 'bg-green-900/90 text-green-200 border border-green-700/50' :
            t.type === 'error' ? 'bg-red-900/90 text-red-200 border border-red-700/50' :
            t.type === 'warning' ? 'bg-yellow-900/90 text-yellow-200 border border-yellow-700/50' :
            'bg-zinc-800/90 text-zinc-200 border border-zinc-700/50'
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            aria-label="알림 닫기"
            className="p-1.5 rounded hover:bg-white/10 shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Hook to manage toast stack with auto-dismiss */
export function useToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const show = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = nextId.current++;
    const duration = type === 'error' ? 5000 : type === 'warning' ? 4000 : 2500;
    setToasts((prev) => [...prev.slice(-4), { id, message, type, createdAt: Date.now() }]); // max 5 visible
    const timer = setTimeout(() => dismiss(id), duration);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
    };
  }, []);

  return { toasts, show, dismiss };
}
