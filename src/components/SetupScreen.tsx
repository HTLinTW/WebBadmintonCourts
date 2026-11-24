import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface SetupScreenProps {
  sessionDate: string;
  onConfirm: (courtCount: number) => Promise<void>;
}

const PRESET_COUNTS = [2, 3, 4, 6, 8];

export function SetupScreen({ sessionDate, onConfirm }: SetupScreenProps) {
  const [inputValue, setInputValue] = useState('4');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(inputValue.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24) {
      setError('請輸入 1 至 24 之間的整數場地數量');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化場地失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8F7] flex flex-col">
      <header className="h-16 border-b border-[#E2E8E5] bg-white px-6 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          羽球雙打自動排點系統
        </span>
        <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
          {sessionDate}
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white border border-[#E2E8E5] rounded-xl p-8">
          <div className="mb-6">
            <p className="text-xs font-medium text-emerald-700 mb-2">
              今日開打設定
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
              請輸入今日羽球場地數量
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              設定完成後即可開始新增球員、進行雙打排隊與自動配對，後續亦可隨時透過右側「更改場地數量」按鈕調整。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="initial-court-count"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                場地數量（1 – 24 面）
              </label>
              <input
                id="initial-court-count"
                type="number"
                min={1}
                max={24}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full h-12 px-4 rounded-lg border border-slate-300 bg-white text-lg font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 transition-colors"
                placeholder="例如：4"
                autoFocus
              />

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 mr-1">常用數量：</span>
                {PRESET_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setInputValue(String(n));
                      setError(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      inputValue === String(n)
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {n} 面
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-rose-600 font-medium" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 px-5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <span>{submitting ? '建立場地中…' : '開始今日排點'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
