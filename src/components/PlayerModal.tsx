import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { formatDurationMMSS, getPlayerDetail } from '../services/firestoreService';
import type { PlayerDetailResponse } from '../types';

interface PlayerModalProps {
  uid: string;
  playerId: string;
  onClose: () => void;
}

export function PlayerModal({ uid, playerId, onClose }: PlayerModalProps) {
  const [data, setData] = useState<PlayerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getPlayerDetail(uid, playerId)
      .then((res) => {
        if (active) {
          setData(res);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '無法讀取球員資料');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [uid, playerId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="球員視窗"
    >
      <div
        className="w-full max-w-2xl bg-white border border-[#E2E8E5] rounded-xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar: Left Name, Center Rating, Right Last Played Time + Close */}
        <div className="px-6 py-5 border-b border-[#E2E8E5] bg-[#FAFBFB] flex items-start justify-between gap-4">
          {loading ? (
            <div className="flex-1 grid grid-cols-3 gap-4 animate-pulse">
              <div className="h-10 bg-slate-200 rounded" />
              <div className="h-10 bg-slate-200 rounded" />
              <div className="h-10 bg-slate-200 rounded" />
            </div>
          ) : data ? (
            <div className="flex-1 grid grid-cols-3 gap-4 items-center">
              {/* Top-Left: Player Name */}
              <div className="min-w-0">
                <div className="text-xs text-slate-500 mb-0.5">球員名稱</div>
                <div className="text-xl font-bold text-slate-900 truncate">
                  {data.player.name}
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  {data.player.wins} 勝 · {data.player.losses} 敗
                </div>
              </div>

              {/* Top-Center: Player Rating (init 2000) */}
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-0.5">球員積分</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                  {data.player.rating}
                </div>
              </div>

              {/* Top-Right: Last Played Time (init 00:00) */}
              <div className="text-right pr-2">
                <div className="text-xs text-slate-500 mb-0.5">最後打球時間</div>
                <div className="text-xl font-semibold font-mono tabular-nums text-slate-800">
                  {data.player.lastPlayedAt}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-rose-600">{error ?? '查無球員資料'}</div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉球員視窗"
            className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom: DB Match History */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">
              歷史打球紀錄（資料庫）
            </h3>
            {data && (
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                共 {data.matches.length} 場
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-14 bg-slate-100 rounded-lg" />
              <div className="h-14 bg-slate-100 rounded-lg" />
            </div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-rose-600">{error}</div>
          ) : data && data.matches.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/60">
              <p className="text-sm text-slate-600">今日尚未有打球紀錄</p>
              <p className="text-xs text-slate-400 mt-1">
                完成場地輪替並計分後，對戰組合、分數與打球時間將自動保存於資料庫。
              </p>
            </div>
          ) : (
            <div className="border border-[#E2E8E5] rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E2E8E5] text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-3.5 whitespace-nowrap">打球時間</th>
                    <th className="py-2.5 px-3.5">打球組合與分數</th>
                    <th className="py-2.5 px-3.5 text-right whitespace-nowrap">積分變動</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8E5] text-sm">
                  {data?.matches.map((match) => {
                    const selfEntry = match.players.find((p) => p.playerId === playerId);
                    const delta = selfEntry?.ratingDelta ?? 0;
                    return (
                      <tr key={match.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3.5 align-top whitespace-nowrap">
                          <div className="font-mono tabular-nums font-semibold text-slate-800">
                            {match.playedAt}
                          </div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            時長 {formatDurationMMSS(match.durationSeconds)}
                            {match.courtName ? ` · ${match.courtName}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 align-top">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            {match.players.map((entry) => {
                              const isSelf = entry.playerId === playerId;
                              return (
                                <div
                                  key={entry.playerId}
                                  className="flex items-center justify-between gap-2 text-xs"
                                >
                                  <span
                                    className={`truncate ${
                                      isSelf
                                        ? 'font-bold text-slate-900'
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    {entry.name}
                                  </span>
                                  <span
                                    className={`font-mono tabular-nums shrink-0 ${
                                      entry.score > 0
                                        ? 'text-emerald-700 font-semibold'
                                        : entry.score < 0
                                          ? 'text-rose-600 font-semibold'
                                          : 'text-slate-500'
                                    }`}
                                  >
                                    {entry.score > 0 ? `+${entry.score}` : entry.score} 分
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 align-top text-right whitespace-nowrap">
                          <span
                            className={`font-mono tabular-nums font-semibold ${
                              delta > 0
                                ? 'text-emerald-700'
                                : delta < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                            }`}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                          {selfEntry && (
                            <div className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                              → {selfEntry.ratingAfter}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
