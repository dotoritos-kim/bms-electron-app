import { useEffect } from 'react';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
import type { CurrentFile } from '../App';
import { useLocalBmsFile } from '../hooks/useLocalBmsFile';

interface EditorProps {
  file: CurrentFile;
  onBack: () => void;
}

export function Editor({ file, onBack }: EditorProps) {
  const { chart, isLoading, error, load } = useLocalBmsFile();

  useEffect(() => {
    load(file.path);
  }, [file.path, load]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-zinc-400">Loading chart for editing...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-red-400">Error: {error}</div>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <button
          onClick={onBack}
          className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            Editing: {chart?.songInfo?.title || file.name}
          </div>
        </div>
        <button
          onClick={async () => {
            // TODO: Serialize chart and save via IPC
            console.log('[Editor] Save not yet implemented');
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-hidden flex items-center justify-center bg-zinc-950">
        {chart ? (
          <div className="text-center text-zinc-600">
            <p className="text-xl mb-2">Chart Editor</p>
            <p className="text-sm">
              NoteChartEditor component will be mounted here.
            </p>
            <p className="text-sm mt-2">
              {chart.keyMode} | {chart.stats.total} notes | BPM {chart.bpm.initial}
            </p>
          </div>
        ) : (
          <div className="text-zinc-600">No chart loaded</div>
        )}
      </div>
    </div>
  );
}
