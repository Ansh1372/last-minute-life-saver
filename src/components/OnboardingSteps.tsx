import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, CalendarCheck, Mic, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

interface OnboardingStepsProps {
  onConnectGoogle: () => void;
}

const STEPS = [
  {
    icon: Zap,
    iconBg: 'bg-orange-500',
    shadowColor: 'shadow-orange-200',
    label: 'Step 1',
    title: 'Turn deadline panic into a plan',
    description:
      'Describe your overdue goal in plain English — "I have a client presentation this Friday and nothing is done." The AI instantly breaks it into a clear, time-blocked schedule.',
    bullet: '⚡ Powered by Gemini 2.5 Flash + LangGraph',
  },
  {
    icon: CalendarCheck,
    iconBg: 'bg-blue-500',
    shadowColor: 'shadow-blue-200',
    label: 'Step 2',
    title: 'Connect your Google Workspace',
    description:
      "Link your Google Calendar and Gmail so the agent can check your free slots, block time automatically, and draft status emails — all before you approve anything.",
    bullet: '🔒 Read-only preview · You approve before anything is written',
  },
  {
    icon: Mic,
    iconBg: 'bg-purple-500',
    shadowColor: 'shadow-purple-200',
    label: 'Step 3',
    title: 'Speak or type — your AI starts working',
    description:
      "Use voice input or type your panic goal, set the deadline, and hit Deploy. The autonomous agent analyzes, schedules, drafts, and hands you a one-click approval gate.",
    bullet: '🎙️ Voice input supported · Works in Chrome & Edge',
  },
];

export default function OnboardingSteps({ onConnectGoogle }: OnboardingStepsProps) {
  const [activeStep, setActiveStep] = useState(0);

  const step = STEPS[activeStep];
  const Icon = step.icon;

  return (
    <div className="backdrop-blur-xl bg-white/85 rounded-3xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      {/* Top accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-400 via-purple-400 to-blue-400" />

      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="p-1.5 bg-orange-500 rounded-lg">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-gray-500">
            How It Works · 3 Steps
          </span>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => {
            const StepIcon = s.icon;
            return (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className={`flex-1 flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all duration-200 ${
                  i === activeStep
                    ? 'border-orange-300 bg-orange-50/50 shadow-sm'
                    : 'border-gray-150 hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${i === activeStep ? s.iconBg : 'bg-gray-200'} transition-colors`}>
                  <StepIcon className={`h-3.5 w-3.5 ${i === activeStep ? 'text-white' : 'text-gray-500'}`} />
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wider hidden sm:block ${i === activeStep ? 'text-orange-700' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Animated Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="space-y-4"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-2xl ${step.iconBg} shadow-lg ${step.shadowColor} shrink-0`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-gray-400">{step.label} of 3</span>
                <h3 className="font-display font-bold text-gray-900 text-lg leading-tight mt-0.5">{step.title}</h3>
              </div>
            </div>

            <p className="text-sm text-gray-500 leading-relaxed font-light">{step.description}</p>

            <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-xl px-3 py-2.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="text-[11px] font-semibold text-gray-600">{step.bullet}</span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-100">
          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === activeStep ? 'w-5 bg-orange-500' : 'w-1.5 bg-gray-250'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {activeStep < STEPS.length - 1 ? (
              <button
                onClick={() => setActiveStep(s => s + 1)}
                className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-orange-100 active:scale-[0.98]"
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={onConnectGoogle}
                className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-orange-100 active:scale-[0.98]"
              >
                <CalendarCheck className="h-3.5 w-3.5" /> Connect Google & Start
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
