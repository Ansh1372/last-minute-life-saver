import React, { useState } from 'react';
import { AlertTriangle, Siren, X, ArrowRight, Loader2, Mail, ListChecks, Brain, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface TriageResult {
  severityLevel: 'low' | 'medium' | 'high' | 'critical';
  severityReason: string;
  damageControlEmail: {
    subject: string;
    to: string;
    body: string;
  };
  escalationPlan: {
    step: number;
    action: string;
    detail: string;
    timeframe: string;
  }[];
  recoveryMindset: string;
}

interface TriageModeProps {
  onClose: () => void;
}

const SEVERITY_CONFIG = {
  low:      { color: 'green',  bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  badge: 'bg-green-100',  label: '🟢 Low Impact'     },
  medium:   { color: 'yellow', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100', label: '🟡 Medium Impact'   },
  high:     { color: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100', label: '🟠 High Impact'     },
  critical: { color: 'red',    bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-100',    label: '🔴 Critical — Act Now' },
};

export default function TriageMode({ onClose }: TriageModeProps) {
  const [step, setStep] = useState<'form' | 'loading' | 'result'>('form');
  const [missedDeadline, setMissedDeadline] = useState('');
  const [context, setContext] = useState('');
  const [stakeholders, setStakeholders] = useState('');
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailExpanded, setEmailExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!missedDeadline.trim() || !context.trim()) return;
    setStep('loading');
    setError(null);
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missedDeadline, context, stakeholders }),
      });

      // Safely read body as text first to avoid "Unexpected end of JSON" crash
      const rawText = await res.text();
      if (!rawText || rawText.trim() === '') {
        throw new Error('Server returned an empty response. Please try again in a moment.');
      }

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error('Server response was not valid JSON. The AI may still be loading — please retry.');
      }

      if (!res.ok || !data.success) throw new Error(data.error || 'Triage failed. Please try again.');
      setResult(data.triage);
      setStep('result');
    } catch (err: any) {
      setError(err.message);
      setStep('form');
    }
  };

  const copyEmail = () => {
    if (!result) return;
    const text = `Subject: ${result.damageControlEmail.subject}\nTo: ${result.damageControlEmail.to}\n\n${result.damageControlEmail.body}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sev = result ? SEVERITY_CONFIG[result.severityLevel] : null;

  return (
    <div className="fixed inset-0 bg-gray-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="bg-red-500 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white/20 rounded-xl">
              <Siren className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-display font-bold text-white text-base leading-tight">Deadline Missed — Triage Mode</h2>
              <p className="text-red-100 text-[10px] font-mono uppercase tracking-wider mt-0.5">AI Damage Control Engine · Powered by Gemini</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">

          {/* FORM STATE */}
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 leading-relaxed font-medium">
                  Don't panic. Describe what you missed and the AI will instantly generate a professional damage-control email and a step-by-step recovery plan.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                  What deadline did you miss?
                </label>
                <input
                  type="text"
                  value={missedDeadline}
                  onChange={e => setMissedDeadline(e.target.value)}
                  placeholder="e.g. Project report due to the client at 5 PM today"
                  required
                  className="w-full text-sm border border-gray-250 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 rounded-xl px-4 py-3 bg-gray-50/30 text-gray-800 placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                  Why did it happen? (brief context)
                </label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="e.g. Unexpected technical issues with the data pipeline took all day to resolve. The issue is now fixed and I have the core analysis ready."
                  required
                  className="w-full text-sm border border-gray-250 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 rounded-xl px-4 py-3 min-h-[90px] resize-none bg-gray-50/30 text-gray-800 placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                  Who's affected? (stakeholders)
                </label>
                <input
                  type="text"
                  value={stakeholders}
                  onChange={e => setStakeholders(e.target.value)}
                  placeholder="e.g. Marketing team, client, my direct manager"
                  className="w-full text-sm border border-gray-250 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 rounded-xl px-4 py-3 bg-gray-50/30 text-gray-800 placeholder-gray-400"
                />
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!missedDeadline.trim() || !context.trim()}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-200 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-red-100 active:scale-[0.98]"
              >
                <Siren className="h-4 w-4" />
                Generate Damage Control Plan
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* LOADING STATE */}
          {step === 'loading' && (
            <div className="p-12 flex flex-col items-center justify-center gap-4 text-center">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full animate-ping" />
              </div>
              <div>
                <p className="font-display font-bold text-gray-900 text-base">Gemini is assessing the situation...</p>
                <p className="text-xs text-gray-500 mt-1">Analyzing impact · Drafting email · Building recovery plan</p>
              </div>
            </div>
          )}

          {/* RESULT STATE */}
          {step === 'result' && result && sev && (
            <div className="p-6 space-y-5">

              {/* Severity Banner */}
              <div className={`${sev.bg} ${sev.border} border rounded-xl p-4 flex items-start gap-3`}>
                <div className={`${sev.badge} p-1.5 rounded-lg shrink-0`}>
                  <AlertTriangle className={`h-4 w-4 ${sev.text}`} />
                </div>
                <div>
                  <p className={`text-xs font-bold ${sev.text} uppercase tracking-wider`}>{sev.label}</p>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{result.severityReason}</p>
                </div>
              </div>

              {/* Recovery Mindset */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
                <Brain className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                <p className="text-xs text-purple-800 font-semibold italic leading-relaxed">"{result.recoveryMindset}"</p>
              </div>

              {/* Damage Control Email */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setEmailExpanded(!emailExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-bold text-gray-800">Damage Control Email</span>
                    <span className="text-[10px] font-mono text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">Ready to Send</span>
                  </div>
                  {emailExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                {emailExpanded && (
                  <div className="p-4 space-y-3">
                    <div className="text-[10px] font-mono text-gray-500 space-y-1 border-b border-gray-100 pb-3">
                      <div><span className="font-bold text-gray-700">To:</span> {result.damageControlEmail.to}</div>
                      <div><span className="font-bold text-gray-700">Subject:</span> {result.damageControlEmail.subject}</div>
                    </div>
                    <div className="text-xs text-gray-700 leading-relaxed font-sans whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100 max-h-[220px] overflow-y-auto">
                      {result.damageControlEmail.body}
                    </div>
                    <button
                      onClick={copyEmail}
                      className="w-full flex items-center justify-center gap-2 text-[11px] font-bold text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 rounded-lg py-2 transition-all bg-white"
                    >
                      {copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Email</>}
                    </button>
                  </div>
                )}
              </div>

              {/* Escalation Plan */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ListChecks className="h-4 w-4 text-orange-500" />
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">3-Step Recovery Plan</span>
                </div>
                <div className="space-y-3">
                  {result.escalationPlan.map((item) => (
                    <div key={item.step} className="flex gap-3 p-3.5 border border-gray-150 rounded-xl bg-white hover:border-orange-200 transition-colors shadow-xs">
                      <div className="h-6 w-6 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                        {item.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs font-bold text-gray-900">{item.action}</p>
                          <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full shrink-0">{item.timeframe}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Re-triage button */}
              <button
                onClick={() => { setStep('form'); setResult(null); }}
                className="w-full text-xs font-bold text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-400 rounded-xl py-2.5 transition-all"
              >
                ← Triage a Different Situation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
