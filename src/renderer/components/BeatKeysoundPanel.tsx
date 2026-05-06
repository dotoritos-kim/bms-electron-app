import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('editor');
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
          {t('panels.beatKeysound.title')}
        </h3>
        <div className="text-xs text-zinc-600">{t('panels.beatKeysound.empty')}</div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <h3 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 mb-1.5">
        <Headphones className="h-3 w-3" />
        <span title={t('panels.beatKeysound.tooltip')}>{t('panels.beatKeysound.title')}</span>
      </h3>
      <div className="space-y-1">
        {nearbyNotes.map((group) => {
          const isCurrent = Math.abs(group.beat - currentBeat) < BEAT_RANGE;
          const measure = Math.floor(group.beat / 4);
          const frac = ((group.beat % 4) / 4).toFixed(2);
          return (
            <div
              key={group.beat.toFixed(4)}
              className={`rounded px-2 py-1 text-xs ${
                isCurrent ? 'bg-blue-900/40 border border-blue-700/50' : 'bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-mono text-zinc-500">#{String(measure).padStart(3, '0')}:{frac}</span>
                <span className="font-mono text-zinc-600">({group.beat.toFixed(2)})</span>
                {isCurrent && <span className="text-blue-400 text-xs">{t('panels.beatKeysound.current')}</span>}
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

/** BGM channel grouping + bulk operations UI */
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
  const { t } = useTranslation('editor');
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
        {t('panels.bgmManager.title', { count: channelGroups.reduce((s, [, g]) => s + g.count, 0) })}
        <span className="text-zinc-600 ml-auto">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="space-y-1.5">
          {channelGroups.map(([ch, group]) => (
            <div key={ch} className="bg-zinc-800/50 rounded px-2 py-1 text-xs">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-semibold text-zinc-300">CH {ch}</span>
                <span className="text-zinc-600">({t('panels.bgmManager.channelStats', { notes: group.count, keysounds: group.keysounds.size })})</span>
                <span className="ml-auto flex gap-0.5">
                  {onToggleSolo && (
                    <button
                      onClick={() => onToggleSolo(ch)}
                      className={`px-1 rounded font-bold ${bgmSoloChannel === ch ? 'bg-yellow-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      title={bgmSoloChannel === ch ? t('panels.bgmManager.soloOff') : t('panels.bgmManager.soloOn')}
                    >S</button>
                  )}
                  {onToggleMute && (
                    <button
                      onClick={() => onToggleMute(ch)}
                      className={`px-1 rounded font-bold ${bgmMutedChannels?.has(ch) ? 'bg-red-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      title={bgmMutedChannels?.has(ch) ? t('panels.bgmManager.muteOff') : t('panels.bgmManager.muteOn')}
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
                    title={`${ks}: ${wavDefinitions.get(ks) || '?'} (${ids.length})\n${t('panels.bgmManager.clickToSelect')}`}
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
