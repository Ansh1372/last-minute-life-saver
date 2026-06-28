export interface Subtask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  scheduledStart?: string; // ISO date
  scheduledEnd?: string; // ISO date
  status: 'pending' | 'approved' | 'rejected' | 'scheduled';
  action?: 'insert' | 'delete';
}

export interface StarterArtifact {
  id: string;
  type: 'email' | 'doc';
  title: string;
  content: string; // Markdown or HTML
  recipient?: string; // for emails
  status: 'draft' | 'created' | 'sent';
  workspaceUrl?: string; // Links to final Doc/Gmail compose if actually written
}

export interface PanickedGoal {
  id: string;
  query: string;
  targetDate: string; // Needs to be completed by e.g. Friday
  createdAt: string;
  status: 'analyzing' | 'calendar_check' | 'drafting' | 'review_needed' | 'approved' | 'committing' | 'completed' | 'failed';
  subtasks: Subtask[];
  artifacts: StarterArtifact[];
  auditLogs: AuditLogEntry[];
  streamSteps?: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
  agentNode: string; // which LangGraph node executed it
  status: 'success' | 'warning' | 'error' | 'info';
}

export interface CalendarEvent {
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
}
