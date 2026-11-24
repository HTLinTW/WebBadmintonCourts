import React from 'react';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../firebase';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || '發生未預期的資料庫錯誤',
    };
  }

  componentDidCatch(error: Error): void {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isQuotaError = this.state.errorMessage.includes('Quota exceeded');
    const isFreeReadQuota = this.state.errorMessage.includes(
      "Quota exceeded for quota metric 'Free daily read units per project (free tier database)'",
    );
    const upgradeUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-screen bg-[#F6F8F7] flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white border border-[#E2E8E5] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Firestore 連線或權限發生錯誤</h2>
          {isQuotaError ? (
            <div className="text-sm text-slate-600 space-y-2 leading-relaxed">
              <p>今日 Firestore 免費額度已達上限，額度將於隔日重置。</p>
              {isFreeReadQuota && (
                <p>
                  您可前往 Firebase Console 查看或升級方案：{' '}
                  <a
                    href={upgradeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 underline break-all"
                  >
                    開啟 Firestore 資料庫設定
                  </a>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600 leading-relaxed">
              操作 Firestore 資料庫時遇到錯誤，請重新整理頁面或確認登入狀態後再試。
            </p>
          )}
          <pre className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
            {this.state.errorMessage}
          </pre>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              重新整理頁面
            </button>
          </div>
        </div>
      </div>
    );
  }
}
