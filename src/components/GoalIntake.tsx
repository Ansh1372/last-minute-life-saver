import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Calendar, ArrowRight, Mic, MicOff, AlertCircle, Zap } from 'lucide-react';

interface GoalIntakeProps {
  onSubmit: (goal: string, targetDate: string) => void;
  isLoading: boolean;
  onOpenTriage: () => void;
}

const PRESETS = [
  {
    label: "🔥 Presentation This Friday",
    query: "Draft presentation outline and slide flow for the quarterly business project alignment session",
    offsetDays: 4,
  },
  {
    label: "🚨 Project Kickoff Prep",
    query: "Formulate stakeholder communication outline, milestones list, and team resource calendar schedules",
    offsetDays: 2,
  },
  {
    label: "🎯 Design Review Due Tomorrow",
    query: "Assemble design guidelines feedback, outline subtasks, and notify development leads group",
    offsetDays: 1,
  }
];

// Browser Speech Recognition types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function GoalIntake({ onSubmit, isLoading, onOpenTriage }: GoalIntakeProps) {
  const [goal, setGoal] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Set default due date to 3 days out initially
  useEffect(() => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    setTargetDate(defaultDate.toISOString().split('T')[0]);

    // Check browser support
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
    }
  }, []);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceError('Voice input is not supported in this browser. Try Chrome.');
      return;
    }

    setVoiceError(null);
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setGoal(prev => (prev ? prev + ' ' + finalTranscript : finalTranscript).trim());
        setInterimText('');
      } else {
        setInterimText(interimTranscript);
      }
    };

    recognition.onerror = () => {
      setVoiceError('Could not access microphone. Please allow mic access and try again.');
      setIsListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText('');
  };

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handlePresetClick = (query: string, offsetDays: number) => {
    setGoal(query);
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    setTargetDate(date.toISOString().split('T')[0]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isListening) stopListening();
    if (!goal.trim() || !targetDate) return;
    onSubmit(goal.trim(), targetDate);
  };

  const displayText = goal + (interimText ? (goal ? ' ' : '') + interimText : '');

  return (
    <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-orange-500 rounded-xl text-white shadow-md shadow-orange-100">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <span className="block text-[10px] font-bold text-gray-450 uppercase tracking-widest leading-none mb-1">
            Emergency Planner
          </span>
          <h2 className="font-display font-bold text-gray-800 text-lg leading-tight">
            Panic Goal Intake
          </h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Goal Textarea with Voice Button */}
        <div className="relative">
          <textarea
            value={displayText}
            onChange={(e) => {
              setGoal(e.target.value);
              setInterimText('');
            }}
            disabled={isLoading}
            placeholder="e.g. I have a major presentation of our quarterly roadmap to stakeholders this Friday. I need to design slides, draft status emails, and schedule preparation slots..."
            className={`w-full text-sm border focus:outline-none rounded-xl px-4 py-3 pr-14 min-h-[110px] resize-none bg-gray-50/30 focus:bg-white transition-all text-gray-800 placeholder-gray-400 leading-relaxed font-sans ${
              isListening
                ? 'border-red-400 ring-1 ring-red-400 focus:border-red-400 focus:ring-red-400'
                : 'border-gray-250 focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
            }`}
            required
          />

          {/* Mic Button - top right inside textarea */}
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={isLoading}
              title={isListening ? 'Stop recording' : 'Speak your goal'}
              className={`absolute top-3 right-3 p-2 rounded-lg transition-all duration-200 ${
                isListening
                  ? 'bg-red-500 text-white shadow-lg shadow-red-200 scale-110 animate-pulse'
                  : 'bg-gray-100 text-gray-500 hover:bg-orange-500 hover:text-white hover:shadow-md hover:shadow-orange-100'
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}

          {/* Live listening indicator */}
          {isListening && (
            <div className="absolute bottom-3 left-4 flex items-center gap-1.5">
              <span className="flex gap-0.5 items-end h-3">
                <span className="w-0.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms', height: '6px' }} />
                <span className="w-0.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '100ms', height: '10px' }} />
                <span className="w-0.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '200ms', height: '7px' }} />
                <span className="w-0.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms', height: '12px' }} />
                <span className="w-0.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '400ms', height: '8px' }} />
              </span>
              <span className="text-[10px] text-red-500 font-semibold uppercase tracking-wider">Listening...</span>
            </div>
          )}
        </div>

        {/* Voice error message */}
        {voiceError && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {voiceError}
          </div>
        )}

        {/* Date Selector Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <Calendar className="h-4 w-4 text-gray-400" />
              Deadlines Due Date:
            </span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              disabled={isLoading}
              className="text-xs border border-gray-250 rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-500 font-mono text-gray-800"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all disabled:opacity-70 flex items-center justify-center gap-1.5 shadow-md shadow-gray-200"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Processing...
              </span>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Deploy Recovery Plan
              </>
            )}
          </button>
        </div>
      </form>

      {/* Triage Mode CTA */}
      {!isLoading && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onOpenTriage}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-red-200 hover:border-red-400 hover:bg-red-50/30 text-red-600 hover:text-red-700 rounded-xl text-xs font-bold transition-all group"
          >
            <span className="text-base leading-none group-hover:scale-110 transition-transform">🚨</span>
            <span>I already missed my deadline — help me recover</span>
            <span className="ml-auto hidden sm:inline-block text-[10px] font-mono text-red-400 group-hover:text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">TRIAGE MODE</span>
          </button>
        </div>
      )}

      {/* Preset Suggestions */}
      {!isLoading && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <span className="block text-[10px] uppercase font-mono tracking-wider text-gray-400 font-bold mb-2.5">
            Quick Emergency Templates
          </span>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            {PRESETS.map((preset, index) => (
              <button
                key={index}
                onClick={() => handlePresetClick(preset.query, preset.offsetDays)}
                className="flex items-center text-left px-3.5 py-2 border border-gray-200 hover:border-orange-400 hover:text-orange-950 bg-white rounded-xl text-xs text-gray-650 hover:bg-orange-50/10 transition-all font-medium shadow-xs hover:translate-y-[-1px]"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
