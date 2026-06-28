import React, { useState } from 'react';
import { PanickedGoal, Subtask, StarterArtifact } from '../types';
import { Edit3, Check, Calendar, Mail, FileText, Trash2, CheckCircle2, RotateCcw, Play, AlertTriangle, ExternalLink, BookmarkPlus, Repeat, Bookmark, Send } from 'lucide-react';

interface ApprovalGateProps {
  session: PanickedGoal;
  accessToken: string | null;
  onModify: (subtasks: Subtask[], artifacts: StarterArtifact[]) => void;
  onApprove: () => void;
  isCommitting: boolean;
}

export default function ApprovalGate({
  session,
  accessToken,
  onModify,
  onApprove,
  isCommitting,
}: ApprovalGateProps) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'drafts'>('calendar');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [tempTaskTitle, setTempTaskTitle] = useState('');
  const [tempTaskDesc, setTempTaskDesc] = useState('');
  const [tempTaskStart, setTempTaskStart] = useState('');
  const [tempTaskDuration, setTempTaskDuration] = useState(30);

  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(null);
  const [tempArtTitle, setTempArtTitle] = useState('');
  const [tempArtContent, setTempArtContent] = useState('');
  const [tempArtRecipient, setTempArtRecipient] = useState('');

  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [isTracked, setIsTracked] = useState(false);
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');

  const handleTrackToggle = () => {
    const newTracked = !isTracked;
    setIsTracked(newTracked);
    if (!newTracked) setRecurrence('none');
  };

  // Email Reminder State
  const [reminderEmail, setReminderEmail] = useState('');
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);


  // ---------------------------------------------------------------------------
  // Task Editing Helpers
  // ---------------------------------------------------------------------------
  const startEditTask = (task: Subtask) => {
    setEditingTaskId(task.id);
    setTempTaskTitle(task.title);
    setTempTaskDesc(task.description);
    setTempTaskDuration(task.estimatedMinutes);
    if (task.scheduledStart) {
      // format to datetime-local input
      const d = new Date(task.scheduledStart);
      const localString = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setTempTaskStart(localString);
    }
  };

  const saveEditTask = (id: string) => {
    const updated = session.subtasks.map((task) => {
      if (task.id === id) {
        return {
          ...task,
          title: tempTaskTitle,
          description: tempTaskDesc,
          estimatedMinutes: tempTaskDuration,
          scheduledStart: tempTaskStart ? new Date(tempTaskStart).toISOString() : task.scheduledStart,
          scheduledEnd: tempTaskStart 
            ? new Date(new Date(tempTaskStart).getTime() + tempTaskDuration * 60000).toISOString()
            : task.scheduledEnd,
        };
      }
      return task;
    });
    onModify(updated, session.artifacts);
    setEditingTaskId(null);
  };

  const toggleTaskStatus = (id: string) => {
    const updated = session.subtasks.map((task) => {
      if (task.id === id) {
        return {
          ...task,
          status: (task.status === 'rejected' ? 'approved' : 'rejected') as any,
        };
      }
      return task;
    });
    onModify(updated, session.artifacts);
  };


  // ---------------------------------------------------------------------------
  // Artifact Editing Helpers
  // ---------------------------------------------------------------------------
  const startEditArtifact = (art: StarterArtifact) => {
    setEditingArtifactId(art.id);
    setTempArtTitle(art.title);
    setTempArtContent(art.content);
    setTempArtRecipient(art.recipient || '');
  };

  const saveEditArtifact = (id: string) => {
    const updated = session.artifacts.map((art) => {
      if (art.id === id) {
        return {
          ...art,
          title: tempArtTitle,
          content: tempArtContent,
          recipient: art.type === 'email' ? tempArtRecipient : undefined,
        };
      }
      return art;
    });
    onModify(session.subtasks, updated);
    setEditingArtifactId(null);
  };

  const activeSubtasksCount = session.subtasks.filter((t) => t.status !== 'rejected').length;

  const handleSendReminder = async () => {
    if (!reminderEmail || !reminderEmail.includes('@')) return;
    setIsSendingReminder(true);
    try {
      const res = await fetch('/api/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: reminderEmail,
          subject: `Goal Reminder: ${session.goal}`,
          text: `You set a goal to: "${session.goal}".\n\nMake sure you complete it by ${new Date(session.targetDate).toLocaleString()}!\n\nThis is an automated reminder from Last-Minute Life Saver.`,
        }),
      });
      if (res.ok) setReminderSent(true);
    } catch (e) {
      console.error("Failed to send reminder email", e);
    }
    setIsSendingReminder(false);
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-orange-200 shadow-md overflow-hidden space-y-6 relative">
      {/* Top Banner Accent Indicator */}
      <div className="absolute -top-3 left-6 px-3.5 py-1 bg-orange-500 text-white text-[10px] font-bold rounded-full uppercase tracking-widest shadow-md shadow-orange-200">
        Approval Required
      </div>

      {/* Banner / User Instruction */}
      <div className="p-6 pt-8 bg-gray-50/50 border-b border-gray-150 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold font-mono tracking-wider text-orange-700 bg-orange-50 rounded-full uppercase border border-orange-100">
            <AlertTriangle className="h-3 w-3" /> Human Clearance Gate
          </span>
          <h2 className="font-display font-bold text-gray-900 text-xl mt-2 tracking-tight">
            Proposed Action Agenda
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Check scheduled slots and document sketches. Click "Edit" to modify any detail inline.
          </p>
        </div>

        <div>
          <button
            onClick={() => setShowConfirmPopup(true)}
            disabled={isCommitting || activeSubtasksCount === 0}
            className="w-full md:w-auto bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:shadow-none text-white font-bold text-xs px-6 py-3.5 rounded-xl transition-all shadow-md shadow-orange-100 flex items-center justify-center gap-2 hover:translate-y-[-1px] duration-150 active:scale-[0.98]"
          >
            <CheckCircle2 className="h-4 w-4" />
            Clear Plan & Sync ({activeSubtasksCount} Items)
          </button>
        </div>
      </div>

      {/* Track This Goal Toggle */}
      <div className={`mx-6 px-4 py-3 rounded-xl border transition-all duration-300 ${
        isTracked ? 'border-purple-200 bg-purple-50/40' : 'border-gray-150 bg-gray-50/40'
      }`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg transition-colors ${ isTracked ? 'bg-purple-500 text-white' : 'bg-gray-200 text-gray-500' }`}>
              <Bookmark className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800">Track this goal as a recurring habit</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Saves to your habit history and shows a recurrence reminder</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isTracked && (
              <div className="flex items-center gap-1.5">
                <Repeat className="h-3 w-3 text-purple-500" />
                <select
                  value={recurrence}
                  onChange={e => setRecurrence(e.target.value as any)}
                  className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-400"
                >
                  <option value="none">One-time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            )}
            {/* Toggle Switch */}
            <button
              onClick={handleTrackToggle}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                isTracked ? 'bg-purple-500' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                isTracked ? 'translate-x-4' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
        {isTracked && (
          <div className="mt-2.5 pt-2.5 border-t border-purple-100 flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-purple-500" />
            <span className="text-[10px] font-semibold text-purple-700">
              ✓ Will be saved to your habit dashboard{recurrence !== 'none' ? ` · Recurs ${recurrence}` : ' · One-time log'}
            </span>
          </div>
        )}
      </div>

      {/* Email Reminder Section */}
      <div className="mx-6 px-4 py-3 rounded-xl border border-blue-150 bg-blue-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
            <Send className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800">Send an email reminder</p>
            <p className="text-[10px] text-gray-500 mt-0.5">We'll email you a copy of this goal right now.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {reminderSent ? (
            <span className="text-xs font-bold text-emerald-600 flex items-center justify-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 w-full sm:w-auto">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sent!
            </span>
          ) : (
            <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2">
              <input
                type="email"
                placeholder="your@email.com"
                value={reminderEmail}
                onChange={(e) => setReminderEmail(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-2 sm:py-1.5 focus:outline-none focus:border-blue-300 w-full sm:w-48"
              />
              <button
                onClick={handleSendReminder}
                disabled={isSendingReminder || !reminderEmail.includes('@')}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-xs font-bold px-4 py-2 sm:py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm w-full sm:w-auto"
              >
                {isSendingReminder ? 'Sending...' : 'Remind Me'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Row */}
      <div className="px-6 border-b border-gray-100 flex items-center justify-between gap-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-6 whitespace-nowrap">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'calendar'
                ? 'border-orange-500 text-orange-950'
                : 'border-transparent text-gray-450 hover:text-gray-700'
            }`}
          >
            <Calendar className="h-4 w-4 text-gray-400" />
            1. Calendar Slots ({activeSubtasksCount})
          </button>
          
          <button
            onClick={() => setActiveTab('drafts')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'drafts'
                ? 'border-orange-500 text-orange-950'
                : 'border-transparent text-gray-450 hover:text-gray-700'
            }`}
          >
            <Mail className="h-4 w-4 text-gray-400" />
            2. Google Workspace Drafts ({session.artifacts.length})
          </button>
        </div>

        {!accessToken && (
          <div className="text-[10px] font-mono text-orange-655 bg-orange-50 px-2.5 py-1 rounded-md border border-orange-100/60 mb-2">
            Simulation Sandbox Active
          </div>
        )}
      </div>

      {/* Main Content Pane */}
      <div className="p-6">
        {activeTab === 'calendar' ? (
          /* CALENDAR TAB */
          <div className="space-y-4">
            {session.subtasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  task.status === 'rejected'
                    ? 'border-gray-150 bg-gray-50/50 opacity-55'
                    : editingTaskId === task.id
                    ? 'border-orange-500 bg-orange-50/5 ring-1 ring-orange-450'
                    : 'border-gray-200 bg-white hover:border-gray-350 shadow-xs'
                }`}
              >
                {editingTaskId === task.id ? (
                  /* EDITING SUBTASK STATE */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono text-gray-400 font-bold mb-1 uppercase">Subtask Title</label>
                        <input
                          type="text"
                          value={tempTaskTitle}
                          onChange={(e) => setTempTaskTitle(e.target.value)}
                          className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:border-orange-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-gray-400 font-bold mb-1 uppercase">Start Timing</label>
                        <input
                          type="datetime-local"
                          value={tempTaskStart}
                          onChange={(e) => setTempTaskStart(e.target.value)}
                          className="w-full text-xs px-3 py-1.5 border rounded-lg focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono text-gray-400 font-bold mb-1 uppercase">Description</label>
                        <textarea
                          value={tempTaskDesc}
                          onChange={(e) => setTempTaskDesc(e.target.value)}
                          className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:border-orange-500 min-h-[50px] resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-gray-400 font-bold mb-1 uppercase">Duration (Minutes)</label>
                        <input
                          type="number"
                          value={tempTaskDuration}
                          onChange={(e) => setTempTaskDuration(Number(e.target.value))}
                          className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:border-orange-500"
                          min="5"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-150">
                      <button
                        onClick={() => setEditingTaskId(null)}
                        className="px-3 py-1.5 border hover:bg-gray-50 text-[11px] font-semibold rounded-lg text-gray-500 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEditTask(task.id)}
                        className="px-3.5 py-1.5 bg-orange-500 text-white hover:bg-orange-600 text-[11px] font-bold rounded-lg flex items-center gap-1 shadow-sm"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  /* DISPLAY SUBTASK STATE */
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold sm:text-base ${task.status === 'rejected' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {task.title}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 border border-orange-100/50 px-2 py-0.5 rounded-full">
                          {task.estimatedMinutes} mins
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed max-w-3xl font-light">
                        {task.description}
                      </p>
                      
                      {task.scheduledStart && (
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500 font-semibold pt-1">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          Expected Slot: {new Date(task.scheduledStart).toLocaleDateString()} &bull; {new Date(task.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &rarr; {task.scheduledEnd ? new Date(task.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 self-end sm:self-start">
                      <button
                        onClick={() => startEditTask(task)}
                        disabled={task.status === 'rejected'}
                        className="p-1 px-2.5 border hover:border-gray-800 disabled:opacity-30 disabled:border-gray-100 border-gray-250 text-gray-600 hover:text-gray-900 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 bg-white"
                      >
                        <Edit3 className="h-3 w-3 text-gray-450" />
                        Edit
                      </button>
                      
                      <button
                        onClick={() => toggleTaskStatus(task.id)}
                        className={`p-1 px-2.5 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 border ${
                          task.status === 'rejected'
                            ? 'bg-orange-50/50 text-orange-700 hover:bg-orange-100/50 border-orange-105'
                            : 'border-yellow-200 text-gray-450 hover:text-red-500 hover:bg-red-50/50 hover:border-red-150'
                        }`}
                      >
                        {task.status === 'rejected' ? (
                          <>
                            <RotateCcw className="h-3 w-3" /> Include Slot
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-3 w-3" /> Exclude
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* DRAFTS TAB */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {session.artifacts.map((art) => (
              <div
                key={art.id}
                className={`p-5 border rounded-2xl flex flex-col justify-between shadow-xs transition-shadow duration-200 hover:shadow-xs ${
                  editingArtifactId === art.id ? 'border-orange-400 bg-orange-50/5' : 'border-gray-200 bg-white'
                }`}
              >
                {editingArtifactId === art.id ? (
                  /* EDITING ARTIFACT STATE */
                  <div className="space-y-3 flex-1 flex flex-col">
                    <div>
                      <label className="block text-[10px] font-mono text-gray-400 font-bold mb-1 uppercase">Title / Subject</label>
                      <input
                        type="text"
                        value={tempArtTitle}
                        onChange={(e) => setTempArtTitle(e.target.value)}
                        className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    {art.type === 'email' && (
                      <div>
                        <label className="block text-[10px] font-mono text-gray-400 font-bold mb-1 uppercase">Recipient</label>
                        <input
                          type="email"
                          value={tempArtRecipient}
                          onChange={(e) => setTempArtRecipient(e.target.value)}
                          className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:border-orange-500 font-mono"
                        />
                      </div>
                    )}

                    <div className="flex-1">
                      <label className="block text-[10px] font-mono text-gray-400 font-bold mb-1 uppercase">Body Content</label>
                      <textarea
                        value={tempArtContent}
                        onChange={(e) => setTempArtContent(e.target.value)}
                        className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:border-orange-500 min-h-[160px] font-mono"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <button
                        onClick={() => setEditingArtifactId(null)}
                        className="px-3 py-1.5 border hover:bg-gray-50 text-[10px] font-semibold rounded-lg text-gray-500"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEditArtifact(art.id)}
                        className="px-3.5 py-1.5 bg-orange-500 text-white hover:bg-orange-600 text-[10px] font-bold rounded-lg shadow-sm"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* DISPLAY ARTIFACT STATE */
                  <div className="space-y-4 flex flex-col justify-between h-full">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {art.type === 'email' ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md uppercase border border-blue-100/50">
                              Gmail Draft
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-md uppercase border border-emerald-100/50">
                              Google Doc
                            </span>
                          )}
                          <span className="text-[10px] font-bold font-mono text-gray-450 uppercase">
                            Preset Sketch
                          </span>
                        </div>
                        <button
                          onClick={() => startEditArtifact(art)}
                          className="text-[10px] font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 hover:border-gray-400 rounded-lg bg-white"
                        >
                          <Edit3 className="h-3 w-3 text-gray-450" /> Edit Template
                        </button>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-gray-800 leading-tight">
                          {art.title}
                        </h4>
                        {art.recipient && (
                          <div className="text-[10px] font-mono text-gray-450">
                            To: {art.recipient}
                          </div>
                        )}
                      </div>

                      <div className="bg-gray-50 rounded-xl p-4 font-mono text-xs text-gray-650 border border-gray-200 leading-relaxed max-h-[180px] overflow-y-auto select-all scrollbar-hide">
                        {art.content}
                      </div>
                    </div>

                    {art.status === 'created' && art.workspaceUrl && (
                      <a
                        href={art.workspaceUrl}
                        target="_blank"
                        rel="referrer noopener"
                        className="mt-2 text-[11px] font-bold text-gray-800 hover:text-orange-950 flex items-center gap-1 bg-gray-50 border border-gray-150 p-2 rounded-lg justify-center transition-all"
                      >
                        Open Published Workspace <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CONFIRM CONSTRAINTS POPUP (Human Clearance Gate) */}
      {showConfirmPopup && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-gray-100 p-6 space-y-4">
            <h3 className="font-display font-bold text-gray-950 text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-orange-500" />
              Approve and Commit Plan Details?
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed font-light">
              This action will publish exactly **{activeSubtasksCount} subtasks** directly as slots into Google Calendar, and generate customized documents outlines/drafts as authorized.
            </p>
            
            <div className="bg-gray-50 p-3 rounded-lg border text-[11px] text-gray-500 space-y-1 font-mono">
              <div>- Create Calendar Events: {activeSubtasksCount}</div>
              <div>- Google Docs Drafts: {session.artifacts.filter(a => a.type === 'doc').length}</div>
              <div>- Gmail Message Drafts: {session.artifacts.filter(a => a.type === 'email').length}</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirmPopup(false)}
                className="px-3.5 py-1.5 border hover:bg-gray-50 text-[11px] font-semibold rounded-lg text-gray-500"
              >
                No, Go Back
              </button>
              <button
                onClick={() => {
                  setShowConfirmPopup(false);
                  // Save habit tracking to localStorage if toggled on
                  if (isTracked) {
                    const key = 'lmls_past_sessions';
                    const existing = JSON.parse(localStorage.getItem(key) || '[]');
                    const entry = {
                      id: session.id,
                      goal: session.query,
                      date: session.targetDate,
                      timestamp: Date.now(),
                      tracked: true,
                      recurrence,
                    };
                    const updated = [entry, ...existing.filter((e: any) => e.id !== session.id)].slice(0, 5);
                    localStorage.setItem(key, JSON.stringify(updated));
                  }
                  onApprove();
                }}
                className="px-4 py-1.5 bg-orange-500 text-white hover:bg-orange-650 text-[11px] font-bold rounded-lg shadow-sm"
              >
                Confirm, and Execute!
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
