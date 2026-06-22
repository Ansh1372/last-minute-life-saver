import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getCachedToken, clearCachedToken, setCachedToken, TokenStatus, getOAuthUrl } from './auth';
import { PanickedGoal, Subtask, StarterArtifact, AuditLogEntry } from './types';
import Header from './components/Header';
import GoalIntake from './components/GoalIntake';
import PlanningProgress from './components/PlanningProgress';
import ApprovalGate from './components/ApprovalGate';
import AuditLogView from './components/AuditLogView';
import OAuthModal from './components/OAuthModal';
import { CheckCircle2, Clock, Calendar, ExternalLink, AlertTriangle, Play, CornerUpLeft, BookOpen, RefreshCw, Sparkles, HelpCircle } from 'lucide-react';

export default function App() {
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>({
    hasToken: false,
    accessToken: null,
    user: null,
  });
  const [session, setSession] = useState<PanickedGoal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [globalLogs, setGlobalLogs] = useState<AuditLogEntry[]>([]);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Google OAuth Hash Callback Parser
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Sync initial auth state from Cache
    setTokenStatus(getCachedToken());

    // Parse implicit grant hash params direct from Google popup/redirect
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const parsed = new URLSearchParams(hash.substring(1));
      const token = parsed.get('access_token');
      if (token) {
        setCachedToken(token, "ansh.workspace@gmail.com", "Ansh Sharma");
        setTokenStatus({
          hasToken: true,
          accessToken: token,
          user: {
            name: "Ansh Sharma",
            email: "ansh.workspace@gmail.com",
            photoURL: "https://api.dicebear.com/7.x/initials/svg?seed=Ansh"
          }
        });
        
        // Push secure audit log
        fetchLogs();
      }
    }
  }, []);

  // Fetch Global Auditor logs
  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/audit-logs");
      if (res.ok) {
        const data = await res.json();
        setGlobalLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to sync audit logs:", err);
    }
  };

  // Sync logs periodically
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // Polling helper for background asynchronous planning queue (Requirement 6)
  useEffect(() => {
    if (!session || ['completed', 'failed', 'review_needed'].includes(session.status)) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`);
        if (res.ok) {
          const updated = await res.json();
          setSession(updated);

          if (['completed', 'review_needed', 'failed'].includes(updated.status)) {
            setIsLoading(false);
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Poller issue:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [session?.id, session?.status]);


  // ---------------------------------------------------------------------------
  // Core API Trigger Handlers
  // ---------------------------------------------------------------------------
  const handleStartPlanning = async (goal: string, date: string) => {
    setIsLoading(true);
    setSession(null);

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          targetDate: date,
          accessToken: tokenStatus.accessToken,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const initialSession: PanickedGoal = {
          id: data.sessionId,
          query: goal,
          targetDate: date,
          createdAt: new Date().toISOString(),
          status: 'analyzing',
          subtasks: [],
          artifacts: [],
          auditLogs: [],
        };
        setSession(initialSession);
      } else {
        throw new Error("Failed to queue task planning session on server.");
      }
    } catch (err) {
      alert("Error triggering LangGraph planning agent.");
      setIsLoading(false);
    }
  };

  const handlePlanModify = async (subtasks: Subtask[], artifacts: StarterArtifact[]) => {
    if (!session) return;

    // Optimistically update local state for snappy UX
    setSession({ ...session, subtasks, artifacts });

    try {
      await fetch(`/api/sessions/${session.id}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtasks, artifacts }),
      });
    } catch (err) {
      console.error("Failed to persist modifications:", err);
    }
  };

  const handlePlanApprove = async () => {
    if (!session) return;
    setIsCommitting(true);

    try {
      const res = await fetch(`/api/sessions/${session.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: tokenStatus.accessToken }),
      });

      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Execution clearance issue.");
      }
    } catch (err: any) {
      alert(`Commit error: ${err.message}`);
    } finally {
      setIsCommitting(false);
      fetchLogs();
    }
  };

  const handleClearAuth = () => {
    clearCachedToken();
    setTokenStatus({ hasToken: false, accessToken: null, user: null });
  };

  const resetDashboard = () => {
    setSession(null);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50/60 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* Structural Header */}
      <Header
        tokenStatus={tokenStatus}
        onOpenAuth={() => setAuthModalOpen(true)}
        onClearAuth={handleClearAuth}
        showAuditLogs={showAuditLogs}
        setShowAuditLogs={setShowAuditLogs}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        
        {/* Banner/Intro */}
        <section id="introduction-banner" className="bg-white border border-gray-150 p-8 rounded-3xl relative overflow-hidden shadow-xs">
          {/* Subtle Ambient Background Mesh */}
          <div className="absolute inset-0 bg-radial from-gray-50/10 via-white to-white opacity-90 z-0"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2.5 max-w-2xl">
              <span className="text-[9px] font-bold font-mono uppercase bg-orange-105 text-orange-800 px-3 py-1 rounded-full border border-orange-200 tracking-wider">
                ⚡ Salvaging Panicked Situations
              </span>
              <h2 className="font-display font-semibold text-gray-950 text-2xl tracking-tight">
                Instantly turn crisis & panic into a clear calendar schedule.
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed font-light font-sans">
                Our autonomous LangGraph planning coordinator analyzes deadline goals, checks your calendar for busy times, structures task lists, and automatically drafts communication files—then hands you full control before anything is written.
              </p>
            </div>

            {!tokenStatus.hasToken && (
              <div className="bg-gray-50 border border-gray-200 p-5 rounded-2xl max-w-sm space-y-2.5 shrink-0 shadow-xs">
                <span className="block text-[9px] font-bold font-mono uppercase text-orange-650">
                  ⚠️ Workspace Access Disabled
                </span>
                <p className="text-[11px] text-gray-400 leading-relaxed font-light">
                  Connect Google Workspace to safely export planning events, file document outlines, and structure real drafts recursively.
                </p>
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all w-full flex items-center justify-center gap-1.5 shadow-md shadow-orange-100 active:scale-[0.98]"
                >
                  Connect Access Account
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Dynamic Transition States Grid */}
        <div className="grid grid-cols-1 gap-8">
          
          <AnimatePresence mode="wait">
            {!session ? (
              /* INTAKE PANEL FORM STATE */
              <motion.div
                key="intake"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
              >
                <GoalIntake onSubmit={handleStartPlanning} isLoading={isLoading} />
              </motion.div>
            ) : ['analyzing', 'calendar_check', 'drafting'].includes(session.status) ? (
              /* PLANS PROGRESS MONITORING STATE */
              <motion.div
                key="progress"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
              >
                <PlanningProgress session={session} />
              </motion.div>
            ) : session.status === 'review_needed' ? (
              /* APPROVAL GATE STAGE */
              <motion.div
                key="gate"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
              >
                <ApprovalGate
                  session={session}
                  accessToken={tokenStatus.accessToken}
                  onModify={handlePlanModify}
                  onApprove={handlePlanApprove}
                  isCommitting={isCommitting}
                />
              </motion.div>
            ) : session.status === 'completed' ? (
              /* COMPLETED / SUCCESS SCREEN STATE */
              <motion.div
                key="completed"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-3xl border-2 border-orange-250 p-8 shadow-md flex flex-col items-center text-center max-w-2xl mx-auto space-y-6"
              >
                <div className="h-14 w-14 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div className="space-y-2">
                  <h3 className="font-display font-bold text-gray-900 text-xl">
                    Deliverables Composed Successfully!
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed max-w-md font-light font-sans">
                    The agent finished its commit operations. Subtasks have been linked as slots into Google Calendar, and template outlines were written dynamically.
                  </p>
                </div>

                {/* Shortcuts Grid */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                  <a
                    href="https://calendar.google.com"
                    target="_blank"
                    rel="referrer noopener"
                    className="p-4 border border-gray-200 rounded-2xl hover:border-orange-500 hover:bg-orange-50/5 transition-colors bg-gray-50/50 flex flex-col items-center gap-1.5"
                  >
                    <Calendar className="h-5 w-5 text-gray-800" />
                    <span className="text-xs font-bold text-gray-950">Google Calendar</span>
                    <span className="text-[10px] text-gray-450">Review Slots</span>
                  </a>

                  {session.artifacts.map((art) => (
                    <a
                      key={art.id}
                      href={art.workspaceUrl || "#"}
                      target="_blank"
                      rel="referrer noopener"
                      className="p-4 border border-gray-200 rounded-2xl hover:border-orange-500 hover:bg-orange-50/5 transition-colors bg-gray-50/50 flex flex-col items-center gap-1.5"
                    >
                      <Clock className="h-5 w-5 text-gray-800" />
                      <span className="text-xs font-bold text-gray-950 truncate max-w-[130px]">
                        {art.type === 'email' ? 'Gmail Folder' : 'Google Doc'}
                      </span>
                      <span className="text-[10px] text-gray-450 truncate">
                        {art.type === 'email' ? 'Open Drafts' : 'Open Sketch'}
                      </span>
                    </a>
                  ))}
                </div>

                <div className="pt-4 border-t border-gray-100 w-full flex justify-center">
                  <button
                    onClick={resetDashboard}
                    className="bg-orange-500 text-white hover:bg-orange-600 text-xs font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2 shadow-md shadow-orange-100"
                  >
                    <CornerUpLeft className="h-4 w-4" />
                    Deconstruct Another Emergency Goal
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Collapsible System audit logging */}
          {showAuditLogs && (
            <div id="system-auditors">
              <AuditLogView logs={globalLogs} onRefresh={fetchLogs} />
            </div>
          )}

        </div>
      </main>

      {/* Global OAuth Configuration Portal */}
      <OAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(token) => {
          setTokenStatus({
            hasToken: true,
            accessToken: token,
            user: {
              name: "Ansh Sharma",
              email: "ansh.workspace@gmail.com",
              photoURL: "https://api.dicebear.com/7.x/initials/svg?seed=Ansh"
            }
          });
          fetchLogs();
        }}
      />

      <footer className="py-8 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-400">
          <span>Last-Minute Life Saver © 2026</span>
          <div className="flex items-center gap-2">
            <span>Server: Stable</span>
            <span>•</span>
            <span>Engine: LangGraph TS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
