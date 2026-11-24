import React, { useEffect, useState } from 'react';
import { X, Check, Clock, ArrowRight, UserMinus } from 'lucide-react';
import { formatDurationMMSS } from '../services/firestoreService';
import type { Court, QueueGroup } from '../types';

interface CourtModalProps {
  court: Court;
  topQueueGroups: QueueGroup[]; // up to first 3 arranged groups
  nowMs: number;
  onClose: () => void;
  onSaveCourtName: (courtId: string, name: string) => Promise<void>;
  onAssignGroup: (courtId: string, queueGroupId: string, scores: string[]) => Promise<void>;
  onClearCourt: (courtId: string, scores: string[]) => Promise<void>;
  onSelectPlayer: (playerId: string) => void;
}

function isValidNumberInput(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  const num = Number(trimmed);
  return Number.isFinite(num);
}

function isScoreTwentyOne(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && Number(trimmed) === 21;
}

export function CourtModal({
  court,
  topQueueGroups,
  nowMs,
  onClose,
  onSaveCourtName,
  onAssignGroup,
  onClearCourt,
  onSelectPlayer,
}: CourtModalProps) {
  const [courtNameInput, setCourtNameInput] = useState(court.name);
  const [scores, setScores] = useState<string[]>(['0', '0', '0', '0']);
  const [savingName, setSavingName] = useState(false);
  const [nameSavedFeedback, setNameSavedFeedback] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [clearingCourt, setClearingCourt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCourtNameInput(court.name);
  }, [court.id, court.name]);

  useEffect(() => {
    setScores(['0', '0', '0', '0']);
  }, [court.id, court.startedAt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const elapsedSeconds =
    court.players.length > 0 && court.startedAt
      ? Math.max(0, Math.floor((nowMs - court.startedAt) / 1000))
      : 0;

  const isBusyAction = assigningId !== null || clearingCourt;

  const normalizeScoresForSubmit = (): string[] => {
    const normalized = [0, 1, 2, 3].map((idx) => {
      const val = scores[idx] ?? '0';
      return isValidNumberInput(val) ? val.trim() : '0';
    });
    setScores(normalized);
    return normalized;
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    setError(null);
    try {
      await onSaveCourtName(court.id, courtNameInput);
      setNameSavedFeedback(true);
      setTimeout(() => setNameSavedFeedback(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改場地名稱失敗');
    } finally {
      setSavingName(false);
    }
  };

  const handleSetWinScore = (idx: number) => {
    setScores((prev) => {
      const next = [...prev];
      next[idx] = '21';
      return next;
    });
  };

  const handleScoreInputChange = (idx: number, newValue: string) => {
    setScores((prev) => {
      const next = [...prev];
      const indicesOf21 = [0, 1, 2, 3].filter((i) => isScoreTwentyOne(prev[i] ?? ''));
      const otherIndices = [0, 1, 2, 3].filter((i) => !isScoreTwentyOne(prev[i] ?? ''));

      // If exactly 2 inputs are 21 and the user modifies either of the other 2 inputs, sync both non-21 inputs
      if (indicesOf21.length === 2 && otherIndices.includes(idx)) {
        for (const otherIdx of otherIndices) {
          next[otherIdx] = newValue;
        }
      } else {
        next[idx] = newValue;
      }

      return next;
    });
  };

  const handleClickQueueGroup = async (group: QueueGroup) => {
    if (isBusyAction) return;
    setError(null);

    const normalizedScores = normalizeScoresForSubmit();

    setAssigningId(group.id);
    try {
      await onAssignGroup(court.id, group.id, normalizedScores);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上場更新失敗');
    } finally {
      setAssigningId(null);
    }
  };

  const handleClearCourt = async () => {
    if (isBusyAction) return;
    setError(null);

    const normalizedScores = normalizeScoresForSubmit();

    setClearingCourt(true);
    try {
      await onClearCourt(court.id, normalizedScores);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空場地失敗');
    } finally {
      setClearingCourt(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-900/45 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="場地視窗"
    >
      <div
        className="w-full max-w-2xl bg-white border border-[#E2E8E5] rounded-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Section: Court name input + 修改場地名稱 button + Close X + Play Time */}
        <div className="px-6 py-5 border-b border-[#E2E8E5] bg-[#FAFBFB]">
          <div className="flex items-start justify-between gap-3">
            <form onSubmit={handleSaveName} className="flex-1 flex items-center gap-2.5">
              <input
                type="text"
                value={courtNameInput}
                onChange={(e) => setCourtNameInput(e.target.value)}
                placeholder="輸入場地名稱（例如：第 1 場地）"
                aria-label="場地名稱"
                className="flex-1 h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={savingName}
                className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {nameSavedFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>已更新</span>
                  </>
                ) : (
                  <span>修改場地名稱</span>
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={onClose}
              aria-label="關閉場地視窗"
              className="w-10 h-10 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>打球時間</span>
            <span className="font-mono tabular-nums font-bold text-slate-900 text-base">
              {formatDurationMMSS(elapsedSeconds)}
            </span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Middle Section: 4 On-Court Players + 勝 Button + Numeric Score Boxes (default 0) */}
          <section>
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-900">目前上場球員</h3>
              <span className="text-xs text-slate-500">
                點擊名稱查看資料 · 點擊「勝」填入 21，任兩格為 21 時另兩格同步修改
              </span>
            </div>

            {court.players.length === 0 ? (
              <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/60">
                <p className="text-sm font-medium text-slate-600">目前場地無上場球員</p>
                <p className="text-xs text-slate-400 mt-1">
                  請點選下方排列組合安排球員上場並開始計時。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {court.players.map((player, idx) => {
                  const isWin = isScoreTwentyOne(scores[idx] ?? '');
                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-[#E2E8E5] bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(player.id)}
                        className="min-w-0 flex-1 text-left group"
                      >
                        <div className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 group-hover:underline truncate transition-colors">
                          {player.name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          積分 {player.rating}
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSetWinScore(idx)}
                          aria-label={`設定 ${player.name} 為勝（21 分）`}
                          className={`h-9 px-2.5 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            isWin
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          勝
                        </button>

                        <input
                          type="text"
                          inputMode="decimal"
                          value={scores[idx] ?? '0'}
                          onChange={(e) => handleScoreInputChange(idx, e.target.value)}
                          aria-label={`${player.name} 分數`}
                          className="w-18 h-9 px-2.5 rounded-md border border-slate-300 bg-[#FAFBFB] text-right font-mono tabular-nums text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Bottom Section: First 3 Arranged Queue Groups + Top-Right 無人上場 Button */}
          <section className="pt-4 border-t border-[#E2E8E5]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                點選下一場上場組合（前 3 順位）
              </h3>

              <button
                type="button"
                disabled={isBusyAction}
                onClick={handleClearCourt}
                className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 disabled:opacity-60 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <UserMinus className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>{clearingCourt ? '處理中…' : '無人上場'}</span>
              </button>
            </div>

            {topQueueGroups.length === 0 ? (
              <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/60">
                <p className="text-sm text-slate-600">目前沒有已排列的等待組合</p>
                <p className="text-xs text-slate-400 mt-1">
                  請於主畫面左下勾選 4 位球員按下「排隊」，或開啟右側「自動排列」。
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {topQueueGroups.map((group) => {
                  const isBusy = assigningId === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      disabled={isBusyAction}
                      onClick={() => handleClickQueueGroup(group)}
                      className="w-full text-left px-4 py-3.5 rounded-lg border border-[#E2E8E5] bg-white hover:border-emerald-600 hover:bg-emerald-50/40 disabled:opacity-60 transition-colors flex items-center gap-4 group"
                    >
                      <div className="w-8 h-8 rounded-md bg-slate-100 group-hover:bg-emerald-700 group-hover:text-white text-slate-700 font-mono tabular-nums text-sm font-bold flex items-center justify-center shrink-0 transition-colors">
                        {group.position}
                      </div>

                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                        {group.players.map((p) => (
                          <div key={p.id} className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {p.name}
                            </div>
                            <div className="text-xs font-mono tabular-nums text-slate-500">
                              {p.rating}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="shrink-0 text-xs font-semibold text-emerald-700 flex items-center gap-1 whitespace-nowrap">
                        <span>{isBusy ? '安排中…' : '上場'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
