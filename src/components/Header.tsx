import React from 'react';
import { clearCachedToken, TokenStatus } from '../auth';
import { ShieldCheck, LogOut, Sparkles, Activity, Clock } from 'lucide-react';

interface HeaderProps {
  tokenStatus: TokenStatus;
  onOpenAuth: () => void;
  onClearAuth: () => void;
  showAuditLogs: boolean;
  setShowAuditLogs: (val: boolean) => void;
}

export default function Header({
  tokenStatus,
  onOpenAuth,
  onClearAuth,
  showAuditLogs,
  setShowAuditLogs,
}: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-250 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-orange-200 shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display font-semibold text-gray-900 text-base tracking-tight leading-none">
              Last-Minute Life Saver
            </h1>
            <p className="hidden sm:block text-[10px] font-mono text-gray-400 mt-1 uppercase tracking-wider">
              Autonomous Agentic Salvager • Minimalist
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4">
          {/* Agent Status Pulse (from design theme) */}
          <div className="hidden sm:flex items-center gap-2 border-r border-gray-150 pr-4">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest">Agent Online</span>
          </div>

          {/* Audit Logs Toggle */}
          <button
            onClick={() => setShowAuditLogs(!showAuditLogs)}
            className={`flex items-center justify-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-xs font-semibold transition-all ${
              showAuditLogs
                ? 'bg-gray-800 text-white shadow-inner'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
            title="Audit Logs"
          >
            <Activity className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">Audit Logs</span>
          </button>

          {/* User Sign-In Controls */}
          {tokenStatus.hasToken && tokenStatus.user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 pl-2 bg-gray-50 py-1 pr-3 rounded-lg border border-gray-100">
                <img
                  src={tokenStatus.user.photoURL}
                  referrerPolicy="no-referrer"
                  alt="gravatar"
                  className="h-6 w-6 rounded-full bg-gray-200 border border-white shadow-sm"
                />
                <div className="text-left leading-none">
                  <div className="text-[11px] font-semibold text-gray-800 leading-tight">
                    {tokenStatus.user.name}
                  </div>
                  <div className="text-[9px] text-gray-400 font-mono">
                    Authenticated
                  </div>
                </div>
              </div>
              
              <button
                onClick={onClearAuth}
                title="Disconnect Workspace"
                className="flex items-center justify-center h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-gray-50 rounded-lg transition-colors border border-dashed border-transparent hover:border-red-100"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="bg-white border border-gray-250 hover:border-gray-800 text-gray-800 hover:text-gray-950 font-semibold text-[11px] sm:text-xs h-8 px-2.5 sm:px-3.5 rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5 text-gray-500 hidden sm:block" />
              Connect<span className="hidden sm:inline"> Workspace</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
