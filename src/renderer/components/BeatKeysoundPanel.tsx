import { useMemo, useState } from 'react';
import { Music, Headphones, Layers, ArrowRight, Trash2 } from 'lucide-react';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

interface BeatKeysoundPanelProps {
  notes: EditableBMSNote[];
  currentBeat: number;
  wavDefinitions: Map<string, string>;
  onPreview?: (id: string) => void;
  isAudioReady?: boolean;
  /** BGM 매니저 모드: 채널별 그룹핑 + 일괄 작업 */
  showBgmManager?: boolean;
  /** BGM 노트 선택 콜백 */
  onSelectBgmNotes?: (noteIds: string[]) => void;
  /** BGM 노트 삭제 콜백 */
  onDeleteNotes?: (noteIds: string[]) => void;
  /** BGM 채널 변경 콜백 */
  onChangeBgmChannel?: (noteIds: string[], newChannel: number) => void;
  /** 솔로 채널 (null = 솔로 없음) */
  bgmSoloChannel?: number | null;
  /** 뮤트된 채널 집합 */
  bgmMutedChannels?: Set<number>;
  /** 솔로 토글 */
  onToggleSolo?: (channel: number) => void;
  /** 뮤트 토글 */
  onToggleMute?: (channel: number) => void;
}

export function BeatKeysoundPanel({
  notes,
  currentBeat,
  wavDefinitions,
  onPreview,
  isAudioReady,
  showBgmManager,
  onSelectBgmNotes,
  onDeleteNotes,
  onChangeBgmChannel,
  bgmSoloChannel,
  bgmMutedChannels,
  onToggleSolo,
  onToggleMute,
}: BeatKeysoundPanelProps) {
  const BEAT_RANGE = 0.125;
  const nearbyNotes = useMemo(() => {
    const grouped = new Map<string, { beat: number; playable: EditableBMSNote[]; bgm: EditableBMSNote[] }>();
    for (const n of notes) {
      if (n.keysound === '00') continue;
      if (Math.abs(n.beat - currentBeat) > 8) continue;
      const beatKey = n.beat.toFixed(4);
      let entry = grouped.get(beatKey);
      if (!entry) {
        entry = { beat: n.beat, playable: [], bgm: [] };
        grouped.set(beatKey, entry);
      }
      if (n.noteType === 'bgm') entry.bgm.push(n);
      else entry.playable.push(n);
    }
    return Array.from(grouped.values())
      .sort((a, b) => a.beat - b.beat)
      .filter((g) => g.beat >= currentBeat - 2 && g.beat <= currentBeat + 8);
  }, [notes, currentBeat]);

  if (nearbyNotes.length === 0) {
    return (
      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 mb-1">
          <Headphones className="h-3 w-3" />
          키음 타임라인
        </h3>
        <div className="text-[10px] text-zinc-600">현재 위치 근처에 키음 없음</div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <h3 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 mb-1.5">
        <Headphones className="h-3 w-3" />
        <span title="현재 위치 근처의 키음을 시간순으로 표시합니다. 클릭하면 해당 키음을 선택합니다.">키음 타임라인</span>
      </h3>
      <div className="space-y-1">
        {nearbyNotes.map((group) => {
          const isCurrent = Math.abs(group.beat - currentBeat) < BEAT_RANGE;
          const measure = Math.floor(group.beat / 4);
          const frac = ((group.beat % 4) / 4).toFixed(2);
          return (
            <div
              key={group.beat.toFixed(4)}
              className={`rounded px-2 py-1 text-[10px] ${
                isCurrent ? 'bg-blue-900/40 border border-blue-700/50' : 'bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-mono text-zinc-500">#{String(measure).padStart(3, '0')}:{frac}</span>
                <span className="font-mono text-zinc-600">({group.beat.toFixed(2)})</span>
                {isCurrent && <span className="text-blue-400 text-[9px]">◀ 현재</span>}
              </div>
              {group.playable.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {group.playable.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => isAudioReady && onPreview?.(n.keysound)}
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-green-900/40 text-green-300 hover:bg-green-800/50 transition-colors"
                      title={`${n.column || 'P'} — ${n.keysound}: ${wavDefinitions.get(n.keysound) || '?'}`}
                    >
                      <Music className="h-2.5 w-2.5" />
                      <span className="font-mono">{n.keysound}</span>
                      {n.column && <span className="text-green-500">({n.column})</span>}
                    </button>
                  ))}
                </div>
              )}
              {group.bgm.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {group.bgm.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => isAudioReady && onPreview?.(n.keysound)}
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-purple-900/40 text-purple-300 hover:bg-purple-800/50 transition-colors"
                      title={`BGM — ${n.keysound}: ${wavDefinitions.get(n.keysound) || '?'}`}
                    >
                      <Headphones className="h-2.5 w-2.5" />
                      <span className="font-mono">{n.keysound}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* BGM 매니저 */}
      {showBgmManager && <BgmManagerSection notes={notes} wavDefinitions={wavDefinitions} onSelectBgmNotes={onSelectBgmNotes} onDeleteNotes={onDeleteNotes} onChangeBgmChannel={onChangeBgmChannel} bgmSoloChannel={bgmSoloChannel} bgmMutedChannels={bgmMutedChannels} onToggleSolo={onToggleSolo} onToggleMute={onToggleMute} />}
    </div>
  );
}

/** BGM 채널별 그룹핑 + 일괄 작업 UI */
function BgmManagerSection({
  notes,
  wavDefinitions,
  onSelectBgmNotes,
  onDeleteNotes,
  onChangeBgmChannel,
  bgmSoloChannel,
  bgmMutedChannels,
  onToggleSolo,
  onToggleMute,
}: {
  notes: EditableBMSNote[];
  wavDefinitions: Map<string, string>;
  onSelectBgmNotes?: (noteIds: string[]) => void;
  onDeleteNotes?: (noteIds: string[]) => void;
  onChangeBgmChannel?: (noteIds: string[], newChannel: number) => void;
  bgmSoloChannel?: number | null;
  bgmMutedChannels?: Set<number>;
  onToggleSolo?: (channel: number) => void;
  onToggleMute?: (channel: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const channelGroups = useMemo(() => {
    const groups = new Map<number, { keysounds: Map<string, string[]>; count: number }>();
    for (const n of notes) {
      if (n.noteType !== 'bgm') continue;
      const ch = n.bgmChannel ?? 0;
      let group = groups.get(ch);
      if (!group) {
        group = { keysounds: new Map(), count: 0 };
        groups.set(ch, group);
      }
      group.count++;
      const ids = group.keysounds.get(n.keysound);
      if (ids) ids.push(n.id);
      else group.keysounds.set(n.keysound, [n.id]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [notes]);

  if (channelGroups.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-zinc-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 mb-1 w-full"
      >
        <Layers className="h-3 w-3" />
        BGM 매니저 ({channelGroups.reduce((s, [, g]) => s + g.count, 0)}개)
        <span className="text-zinc-600 ml-auto">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="space-y-1.5">
          {channelGroups.map(([ch, group]) => (
            <div key={ch} className="bg-zinc-800/50 rounded px-2 py-1 text-[10px]">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-semibold text-zinc-300">CH {ch}</span>
                <span className="text-zinc-600">({group.count}개 노트, {group.keysounds.size}종 키음)</span>
                <span className="ml-auto flex gap-0.5">
                  {onToggleSolo && (
                    <button
                      onClick={() => onToggleSolo(ch)}
                      className={`px-1 rounded font-bold ${bgmSoloChannel === ch ? 'bg-yellow-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      title={bgmSoloChannel === ch ? '솔로 해제' : '이 채널만 솔로'}
                    >S</button>
                  )}
                  {onToggleMute && (
                    <button
                      onClick={() => onToggleMute(ch)}
                      className={`px-1 rounded font-bold ${bgmMutedChannels?.has(ch) ? 'bg-red-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      title={bgmMutedChannels?.has(ch) ? '뮤트 해제' : '이 채널 뮤트'}
                    >M</button>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from(group.keysounds.entries()).map(([ks, ids]) => (
                  <button
                    key={ks}
                    onClick={() => onSelectBgmNotes?.(ids)}
                    className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-purple-900/30 text-purple-300 hover:bg-purple-800/40 transition-colors"
                    title={`${ks}: ${wavDefinitions.get(ks) || '?'} (${ids.length}개)\n클릭: 선택`}
                  >
                    <span className="font-mono">{ks}</span>
                    <span className="text-purple-500">×{ids.length}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
