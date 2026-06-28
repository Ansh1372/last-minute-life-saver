import React, { useEffect, useState, useRef } from 'react';
import { Terminal, RefreshCw } from 'lucide-react';

interface ThoughtStreamProps {
  sessionId: string | null;
}

export default function ThoughtStream({ sessionId }: ThoughtStreamProps) {
  const [steps, setSteps] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) {
      setSteps([]);
      setConnected(false);
      return;
    }

    setSteps([]);
    setConnected(true);

    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.step) {
          setSteps((prev) => {
            // Avoid duplicates
            if (prev.includes(data.step)) {
              return prev;
            }
            return [...prev, data.step];
          });
        }
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      setConnected(false);
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [sessionId]);

  // Scroll to bottom whenever steps change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps]);

  if (!sessionId) return null;

  return (
    <div id="thought-stream-terminal" className="bg-slate-950 rounded-2xl border border-slate-800 p-5 shadow-2xl space-y-4 font-mono text-xs text-left">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
            Agentic Thought Stream
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-[10px] text-slate-400 font-mono">
            {connected ? 'LIVE FEED' : 'OFFLINE'}
          </span>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="space-y-2.5 max-h-[160px] overflow-y-auto scrollbar-hide text-slate-300 pr-1"
      >
        {steps.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-500 animate-pulse">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-600" />
            <span>Establishing real-time link to LangGraph workflow...</span>
          </div>
        ) : (
          steps.map((step, idx) => {
            const isCompleted = step.startsWith('✓') || step.startsWith('✅');
            const isFailed = step.startsWith('❌');

            return (
              <div 
                key={idx} 
                className={`flex items-center gap-2.5 py-1 px-2 rounded transition-all duration-300 ${
                  idx === steps.length - 1 
                    ? 'bg-slate-900 border-l-2 border-emerald-500 font-medium text-slate-100' 
                    : 'opacity-75'
                }`}
              >
                <span className="text-slate-600 font-mono select-none">
                  {(idx + 1).toString().padStart(2, '0')}
                </span>
                <span className={`flex-1 ${
                  isFailed ? 'text-rose-400 font-semibold' : isCompleted ? 'text-emerald-400 font-semibold' : 'text-slate-200'
                }`}>
                  {step}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
