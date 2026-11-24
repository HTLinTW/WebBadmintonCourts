import React, { useRef, useState } from 'react';
import { UserPlus, LayoutGrid, Sparkles, RotateCcw, X } from 'lucide-react';
import { formatDurationMMSS } from '../services/firestoreService';

interface RightControlBarProps {
  courtCount: number;
  autoArrange: boolean;
  nextAutoArrangeAt: number | null;
  nowMs: number;
  onAddPlayers: (nameInput: string) => Promise<{ added: string[]; duplicates: string[] }>;
  onChangeCourtCount: (count: number) => Promise<void>;
  onToggleAutoArrange: () => Promise<void>;
  onResetAll: () => Promise<void>;
}

type ActiveDialog = 'addPlayer' | 'courtCount' | 'reset' | null;

export function RightControlBar({
  courtCount,
  autoArrange,
  nextAutoArrangeAt,
  nowMs,
  onAddPlayers,
  onChangeCourtCount,
  onToggleAutoArrange,
  onResetAll,
}: RightControlBarProps) {
  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [courtCountInput, setCourtCountInput] = useState(String(courtCount));
  const [busy, setBusy] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addPlayerInputRef = useRef<HTMLTextAreaElement | null>(null);

  const countdownSec =
    autoArrange && nextAutoArrangeAt
      ? Math.max(0, Math.ceil((nextAutoArrangeAt - nowMs) / 1000))
      : null;

  const openAddPlayer = () => {
    setPlayerNameInput('');
    setError(null);
    setDialog('addPlayer');
  };

  const openCourtCount = () => {
    setCourtCountInput(String(courtCount));
    setError(null);
    setDialog('courtCount');
  };

  const openReset = () => {
    setError(null);
    setDialog('reset');
  };

  const handleAddPlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerNameInput.trim()) {
      setError('請輸入球員名稱');
      addPlayerInputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAddPlayers(playerNameInput);
      setPlayerNameInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增球員失敗');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        addPlayerInputRef.current?.focus();
      });
    }
  };

  const handleCourtCountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(courtCountInput.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24) {
      setError('請輸入 1 至 24 之間的整數');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onChangeCourtCount(parsed);
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更改場地數量失敗');
    } finally {
      setBusy(false);
    }
  };

  const handleAutoClick = async () => {
    if (togglingAuto) return;
    setTogglingAuto(true);
    try {
      await onToggleAutoArrange();
    } finally {
      setTogglingAuto(false);
    }
  };

  const handleConfirmReset = async () => {
    setBusy(true);
    setError(null);
    try {
      await onResetAll();
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '全部重製失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <aside
        aria-label="右側操作按鍵"
        className="w-full lg:w-44 shrink-0 border-t lg:border-t-0 lg:border-l border-[#E2E8E5] bg-white p-4"
      >
        <div className="lg:sticky lg:top-20 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-2.5">
          {/* Button 1: Add Player */}
          <button
            type="button"
            onClick={openAddPlayer}
            className="h-12 px-3 rounded-lg border border-[#E2E8E5] bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-800 text-xs font-semibold flex items-center justify-center lg:justify-start gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>新增球員</span>
          </button>

          {/* Button 2: Change Court Count */}
          <button
            type="button"
            onClick={openCourtCount}
            className="h-12 px-3 rounded-lg border border-[#E2E8E5] bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-800 text-xs font-semibold flex items-center justify-center lg:justify-start gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <LayoutGrid className="w-4 h-4 text-slate-600 shrink-0" />
            <span>更改場地數量</span>
          </button>

          {/* Button 3: Auto-Arrange Toggle (Yellow when active) */}
          <button
            type="button"
            onClick={handleAutoClick}
            disabled={togglingAuto}
            aria-pressed={autoArrange}
            className={`min-h-12 py-2 px-3 rounded-lg border text-xs font-semibold flex flex-col items-center lg:items-start justify-center transition-colors shrink-0 ${
              autoArrange
                ? 'bg-amber-400 hover:bg-amber-300 border-amber-500 text-slate-950'
                : 'bg-white hover:bg-slate-50 border-[#E2E8E5] hover:border-slate-300 text-slate-800'
            }`}
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Sparkles
                className={`w-4 h-4 shrink-0 ${
                  autoArrange ? 'text-slate-950' : 'text-slate-600'
                }`}
              />
              <span>{autoArrange ? '自動排列中' : '自動排列'}</span>
            </span>
            {autoArrange && countdownSec !== null && (
              <span className="mt-0.5 lg:pl-6 text-[11px] font-mono tabular-nums text-slate-900/80 whitespace-nowrap">
                下次 {formatDurationMMSS(countdownSec)}
              </span>
            )}
          </button>

          {/* Button 4: Reset All */}
          <button
            type="button"
            onClick={openReset}
            className="h-12 px-3 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-rose-700 text-xs font-semibold flex items-center justify-center lg:justify-start gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>全部重製</span>
          </button>
        </div>
      </aside>

      {/* Dialog 1: Add Player */}
      {dialog === 'addPlayer' && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
          onClick={() => !busy && setDialog(null)}
          role="dialog"
          aria-modal="true"
          aria-label="新增球員"
        >
          <div
            className="w-full max-w-md bg-white border border-[#E2E8E5] rounded-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">手動輸入球員名稱</h3>
              <button
                type="button"
                onClick={() => setDialog(null)}
                aria-label="關閉"
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddPlayerSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="add-player-name"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  球員名稱（可用逗號或換行一次新增多位，初始積分 2000）
                </label>
                <textarea
                  ref={addPlayerInputRef}
                  id="add-player-name"
                  rows={3}
                  value={playerNameInput}
                  onChange={(e) => {
                    setPlayerNameInput(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !playerNameInput.includes('\n')) {
                      e.preventDefault();
                      void handleAddPlayerSubmit(e);
                    }
                  }}
                  placeholder="輸入球員名稱，例如：小明"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 resize-none"
                  autoFocus
                />
              </div>

              {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 px-5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap"
                >
                  {busy ? '新增中…' : '加入未排列名單'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog 2: Change Court Count */}
      {dialog === 'courtCount' && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
          onClick={() => !busy && setDialog(null)}
          role="dialog"
          aria-modal="true"
          aria-label="更改場地數量"
        >
          <div
            className="w-full max-w-sm bg-white border border-[#E2E8E5] rounded-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">更改場地數量</h3>
              <button
                type="button"
                onClick={() => setDialog(null)}
                aria-label="關閉"
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCourtCountSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-court-count"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  輸入新的場地數量（1 – 24）
                </label>
                <input
                  id="edit-court-count"
                  type="number"
                  min={1}
                  max={24}
                  value={courtCountInput}
                  onChange={(e) => {
                    setCourtCountInput(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-300 font-mono tabular-nums text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  若減少場地，被移除場地上的球員將自動移回未排列名單。
                </p>
              </div>

              {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap"
                >
                  {busy ? '更新中…' : '確認修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog 3: Reset All Confirmation */}
      {dialog === 'reset' && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
          onClick={() => !busy && setDialog(null)}
          role="dialog"
          aria-modal="true"
          aria-label="確認全部重製"
        >
          <div
            className="w-full max-w-sm bg-white border border-[#E2E8E5] rounded-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900 mb-2">確認要全部重製嗎？</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              此操作將清除所有球員資料、積分、今日打球紀錄與場地數量設定，並返回初始場地數量輸入畫面。
            </p>

            {error && <p className="text-xs font-medium text-rose-600 mb-3">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={busy}
                className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={busy}
                className="h-10 px-5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap"
              >
                {busy ? '重製中…' : '確認全部重製'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
