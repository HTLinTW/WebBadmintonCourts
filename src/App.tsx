import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Trash2, Info, Users, LogOut } from 'lucide-react';
import { auth } from './firebase';
import {
  addPlayers,
  assignCourtGroup,
  clearCourt,
  createManualGroup,
  formatDurationMMSS,
  removeQueueGroup,
  resetAll,
  runAutoArrangeOnce,
  setupCourts,
  subscribeToSessionState,
  toggleAutoArrange,
  togglePlayerPause,
  updateCourtCount,
  updateCourtName,
} from './services/firestoreService';
import { AuthGate } from './components/AuthGate';
import { SetupScreen } from './components/SetupScreen';
import { CourtModal } from './components/CourtModal';
import { PlayerModal } from './components/PlayerModal';
import { RightControlBar } from './components/RightControlBar';
import type { AppState } from './types';

interface ToastState {
  message: string;
  tone: 'neutral' | 'error';
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [appState, setAppState] = useState<AppState | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const [syncStalled, setSyncStalled] = useState(false);

  // Live 1-second clock for court timers and auto-arrange countdown
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Selection state for bottom-left waiting players
  const [selectedWaitingIds, setSelectedWaitingIds] = useState<string[]>([]);
  const [submittingManualQueue, setSubmittingManualQueue] = useState(false);
  const [removingGroupId, setRemovingGroupId] = useState<string | null>(null);
  const [togglingPauseId, setTogglingPauseId] = useState<string | null>(null);

