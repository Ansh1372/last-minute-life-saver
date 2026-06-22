import React, { useState } from 'react';
import { Sparkles, Calendar, ArrowRight, CornerDownLeft, AlertCircle } from 'lucide-react';

interface GoalIntakeProps {
  onSubmit: (goal: string, targetDate: string) => void;
  isLoading: boolean;
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

export default function GoalIntake({ onSubmit, isLoading }: GoalIntakeProps) {
  const [goal, setGoal] = useState('');
  const [targetDate, setTargetDate] = useState('');

  // Set default due date to 3 days out initially
  React.useEffect(() => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    setTargetDate(defaultDate.toISOString().split('T')[0]);
  }, []);

  const handlePresetClick = (query: string, offsetDays: number) => {
    setGoal(query);
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    setTargetDate(date.toISOString().split('T')[0]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || !targetDate) return;
    onSubmit(goal.trim(), targetDate);
  };

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
        {/* Goal Textarea */}
        <div className="relative">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={isLoading}
            placeholder="e.g. I have a major presentation of our quarterly roadmap to stakeholders this Friday. I need to design slides, draft status emails, and schedule preparation slots..."
            className="w-full text-sm border border-gray-250 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl px-4 py-3 min-h-[110px] resize-none bg-gray-50/30 focus:bg-white transition-all text-gray-800 placeholder-gray-400 leading-relaxed font-sans"
            required
          />
        </div>

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
              required
              className="text-xs font-semibold px-3 py-1.5 border border-gray-250 focus:outline-none focus:border-orange-500 rounded-lg text-gray-800 bg-white shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !goal.trim()}
            className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:bg-gray-200 disabled:scale-100 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-orange-100"
          >
            {isLoading ? "Consulting planning loop..." : "Deploy AI Salvager"}
            {!isLoading && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </form>

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
