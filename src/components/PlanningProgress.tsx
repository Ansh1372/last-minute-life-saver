import React from 'react';
import { PanickedGoal } from '../types';
import { CheckCircle2, Circle, Loader2, Sparkles, Calendar, FileText, Send } from 'lucide-react';

interface PlanningProgressProps {
  session: PanickedGoal;
}

export default function PlanningProgress({ session }: PlanningProgressProps) {
  const status = session.status;

  const steps = [
    {
      key: 'analyzing',
      label: 'Goal Decomposition',
      description: 'Gemini decomposes goal into discrete, micro-task estimates.',
      icon: Sparkles,
      status: status === 'analyzing' ? 'active' : ['calendar_check', 'drafting', 'review_needed', 'approved', 'committing', 'completed'].includes(status) ? 'completed' : 'pending'
    },
    {
      key: 'calendar_check',
      label: 'Calendar Conflicts Scan',
      description: 'Scanning Google Calendar slots to bypass existing meetings.',
      icon: Calendar,
      status: status === 'calendar_check' ? 'active' : ['drafting', 'review_needed', 'approved', 'committing', 'completed'].includes(status) ? 'completed' : 'pending'
    },
    {
      key: 'drafting',
      label: 'Artifact & Template Synthesis',
      description: 'Writing targeted Gmail communication drafts and Docs summaries.',
      icon: FileText,
      status: status === 'drafting' ? 'active' : ['review_needed', 'approved', 'committing', 'completed'].includes(status) ? 'completed' : 'pending'
    },
    {
      key: 'review_needed',
      label: 'Human approval validation',
      description: 'Presenting the calendar allocation and outlines for clearance.',
      icon: CheckCircle2,
      status: ['review_needed', 'approved', 'committing', 'completed'].includes(status) ? 'completed' : 'pending'
    }
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold text-gray-900 text-base flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-orange-500 animate-spin" />
            Agent Working on Plan
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Running autonomous state machine loop. This process is asynchronous.
          </p>
        </div>
        <div className="text-[10px] font-mono font-bold bg-orange-55 shadow-xs border border-orange-100 text-orange-650 px-2.5 py-1 rounded-md uppercase tracking-wider">
          status: {status.replace('_', ' ')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div
              key={step.key}
              className={`p-4 rounded-xl border transition-all duration-300 ${
                step.status === 'active'
                  ? 'border-orange-550 bg-orange-50/10 shadow-md shadow-orange-50/50'
                  : step.status === 'completed'
                  ? 'border-gray-200 bg-white opacity-85'
                  : 'border-gray-100 bg-white opacity-40'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-1.5 rounded-lg ${step.status === 'active' ? 'bg-orange-500 text-white shadow-sm shadow-orange-200' : 'bg-gray-100 text-gray-650'}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {step.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 fill-emerald-50" />
                ) : step.status === 'active' ? (
                  <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-200" />
                )}
              </div>
              <h4 className="font-display font-semibold text-xs text-gray-900 leading-tight">
                {step.label}
              </h4>
              <p className="text-[11px] text-gray-500 leading-normal mt-1.5 font-light">
                {step.description}
              </p>
            </div>
          );
        })}
      </div>

      {session.auditLogs && session.auditLogs.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <h4 className="text-[10px] uppercase font-mono tracking-wider font-bold text-gray-400 mb-2.5">
            Active Processing Logs
          </h4>
          <div className="bg-gray-900 text-gray-100 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed max-h-[140px] overflow-y-auto scrollbar-hide space-y-1.5 border border-gray-800">
            {session.auditLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-1 border-b border-gray-800/60 pb-1 last:border-0 last:pb-0">
                <div className="flex-1">
                  <span className="text-gray-500 mr-2">[{log.agentNode.padEnd(12)}]</span>
                  <span className={log.status === 'error' ? 'text-red-400' : log.status === 'warning' ? 'text-amber-400' : 'text-gray-300'}>
                    {log.action}: {log.detail}
                  </span>
                </div>
                <span className="text-gray-600 text-[10px]">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