  // Active modals
  const [activeCourtId, setActiveCourtId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  // Transient feedback toast
  const [toast, setToast] = useState<ToastState | null>(null);

  const autoArrangeRunningRef = useRef(false);
  const latestStateRef = useRef<AppState | null>(null);
  latestStateRef.current = appState;

  const showToast = useCallback((message: string, tone: 'neutral' | 'error' = 'neutral') => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setAppState(null);
        setActiveCourtId(null);
        setActivePlayerId(null);
        setSelectedWaitingIds([]);
      }
    });
    return () => unsub();
  }, []);

  const activeUid = user?.uid ?? null;

  // Attach real-time Firestore listeners only once authenticated
  useEffect(() => {
    if (!authReady || !activeUid) return;
    setFatalError(null);
    setSyncStalled(false);

    const stallTimer = setTimeout(() => {
      setSyncStalled(true);
    }, 8000);

    const unsub = subscribeToSessionState(
      activeUid,
      (nextState) => {
        clearTimeout(stallTimer);
        setSyncStalled(false);
        setAppState(nextState);
        const waitingSet = new Set(nextState.waitingPlayers.map((p) => p.id));
        setSelectedWaitingIds((prev) => prev.filter((id) => waitingSet.has(id)));
      },
      (err) => {
        clearTimeout(stallTimer);
        setFatalError(err);
      },
    );

    return () => {
      clearTimeout(stallTimer);
      unsub();
    };
  }, [authReady, activeUid]);

  // 1-second live timer tick
  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 3-minute automatic matchmaking timer while autoArrange is enabled
  useEffect(() => {
    if (!user || !appState?.initialized || !appState.autoArrange) return;
    const targetMs = appState.nextAutoArrangeAt ?? Date.now();
    const delay = Math.max(0, targetMs - Date.now());

    const timer = setTimeout(async () => {
      if (autoArrangeRunningRef.current) return;
      const latest = latestStateRef.current;
      if (!latest || !latest.initialized || !latest.autoArrange) return;

      autoArrangeRunningRef.current = true;
      try {
        const created = await runAutoArrangeOnce(
          user.uid,
          latest.waitingPlayers,
          latest.queue,
          true,
        );
        if (created > 0) {
          showToast(`自動排列已執行，新增 ${created} 組排列組合`);
        }
      } catch (err) {
        setFatalError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        autoArrangeRunningRef.current = false;
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [user, appState?.initialized, appState?.autoArrange, appState?.nextAutoArrangeAt, showToast]);

  const activeCourt = useMemo(() => {
    if (!appState || activeCourtId === null) return null;
    return appState.courts.find((c) => c.id === activeCourtId) ?? null;
  }, [appState, activeCourtId]);

  // Surface fatal Firestore errors to ErrorBoundary
  if (fatalError) {
    throw fatalError;
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F6F8F7] flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">驗證登入狀態中…</div>
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  if (!appState) {
    return (
      <div className="min-h-screen bg-[#F6F8F7] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-sm text-slate-600 font-medium">同步 Firestore 資料庫中…</div>
          {syncStalled && (
            <div className="bg-white border border-[#E2E8E5] rounded-xl p-5 text-left space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                連線時間較長，請求可能遭到瀏覽器封鎖
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                若瀏覽器開發者工具出現 <code className="font-mono">ERR_BLOCKED_BY_CLIENT</code>，通常是廣告攔截器（如 uBlock Origin、AdBlock、AdGuard）或 Brave Shields 封鎖了 <code className="font-mono">firestore.googleapis.com</code>。請將此網域加入白名單或暫時關閉攔截器後重新整理。
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void signOut(auth)}
                  className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  登出
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="h-9 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white"
                >
                  重新整理
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const uid = user.uid;

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleInitialSetup = async (courtCount: number) => {
    await setupCourts(uid, courtCount, appState.sessionDocExists);
  };

  const handleAddPlayers = async (nameInput: string) => {
    const res = await addPlayers(uid, nameInput, appState.allPlayers);
    if (res.duplicates.length > 0) {
      showToast(
        `已新增 ${res.added.length} 位球員（略過重複：${res.duplicates.join('、')}）`,
      );
    } else {
      showToast(`已新增球員：${res.added.join('、')}`);
    }
    return res;
  };

  const handleChangeCourtCount = async (count: number) => {
    await updateCourtCount(uid, count, appState.courts);
    showToast(`場地數量已更新為 ${count} 面`);
  };

  const handleSaveCourtName = async (courtId: string, name: string) => {
    await updateCourtName(uid, courtId, name);
  };

  const handleAssignCourtGroup = async (
    courtId: string,
    queueGroupId: string,
    scores: string[],
  ) => {
    const court = appState.courts.find((c) => c.id === courtId);
    const group = appState.queue.find((g) => g.id === queueGroupId);
    if (!court || !group) {
      throw new Error('場地或排列組合資料已變更，請重新操作');
    }
    const res = await assignCourtGroup(uid, court, group, scores, appState.queue);
    if (res.recordedMatch) {
      showToast('已記錄上組打球資料與積分至 Firestore，並安排新組合上場計時');
    } else {
      showToast('已安排球員上場，開始計時');
    }
  };

  const handleClearCourt = async (courtId: string, scores: string[]) => {
    const court = appState.courts.find((c) => c.id === courtId);
    if (!court) {
      throw new Error('找不到指定的場地');
    }
    const res = await clearCourt(uid, court, scores);
    if (res.recordedMatch) {
      showToast('已記錄打球資料並將球員移回未排列名單，場地已設為無人上場');
    } else {
      showToast('場地已設為無人上場狀態');
    }
  };

  const handleToggleWaitingPlayer = (playerId: string) => {
    setSelectedWaitingIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 4) {
        showToast('每組羽球雙打最多點選 4 位球員');
        return prev;
      }
      return [...prev, playerId];
    });
  };

  const handleTogglePlayerPause = async (playerId: string, playerName: string, currentlyPaused: boolean) => {
    if (togglingPauseId === playerId) return;
    const nextPaused = !currentlyPaused;
    setTogglingPauseId(playerId);
    if (nextPaused) {
      setSelectedWaitingIds((prev) => prev.filter((id) => id !== playerId));
    }
    try {
      await togglePlayerPause(uid, playerId, nextPaused);
      showToast(
        nextPaused
          ? `已暫停「${playerName}」，自動排列將不會排入`
          : `已恢復「${playerName}」，可參與自動排列`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : '切換暫停狀態失敗', 'error');
    } finally {
      setTogglingPauseId(null);
    }
  };

  const handleManualQueue = async () => {
    if (selectedWaitingIds.length !== 4 || submittingManualQueue) return;
    setSubmittingManualQueue(true);
    try {
      await createManualGroup(uid, selectedWaitingIds, appState.queue);
      setSelectedWaitingIds([]);
      showToast('已將 4 位球員加入排列組合');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '排隊失敗', 'error');
    } finally {
      setSubmittingManualQueue(false);
    }
  };

  const handleRemoveQueueGroup = async (groupId: string) => {
    if (removingGroupId !== null) return;
    setRemovingGroupId(groupId);
    try {
      await removeQueueGroup(uid, groupId, appState.queue);
      showToast('已移除組合並將 4 位球員移回未排列名單');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '移除組合失敗', 'error');
    } finally {
      setRemovingGroupId(null);
    }
  };

  const handleToggleAutoArrange = async () => {
    try {
      const res = await toggleAutoArrange(
        uid,
        appState.autoArrange,
        appState.waitingPlayers,
        appState.queue,
      );
      if (res.enabled) {
        if (res.groupsCreated > 0) {
          showToast(`自動排列已啟動，已立即排列 ${res.groupsCreated} 組（每 3 分鐘自動執行）`);
        } else {
          showToast('自動排列已啟動（每 3 分鐘執行一次未排列球員自動配對）');
        }
      } else {
        showToast('已停止自動排列狀態');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '切換自動排列失敗', 'error');
    }
  };

  const handleResetAll = async () => {
    await resetAll(uid);
    setActiveCourtId(null);
    setActivePlayerId(null);
    setSelectedWaitingIds([]);
  };

  // First-time daily entry screen
  if (!appState.initialized) {
    return (
      <SetupScreen
        sessionDate={appState.sessionDate}
        onConfirm={handleInitialSetup}
      />
    );
  }

  const playingPlayerCount = appState.courts.reduce((sum, c) => sum + c.players.length, 0);
  const queuedPlayerCount = appState.queue.reduce((sum, g) => sum + g.players.length, 0);
  const canManualQueue = selectedWaitingIds.length === 4 && !submittingManualQueue;

  return (
    <div className="min-h-screen bg-[#F6F8F7] text-slate-900 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 h-14 bg-white border-b border-[#E2E8E5] px-5 flex items-center justify-between gap-6">
        <div className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          羽球雙打自動排點系統
        </div>

        <div className="hidden md:flex items-center gap-2.5 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap shrink-0">
          <span>{appState.sessionDate}</span>
          <span aria-hidden="true">·</span>
          <span>場地 {appState.courtCount}</span>
          <span aria-hidden="true">·</span>
          <span>上場 {playingPlayerCount} 人</span>
          <span aria-hidden="true">·</span>
          <span>排隊 {appState.queue.length} 組（{queuedPlayerCount} 人）</span>
          <span aria-hidden="true">·</span>
          <span>未排列 {appState.waitingPlayers.length} 人</span>
          <span aria-hidden="true">·</span>
          <span>今日完成 {appState.totalMatchesToday} 場</span>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="h-9 px-3 rounded-lg border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>登出</span>
        </button>
      </header>

      {/* Main Workspace: Left (Top / Middle / Bottom) + Right (4 Compact Buttons) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Main Area divided into Top, Middle, Bottom */}
        <main className="flex-1 min-w-0 flex flex-col divide-y divide-[#E2E8E5]">
          {/* TOP-LEFT: Courts Grid (左上畫面) */}
          <section aria-label="場地現況" className="p-5 bg-[#F6F8F7]">
            <div className="flex items-baseline justify-between mb-3.5">
              <h2 className="text-sm font-bold text-slate-900">場地現況</h2>
              <span className="text-xs text-slate-500">
                點擊場地框框開啟場地視窗、修改名稱與安排上場組合
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {appState.courts.map((court) => {
                const isOccupied = court.players.length > 0;
                const elapsedSec =
                  isOccupied && court.startedAt
                    ? Math.max(0, Math.floor((nowMs - court.startedAt) / 1000))
                    : 0;

                return (
                  <button
                    key={court.id}
                    type="button"
                    onClick={() => setActiveCourtId(court.id)}
                    aria-label={court.name ? `場地 ${court.name}` : `場地框框 ${court.courtIndex}`}
                    className={`group text-left rounded-xl border transition-colors flex flex-col overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      isOccupied
                        ? 'bg-white border-emerald-600/45 hover:border-emerald-700'
                        : 'bg-white border-[#DDE3E0] hover:border-emerald-600'
                    }`}
                  >
                    {/* Top of Court Box: Court Name (blank by default) */}
                    <div
                      className={`h-9 px-3.5 border-b flex items-center justify-between ${
                        isOccupied
                          ? 'bg-emerald-50/60 border-emerald-100'
                          : 'bg-[#FAFBFB] border-[#EEF2F0]'
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-900 truncate min-h-[1.25rem]">
                        {court.name}
                      </span>
                    </div>

                    {/* Middle of Court Box: 4 Players (blank by default) */}
                    <div className="px-3.5 py-4 flex-1 flex flex-col justify-center min-h-[112px]">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                        {[0, 1].map((slotIdx) => {
                          const p = court.players[slotIdx];
                          return (
                            <div
                              key={slotIdx}
                              className="min-h-[1.5rem] flex items-center justify-center text-center"
                            >
                              <span className="text-sm font-semibold text-slate-900 truncate">
                                {p ? p.name : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div
                        className={`my-2.5 border-t border-dashed ${
                          isOccupied ? 'border-emerald-300' : 'border-slate-200'
                        }`}
                      />

                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                        {[2, 3].map((slotIdx) => {
                          const p = court.players[slotIdx];
                          return (
                            <div
                              key={slotIdx}
                              className="min-h-[1.5rem] flex items-center justify-center text-center"
                            >
                              <span className="text-sm font-semibold text-slate-900 truncate">
                                {p ? p.name : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bottom of Court Box: Elapsed Play Time */}
                    <div className="h-9 px-3.5 border-t border-[#EEF2F0] bg-[#FAFBFB] flex items-center justify-between text-xs">
                      <span className="text-slate-500">打球時間</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          isOccupied ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {formatDurationMMSS(elapsedSec)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* MIDDLE-LEFT: Arranged Queue Groups (左中畫面) */}
          <section aria-label="排列組合" className="p-5 bg-white">
            <div className="flex items-baseline justify-between mb-3.5">
              <h2 className="text-sm font-bold text-slate-900">
                排列組合
                <span className="ml-2 text-xs font-normal font-mono tabular-nums text-slate-500">
                  {appState.queue.length} 組
                </span>
              </h2>
              <span className="text-xs text-slate-500">
                點擊球員名稱查看積分與紀錄 · 左側顯示出場順位
              </span>
            </div>

            {appState.queue.length === 0 ? (
              <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-[#FAFBFB]">
                <p className="text-sm text-slate-600">目前尚無排列組合</p>
                <p className="text-xs text-slate-400 mt-1">
                  請於下方點選 4 位未排列球員按下「排隊」，或點擊右側「自動排列」開始自動分組。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {appState.queue.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-xl border border-[#E2E8E5] bg-white overflow-hidden flex flex-col"
                  >
                    <div className="flex items-stretch">
                      {/* Left: Queue Order / Priority */}
                      <div className="w-12 bg-[#FAFBFB] border-r border-[#EEF2F0] flex flex-col items-center justify-center shrink-0 py-3">
                        <span className="text-[10px] text-slate-400">順位</span>
                        <span className="text-lg font-bold font-mono tabular-nums text-slate-800">
                          {group.position}
                        </span>
                      </div>

                      {/* Right: 4 Players (clickable name + rating on right) */}
                      <div className="flex-1 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.players.map((player) => (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => setActivePlayerId(player.id)}
                            className="h-10 px-3 rounded-lg border border-[#EEF2F0] bg-[#FAFBFB] hover:bg-emerald-50/60 hover:border-emerald-300 flex items-center justify-between gap-2 transition-colors text-left"
                          >
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {player.name}
                            </span>
                            <span className="text-xs font-mono tabular-nums font-semibold text-emerald-700 shrink-0">
                              {player.rating}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bottom of Group: Remove Button */}
                    <div className="border-t border-[#EEF2F0] bg-[#FAFBFB] px-3 py-1.5 flex justify-end">
                      <button
                        type="button"
                        disabled={removingGroupId === group.id}
                        onClick={() => handleRemoveQueueGroup(group.id)}
                        className="h-8 px-3 rounded-md text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-50 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{removingGroupId === group.id ? '移除中…' : '移除'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* BOTTOM-LEFT: Unarranged / Waiting Players (左下畫面) */}
          <section aria-label="未排列球員" className="p-5 bg-[#F6F8F7] flex-1">
            {/* First row: 排隊 button (disabled by default, lights up when 4 selected) */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!canManualQueue}
                  onClick={handleManualQueue}
                  className={`h-10 px-5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    canManualQueue
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                      : 'bg-slate-200 text-slate-400 border border-slate-300/70'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>{submittingManualQueue ? '排隊中…' : '排隊'}</span>
                </button>

                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900 text-sm">未排列球員</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    共 {appState.waitingPlayers.length} 人
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`font-mono tabular-nums ${
                      selectedWaitingIds.length === 4
                        ? 'text-blue-700 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    已點選 {selectedWaitingIds.length} / 4
                  </span>
                </div>
              </div>

              {selectedWaitingIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedWaitingIds([])}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 underline underline-offset-2 whitespace-nowrap"
                >
                  取消全部點選
                </button>
              )}
            </div>

            {appState.waitingPlayers.length === 0 ? (
              <div className="py-10 px-4 text-center border border-dashed border-slate-300/80 rounded-xl bg-white/70">
                <p className="text-sm text-slate-600">目前沒有未排列的球員</p>
                <p className="text-xs text-slate-400 mt-1">
                  請點擊右側「新增球員」手動輸入球員名稱，新增後將顯示於此處。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                {appState.waitingPlayers.map((player) => {
                  const isSelected = selectedWaitingIds.includes(player.id);
                  const isPaused = player.paused;
                  const isPauseBusy = togglingPauseId === player.id;
                  return (
                    <div
                      key={player.id}
                      onClick={() => handleToggleWaitingPlayer(player.id)}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggleWaitingPlayer(player.id);
                        }
                      }}
                      className={`h-12 px-3 rounded-lg border flex items-center justify-between gap-2 select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                        isSelected
                          ? 'bg-blue-600 border-blue-700 text-white'
                          : isPaused
                            ? 'bg-rose-600 border-rose-700 text-white'
                            : 'bg-white border-[#DDE3E0] hover:border-blue-400 text-slate-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{player.name}</div>
                        <div
                          className={`text-[11px] font-mono tabular-nums ${
                            isSelected
                              ? 'text-blue-100'
                              : isPaused
                                ? 'text-rose-100'
                                : 'text-slate-500'
                          }`}
                        >
                          {player.rating} · {player.lastPlayedAt}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isPauseBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTogglePlayerPause(player.id, player.name, isPaused);
                        }}
                        aria-pressed={isPaused}
                        aria-label={isPaused ? `恢復 ${player.name} 自動排列` : `暫停 ${player.name} 自動排列`}
                        className={`h-7 px-2.5 rounded-md border text-xs font-semibold shrink-0 transition-colors whitespace-nowrap ${
                          isPaused
                            ? 'bg-white text-rose-700 border-white hover:bg-rose-50'
                            : isSelected
                              ? 'bg-blue-500/40 text-white border-blue-300/60 hover:bg-blue-500'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                        }`}
                      >
                        暫停
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePlayerId(player.id);
                        }}
                        aria-label={`查看 ${player.name} 資料`}
                        title="查看球員資料"
                        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'text-blue-100 hover:bg-blue-500 hover:text-white'
                            : isPaused
                              ? 'text-rose-100 hover:bg-rose-500 hover:text-white'
                              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        {/* Right Side: 4 Compact Control Buttons (畫面右側四個小按鍵) */}
        <RightControlBar
          courtCount={appState.courtCount}
          autoArrange={appState.autoArrange}
          nextAutoArrangeAt={appState.nextAutoArrangeAt}
          nowMs={nowMs}
          onAddPlayers={handleAddPlayers}
          onChangeCourtCount={handleChangeCourtCount}
          onToggleAutoArrange={handleToggleAutoArrange}
          onResetAll={handleResetAll}
        />
      </div>

      {/* Court Modal (場地視窗) */}
      {activeCourt && (
        <CourtModal
          court={activeCourt}
          topQueueGroups={appState.queue.slice(0, 3)}
          nowMs={nowMs}
          onClose={() => setActiveCourtId(null)}
          onSaveCourtName={handleSaveCourtName}
          onAssignGroup={handleAssignCourtGroup}
          onClearCourt={handleClearCourt}
          onSelectPlayer={(playerId) => setActivePlayerId(playerId)}
        />
      )}

      {/* Player Modal (球員視窗) */}
      {activePlayerId !== null && (
        <PlayerModal
          uid={uid}
          playerId={activePlayerId}
          onClose={() => setActivePlayerId(null)}
        />
      )}

      {/* Non-blocking Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-5 z-50 max-w-md px-4 py-2.5 rounded-lg text-xs font-medium shadow-md border ${
            toast.tone === 'error'
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
