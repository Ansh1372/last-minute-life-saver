import React, { useState } from 'react';
import { AuditLogEntry } from '../types';
import { Shield, RefreshCw, Terminal, CheckCircle2, AlertCircle, Info, Filter } from 'lucide-react';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
  onRefresh: () => void;
}

export default function AuditLogView({ logs, onRefresh }: AuditLogViewProps) {
  const [filter, setFilter] = useState<'all' | 'success' | 'warning' | 'error' | 'info'>('all');

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.status === filter;
  });

  return (
    <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-900 p-6 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-900">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-slate-900 rounded-lg text-slate-300">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display font-medium text-slate-100 text-sm">
              Global System Audit Log
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Robust audit trail for security clearance & LangGraph nodes (Requirement 7)
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          title="Refresh Logs"
          className="p-1.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Filter Row */}
      <div className="flex items-center justify-between gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-850 text-slate-450 text-[10px] font-mono">
          <Filter className="h-3 w-3" /> Filters
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {(['all', 'success', 'warning', 'error', 'info'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono leading-none border uppercase transition-all ${
                filter === lvl
                  ? 'bg-slate-800 border-slate-700 text-slate-100 font-semibold'
                  : 'bg-slate-900/50 border-slate-900 text-slate-450 hover:text-slate-300'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Window */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl max-h-[300px] overflow-y-auto font-mono text-[11px] leading-relaxed p-4 space-y-3 scrollbar-hide">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 text-center py-6">
            No audit logs recorded matching standard level.
          </div>
        ) : (
          [...filteredLogs].reverse().map((log) => {
            const getStatusColor = () => {
              switch (log.status) {
                case 'success': return 'text-emerald-400';
                case 'warning': return 'text-amber-400';
                case 'error': return 'text-red-400';
                default: return 'text-blue-300';
              }
            };
            
            const Icon = log.status === 'success' ? CheckCircle2 : log.status === 'error' ? AlertCircle : Info;

            return (
              <div key={log.id} className="flex items-start gap-3 border-b border-slate-900/60 pb-2.5 last:border-b-0 last:pb-0">
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${getStatusColor()}`} />
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-slate-200">
                      {log.action}
                    </span>
                    <span className="text-[9px] text-slate-500 font-normal">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[10px] leading-normal font-light">
                    {log.detail}
                  </p>
                  <div className="flex gap-2 text-[9px] text-slate-600 uppercase font-bold pt-0.5">
                    <span>Node: {log.agentNode}</span>
                    <span>•</span>
                    <span>Level: {log.status}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>Total Logs: {logs.length}</span>
        <span>Audit Safe: ISO 27001 compliant trace</span>
      </div>
    </div>
  );
}
