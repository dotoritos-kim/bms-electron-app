import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plug, Unplug, Keyboard } from 'lucide-react';
import type { MidiDevice, MidiMapping, MidiRecordingMode, MidiNoteEvent } from '../lib/midiInput';
import {
  requestMidiAccess,
  getMidiInputDevices,
  connectMidiInput,
  disconnectMidiInput,
  isConnected,
  createDefaultMapping,
  createIidxMapping,
  createKeyboardMapping,
  saveMidiMapping,
  loadMidiMapping,
} from '../lib/midiInput';

interface MidiMappingDialogProps {
  open: boolean;
  onClose: () => void;
  laneIds: string[];
  mapping: MidiMapping;
  onMappingChange: (mapping: MidiMapping) => void;
  recordingMode: MidiRecordingMode;
  onRecordingModeChange: (mode: MidiRecordingMode) => void;
  /** Forwarded to Editor for step/realtime note input */
  onMidiNote?: (event: MidiNoteEvent) => void;
}

function midiNoteName(note: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  return `${names[note % 12]}${octave}`;
}

export function MidiMappingDialog({
  open,
  onClose,
  laneIds,
  mapping,
  onMappingChange,
  recordingMode,
  onRecordingModeChange,
  onMidiNote,
}: MidiMappingDialogProps) {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [connected, setConnected] = useState(isConnected());
  const [learnLane, setLearnLane] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<number | null>(null);
  const learnCallbackRef = useRef<((event: MidiNoteEvent) => void) | null>(null);
  const onMidiNoteRef = useRef(onMidiNote);
  onMidiNoteRef.current = onMidiNote;
  const mappingRef = useRef(mapping);
  mappingRef.current = mapping;

  useEffect(() => {
    if (!open) return;
    requestMidiAccess().then(() => {
      setDevices(getMidiInputDevices());
    }).catch(() => {
      setDevices([]);
    });
  }, [open]);

  const handleConnect = useCallback(() => {
    if (!selectedDevice) return;
    const onNote = (event: MidiNoteEvent) => {
      setLastNote(event.note);
      learnCallbackRef.current?.(event);
      // Forward to Editor for step/realtime recording
      onMidiNoteRef.current?.(event);
    };
    const ok = connectMidiInput(selectedDevice, onNote);
    setConnected(ok);
  }, [selectedDevice]);

  const handleDisconnect = useCallback(() => {
    disconnectMidiInput();
    setConnected(false);
  }, []);

  const handleLearn = useCallback((lane: string) => {
    setLearnLane(lane);
    learnCallbackRef.current = (event: MidiNoteEvent) => {
      const currentMapping = mappingRef.current;
      const newMap = new Map(currentMapping.noteToLane);
      // Remove old mapping for this lane
      for (const [k, v] of newMap) {
        if (v === lane) newMap.delete(k);
      }
      newMap.set(event.note, lane);
      const newMapping = { ...currentMapping, noteToLane: newMap, presetName: 'Custom' };
      onMappingChange(newMapping);
      saveMidiMapping(newMapping);
      setLearnLane(null);
      learnCallbackRef.current = null;
    };
  }, [onMappingChange]);

  const handlePreset = useCallback((preset: 'default' | 'iidx' | 'keyboard') => {
    let m: MidiMapping;
    switch (preset) {
      case 'iidx': m = createIidxMapping(laneIds); break;
      case 'keyboard': m = createKeyboardMapping(laneIds); break;
      default: m = createDefaultMapping(laneIds); break;
    }
    onMappingChange(m);
    saveMidiMapping(m);
  }, [laneIds, onMappingChange]);

  if (!open) return null;

  const laneMappings = laneIds.map((lane) => {
    let mappedNote: number | null = null;
    for (const [note, l] of mapping.noteToLane) {
      if (l === lane) { mappedNote = note; break; }
    }
    return { lane, mappedNote };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-[420px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            MIDI 설정
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-4">
          {/* Device selection */}
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">장치</h3>
            <div className="flex gap-2">
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">장치 선택...</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {connected ? (
                <button onClick={handleDisconnect} className="px-3 py-1.5 text-xs bg-red-600/80 hover:bg-red-600 text-white rounded flex items-center gap-1">
                  <Unplug className="h-3 w-3" />
                  해제
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={!selectedDevice}
                  className="px-3 py-1.5 text-xs bg-green-600/80 hover:bg-green-600 disabled:opacity-40 text-white rounded flex items-center gap-1"
                >
                  <Plug className="h-3 w-3" />
                  연결
                </button>
              )}
            </div>
            {devices.length === 0 && (
              <div className="text-[10px] text-zinc-600 mt-1">MIDI 장치가 감지되지 않습니다</div>
            )}
            {lastNote !== null && (
              <div className="text-[10px] text-zinc-500 mt-1">
                마지막 입력: <span className="text-blue-400 font-mono">{midiNoteName(lastNote)} ({lastNote})</span>
              </div>
            )}
          </div>

          {/* Recording mode */}
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">레코딩 모드</h3>
            <div className="flex gap-1.5">
              {(['off', 'step', 'realtime'] as MidiRecordingMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onRecordingModeChange(mode)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                    recordingMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {mode === 'off' ? '끄기' : mode === 'step' ? '스텝' : '실시간'}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-zinc-600 mt-1">
              {recordingMode === 'step' && '스텝: MIDI 입력 → 현재 위치에 노트 배치 후 자동 전진'}
              {recordingMode === 'realtime' && '실시간: 재생 중 MIDI 입력 → 재생 위치에 배치'}
              {recordingMode === 'off' && 'MIDI 레코딩 비활성화'}
            </div>
          </div>

          {/* Presets */}
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              프리셋 <span className="text-zinc-600 font-normal normal-case">({mapping.presetName})</span>
            </h3>
            <div className="flex gap-1.5">
              <button onClick={() => handlePreset('default')} className="flex-1 px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">Default</button>
              <button onClick={() => handlePreset('iidx')} className="flex-1 px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">IIDX</button>
              <button onClick={() => handlePreset('keyboard')} className="flex-1 px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">Piano</button>
            </div>
          </div>

          {/* Lane mapping */}
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">레인 매핑</h3>
            <div className="space-y-0.5">
              {laneMappings.map(({ lane, mappedNote }) => (
                <div
                  key={lane}
                  className={`flex items-center justify-between px-2 py-1.5 rounded ${
                    learnLane === lane ? 'bg-blue-900/30 border border-blue-700/50' : 'hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="text-xs text-zinc-300 font-mono w-12">{lane}</span>
                  <span className="text-[10px] text-zinc-500 flex-1 text-center">
                    {mappedNote !== null ? (
                      <span className="text-zinc-300">{midiNoteName(mappedNote)} ({mappedNote})</span>
                    ) : (
                      '미설정'
                    )}
                  </span>
                  <button
                    onClick={() => handleLearn(lane)}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      learnLane === lane
                        ? 'bg-blue-600 text-white animate-pulse'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {learnLane === lane ? '대기중...' : 'Learn'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-zinc-800 shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded transition-colors">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
