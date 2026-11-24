import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { LogIn } from 'lucide-react';
import { auth, googleProvider } from '../firebase';

export function AuthGate() {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google 登入失敗，請稍後再試';
      setError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8F7] flex flex-col">
      <header className="h-16 border-b border-[#E2E8E5] bg-white px-6 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          羽球雙打自動排點系統
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[#E2E8E5] rounded-xl p-8">
          <div className="mb-6">
            <p className="text-xs font-medium text-emerald-700 mb-2">
              Firestore 雲端同步
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
              登入以管理今日羽球排點
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              登入 Google 帳號後，所有場地狀態、排隊組合、球員積分與當日打球紀錄將安全儲存於您的專屬 Firestore 雲端資料庫。
            </p>
          </div>

          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={signingIn}
            onClick={handleGoogleSignIn}
            className="w-full h-12 px-5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" />
            <span>{signingIn ? '登入中…' : '使用 Google 帳號登入'}</span>
          </button>
        </div>
      </main>
    </div>
  );
}
