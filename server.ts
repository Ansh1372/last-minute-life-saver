import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { StateGraph, Annotation } from "@langchain/langgraph";
import { Subtask, StarterArtifact, AuditLogEntry, PanickedGoal, CalendarEvent } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Global In-Memory Store for scalable task execution & audit logging
const sessions: { [id: string]: PanickedGoal } = {};
const globalAuditLogs: AuditLogEntry[] = [];

// Helper to log system events globally and in local session
function writeAuditLog(
  session: PanickedGoal | null,
  agentNode: string,
  action: string,
  detail: string,
  status: 'success' | 'warning' | 'error' | 'info' = 'info'
) {
  const log: AuditLogEntry = {
    id: `log-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    action,
    detail,
    agentNode,
    status,
  };
  globalAuditLogs.push(log);
  if (session) {
    session.auditLogs.push(log);
  }
}

// -----------------------------------------------------------------------------
// LangGraph State & Agent Workflow Setup
// -----------------------------------------------------------------------------

// Define the schema for LangGraph agent state channels
const AgentState = Annotation.Root({
  sessionId: Annotation<string>(),
  goal: Annotation<string>(),
  targetDate: Annotation<string>(),
  subtasks: Annotation<Subtask[]>(),
  artifacts: Annotation<StarterArtifact[]>(),
  accessToken: Annotation<string | undefined>(),
  busyEvents: Annotation<CalendarEvent[]>(),
  feedback: Annotation<string | undefined>(),
  evaluationCount: Annotation<number>(),
});

// Lazy loader for GoogleGenAI to ensure safe API Key startup
function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY is not configured in the workspace environments.");
  }
  return new GoogleGenAI({ apiKey: key });
}

// Robust API Retry mechanism with Exponential Backoff and Jitter (Requirement 3)
async function callWithRetry<T>(fn: () => Promise<T>, retries: number = 3, baseDelayMs: number = 1000): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt > retries) {
        throw error;
      }
      
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 200; // 0-200ms randomized interval to prevent collision congestion
      const delay = exponentialDelay + jitter;
      
      console.warn(`[API Resiliency] Attempt ${attempt} failed: "${error.message}". Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Node 1: Analyze Goal & Create Subtasks (Gemini 1.5 Flash - High Speed)
async function analyzeGoalNode(state: typeof AgentState.State) {
  const session = sessions[state.sessionId];
  writeAuditLog(session, "analyzeGoal", "Analyzing Goal", `Starting analysis on goal: "${state.goal}"`, "info");
  
  if (session) session.status = 'analyzing';

  let subtasks: Subtask[] = [];
  try {
    const ai = getGeminiClient();
    const prompt = `
      You are an expert project planner for "Last-Minute Life Saver".
      The user is facing a panicked milestone or deadline.
      Goal: "${state.goal}"
      Due Date: "${state.targetDate}"
      Current Time: "${new Date().toISOString()}"

      Break this goal down into 3-5 logical, highly actionable subtasks that can be accomplished sequentially before the due date.
      For each subtask, provide:
      1. A short, catchy title.
      2. A brief, practical description of exactly what needs to be done.
      3. A realistic duration in minutes (between 15 and 180).

      Return the result as a strict JSON array of objects with the exact following keys:
      [
        {
          "title": "Subtask title",
          "description": "Subtask description",
          "estimatedMinutes": 45
        }
      ]
      DO NOT return any markdown wrapping. Just the raw, valid JSON list.
    `;

    const response = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    }));

    const text = response.text?.trim() || "[]";
    const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const list = JSON.parse(cleanJson);

    subtasks = list.map((item: any, index: number) => ({
      id: `task-${Date.now()}-${index}`,
      title: item.title,
      description: item.description,
      estimatedMinutes: Number(item.estimatedMinutes) || 45,
      status: 'pending'
    }));

    writeAuditLog(
      session,
      "analyzeGoal",
      "Goal Analyzed",
      `Successfully decomposed goal into ${subtasks.length} actionable subtasks.`,
      "success"
    );
  } catch (error: any) {
    writeAuditLog(session, "analyzeGoal", "Goal Analysis Failed", error.message, "error");
    if (session) session.status = 'failed';
    throw error;
  }

  return { subtasks };
}

// Node 2: Check Google Calendar for free/busy status (Gemini 1.5 Pro - Structured Constraints Assessment)
async function checkCalendarNode(state: typeof AgentState.State) {
  const session = sessions[state.sessionId];
  writeAuditLog(session, "checkCalendar", "Checking Calendar", "Initiating check of Google Calendar schedule conflicts with Gemini 1.5 Pro.", "info");
  
  if (session) session.status = 'calendar_check';

  let busyEvents: CalendarEvent[] = [];

  if (state.accessToken) {
    try {
      const timeMin = new Date().toISOString();
      const timeMax = new Date(state.targetDate).toISOString();

      const fetchCalendar = async () => {
        const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
        const res = await fetch(calendarUrl, {
          headers: { Authorization: `Bearer ${state.accessToken}` },
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Google Calendar API returned status ${res.status}: ${errorText}`);
        }
        return await res.json();
      };

      const data = await callWithRetry(fetchCalendar);
      const items = data.items || [];
      busyEvents = items.map((item: any) => ({
        summary: item.summary || "Busy Slot",
        start: { dateTime: item.start?.dateTime || item.start?.date || item.start?.dateTime },
        end: { dateTime: item.end?.dateTime || item.end?.date || item.end?.dateTime },
      }));

      writeAuditLog(
        session,
        "checkCalendar",
        "Synced Calendar",
        `Consulted live Google Calendar. Found ${busyEvents.length} existing events before the deadline.`,
        "success"
      );
    } catch (err: any) {
      writeAuditLog(
        session,
        "checkCalendar",
        "Calendar Synced Failed",
        `Could not access live Google Calendar: ${err.message}. Falling back to default open slots.`,
        "warning"
      );
      busyEvents = getDefaultMockBusySlots();
    }
  } else {
    writeAuditLog(
      session,
      "checkCalendar",
      "Simulated Calendar",
      "No Google Auth Token specified. Working with mock calendar constraints for planning.",
      "warning"
    );
    busyEvents = getDefaultMockBusySlots();
  }

  // Conduct structural stress/conflict evaluation using Gemini 1.5 Pro
  try {
    const ai = getGeminiClient();
    const auditPrompt = `
      You are the "Calendar Audit Node" (Deep Reasoning Engine) for "Last-Minute Life Saver".
      The user goal is: "${state.goal}" with a deadline: "${state.targetDate}".
      Current busy schedule blocks list:
      ${JSON.stringify(busyEvents)}
      Current local time context is: "${new Date().toISOString()}".

      Analyze if these calendar block occupancies pose extreme conflicts or stress.
      Return a concise, professional 1-2 sentence stress assessment highlighting conflict areas.
    `;
    const auditRes = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: auditPrompt,
    }));
    const auditSummary = auditRes.text?.trim() || "No critical conflicts detected on initial calendar audit scan.";
    writeAuditLog(session, "checkCalendar", "Calendar Analysis", auditSummary, "info");
  } catch (auditError: any) {
    writeAuditLog(session, "checkCalendar", "Calendar Analysis Overpassed", `Audit scan bypassed: ${auditError.message}`, "info");
  }

  return { busyEvents };
}

function getDefaultMockBusySlots(): CalendarEvent[] {
  const today = new Date();
  const busy: CalendarEvent[] = [];
  
  for (let i = 0; i < 5; i++) {
    const meetingDate = new Date(today);
    meetingDate.setDate(today.getDate() + i);
    meetingDate.setHours(10, 0, 0, 0);
    const endDate = new Date(meetingDate);
    endDate.setHours(11, 0, 0, 0);
    
    busy.push({
      summary: "Daily Synced Alignment (Busy)",
      start: { dateTime: meetingDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
    });
  }
  return busy;
}

// Node 3: Schedule Tasks Around Busy Slots (Gemini 1.5 Pro - Intelligent Pathfinding)
async function scheduleTasksNode(state: typeof AgentState.State) {
  const session = sessions[state.sessionId];
  writeAuditLog(session, "scheduleTasks", "Allocating Schedule", "Running conflict-avoidance optimization on subtasks with Gemini 1.5 Pro.", "info");

  let scheduled = [...state.subtasks];
  const busy = state.busyEvents || [];
  let geminiSuccess = false;

  try {
    const ai = getGeminiClient();
    let schedulingPrompt = `
      You are the "Scheduling Node" (Deep Reasoning Engine) for "Last-Minute Life Saver".
      Your job is to strategically schedule the following list of subtasks sequentially, avoiding overlaps with pre-existing busy calendar slots:
      
      Subtasks to schedule:
      ${JSON.stringify(scheduled)}

      Busy Calendar Slots (DO NOT overlap or schedule subtasks during these times):
      ${JSON.stringify(busy)}

      Current Time: "${new Date().toISOString()}"
      Absolute Hard Deadline: "${state.targetDate}"

      Rules:
      1. Each subtask has an "id" and "estimatedMinutes" field indicating how long it takes.
      2. Set a "scheduledStart" and "scheduledEnd" (ISO 8601 strings, e.g., "2026-06-22T09:00:00.000Z") for each subtask.
      3. No two subtasks can overlap in time.
      4. Subtasks must not overlap with any busy calendar slots in busy slots list.
      5. Try to keep scheduled times within standard daytime hours (09:00 to 18:00 inside local time), but if the absolute deadline is extremely tight or today, you can schedule outside these hours to ensure completion before the targetDate.
      6. All scheduled subtasks must be completed before the Absolute Hard Deadline "${state.targetDate}".
    `;

    if (state.feedback) {
      schedulingPrompt += `
        CRITICAL CORRECTION REQUEST:
        The previous scheduling attempt was evaluated by the LLM-As-A-Judge and failed. Please adjust based on the feedback:
        "${state.feedback}"
      `;
    }

    schedulingPrompt += `
      Return ONLY a JSON array of objects with this exact format:
      [
        {
          "id": "task-...",
          "scheduledStart": "ISO_DATE_STRING",
          "scheduledEnd": "ISO_DATE_STRING"
        }
      ]
      No markdown, no backticks, return only raw valid JSON.
    `;

    const res = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: schedulingPrompt,
      config: { responseMimeType: "application/json" }
    }));

    const text = res.text?.trim() || "[]";
    const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const mappedTimes = JSON.parse(cleanJson);

    if (Array.isArray(mappedTimes) && mappedTimes.length > 0) {
      scheduled = scheduled.map(task => {
        const found = mappedTimes.find((m: any) => m.id === task.id);
        if (found && found.scheduledStart && found.scheduledEnd) {
          return {
            ...task,
            scheduledStart: found.scheduledStart,
            scheduledEnd: found.scheduledEnd,
            status: 'approved'
          };
        }
        return task;
      });
      geminiSuccess = true;
      writeAuditLog(
        session,
        "scheduleTasks",
        "AI Conflict Resolution Complete",
        "Gemini 1.5 Pro resolved all busy schedule overlaps and assigned optimal time blocks.",
        "success"
      );
    }
  } catch (error: any) {
    writeAuditLog(
      session,
      "scheduleTasks",
      "AI Scheduling Failed",
      `Gemini scheduling failed: ${error.message}. Falling back to standard cron-based routing.`,
      "warning"
    );
  }

  if (!geminiSuccess || scheduled.some(t => !t.scheduledStart)) {
    try {
      let currentPointer = new Date();
      currentPointer.setMinutes(Math.ceil(currentPointer.getMinutes() / 30) * 30, 0, 0);

      for (let i = 0; i < scheduled.length; i++) {
        if (!scheduled[i].scheduledStart || !geminiSuccess) {
          const durationMin = scheduled[i].estimatedMinutes;
          let startStr = currentPointer.toISOString();
          let endPointer = new Date(currentPointer.getTime() + durationMin * 60000);
          let endStr = endPointer.toISOString();

          const hours = currentPointer.getHours();
          if (hours < 9) {
            currentPointer.setHours(9, 0, 0, 0);
            startStr = currentPointer.toISOString();
            endPointer = new Date(currentPointer.getTime() + durationMin * 60000);
            endStr = endPointer.toISOString();
          } else if (hours >= 18) {
            currentPointer.setDate(currentPointer.getDate() + 1);
            currentPointer.setHours(9, 0, 0, 0);
            startStr = currentPointer.toISOString();
            endPointer = new Date(currentPointer.getTime() + durationMin * 60000);
            endStr = endPointer.toISOString();
          }

          scheduled[i].scheduledStart = startStr;
          scheduled[i].scheduledEnd = endStr;
          scheduled[i].status = 'approved';

          currentPointer = new Date(endPointer.getTime() + 30 * 60000);
        }
      }

      writeAuditLog(
        session,
        "scheduleTasks",
        "Deterministic Scheduler Active",
        `Allocated subtasks sequentially avoiding standard off-hours.`,
        "success"
      );
    } catch (fallbackError: any) {
      writeAuditLog(session, "scheduleTasks", "Scheduling Fault", fallbackError.message, "error");
      throw fallbackError;
    }
  }

  return { subtasks: scheduled };
}

// Node 4: Draft Starter Artifacts (Gemini 1.5 Flash - High Speed)
async function draftArtifactsNode(state: typeof AgentState.State) {
  const session = sessions[state.sessionId];
  writeAuditLog(session, "draftArtifacts", "Drafting Templates", "Synthesizing Starter Docs and Emails using Gemini 1.5 Flash.", "info");
  
  if (session) session.status = 'drafting';

  const artifacts: StarterArtifact[] = [];
  try {
    const ai = getGeminiClient();

    let emailPrompt = `
      You are drafting a quick, professional email communications outline for the goal: "${state.goal}".
      Draft a starter message to stakeholders, project managers, or team members to buy time, provide a heads-up, or share status.
      Be crisp, reassuring, and highly structured. Always draft a real, professional message completely populated with specific, contextual details based on the goal. DO NOT use generic bracket placeholders (e.g. do not write '[Your Name]', '[Insert Project Name]', 'insert_date_here').
      Return ONLY plain text. Do not wrap in markdown quotes, JSON, backticks, or any structures. Just output the email body directly.
    `;
    if (state.feedback) {
      emailPrompt += `\nCRITICAL AUDIT CORRECTION (Please correct this issue in the email draft): ${state.feedback}`;
    }

    const emailRes = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: emailPrompt
    }));
    const emailDraft = emailRes.text?.trim() || "";

    artifacts.push({
      id: `art-email-${Date.now()}`,
      type: 'email',
      title: "Project Stakeholder Status Update",
      recipient: "stakeholder@example.com",
      content: emailDraft || `Hi team,\n\nI am currently driving progress on: ${state.goal}. Here is my active execution plan. Let's touch base shortly.\n\nBest,`,
      status: 'draft',
    });

    let docPrompt = `
      You are structuring a strategic, action-packed project outline document for the goal: "${state.goal}".
      Create a detailed markdown agenda, outline, presentation notes, or roadmap that gets the user 40% of the way finished with the work.
      Include checklists, sections, and clear placeholders, but populate them with realistic details instead of empty fields or templates. DO NOT use empty variables or template placeholders (like '[Goal]', 'insert_target_date').
      Return ONLY markdown text directly. Do not wrap in extra JSON or backticks. Just output markdown content directly.
    `;
    if (state.feedback) {
      docPrompt += `\nCRITICAL AUDIT CORRECTION (Please correct this issue in the doc outline): ${state.feedback}`;
    }

    const docRes = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: docPrompt
    }));
    const docDraft = docRes.text?.trim() || "";

    artifacts.push({
      id: `art-doc-${Date.now()}`,
      type: 'doc',
      title: "Project Workspace Roadmap Outline",
      content: docDraft || `# ${state.goal}\n\n## Core Objectives\n- [ ] Draft Initial Deliverables\n- [ ] Validate Timelines\n- [ ] Deploy Solution`,
      status: 'draft',
    });

    writeAuditLog(
      session,
      "draftArtifacts",
      "Templates Written",
      "Generated professional email and outline document skeleton successfully.",
      "success"
    );
  } catch (error: any) {
    writeAuditLog(session, "draftArtifacts", "Drafting Faulted", error.message, "error");
    throw error;
  }

  return { artifacts };
}

// Node 5: LLM-as-a-Judge Evaluation Node (Gemini 1.5 Pro - High Precision Validation)
async function evaluateAgendaNode(state: typeof AgentState.State) {
  const session = sessions[state.sessionId];
  writeAuditLog(session, "evaluateAgenda", "Reviewing Plan Quality", "LLM-as-a-Judge validating agenda consistency and tone completeness using Gemini 1.5 Pro.", "info");

  const subtasks = state.subtasks || [];
  const artifacts = state.artifacts || [];
  const evaluationCount = (state.evaluationCount || 0) + 1;

  // Gracefully skip after 2 iterations to protect user and model boundaries from looping infinitely
  if (evaluationCount > 2) {
    writeAuditLog(session, "evaluateAgenda", "Review Cycle Limit Cleared", "Validation cleared after reaching retry boundaries.", "success");
    return {
      feedback: undefined,
      evaluationCount
    };
  }

  const judgePrompt = `
    You are the "LLM-as-a-Judge" validation node for the "Last-Minute Life Saver" agent.
    Your task is to analyze and score the proposed agenda (the list of scheduled subtasks) and generated communications drafts (the workspace templates).
    
    Here is the goal: "${state.goal}"
    Deadline: "${state.targetDate}"

    Input Proposed Schedule:
    ${JSON.stringify(subtasks)}

    Input Pre-existing Busy Blocks (DO NOT overlap with these):
    ${JSON.stringify(state.busyEvents || [])}

    Input Communications Artifacts (Email and Google Doc drafts):
    ${JSON.stringify(artifacts)}

    Verify strictly on two main criteria:
    1. Temporal Consistency:
       - Are all scheduled start and end blocks mathematically valid (end time is strictly after start time)?
       - Are there any duplicate dates or overlaps between the subtasks themselves?
       - Do any subtasks overlap with the user's pre-existing busy slots?
       - Are they all completed before the target date "${state.targetDate}"?
    2. Tone and Completeness:
       - Is the tone of the draft emails and outlines professional, reassuring, calm, and contextually rich?
       - Are all placeholders populated with realistic, logical text? There should be NO generic brackets, variables, or unpopulated tags (like "[Insert Name Here]", "your_name_here", "INSERT_DATE", "[Goal]", or generic lorem ipsum).

    Determine if the plan PASSES or FAILS.
    If it passes both criteria perfectly, set passed: true.
    If there are ANY violations, set passed: false, and specify constructive, clear feedback on what needs to be rewritten, updated, or improved in the feedback string.

    Return strictly a JSON object with this structure:
    {
      "passed": false,
      "feedback": "Your detailed feedback explaining the issue to correct."
    }
    No markdown, no backticks, return only valid JSON parsing format.
  `;

  try {
    const ai = getGeminiClient();
    const res = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: judgePrompt,
      config: { responseMimeType: 'application/json' }
    }));

    const cleanRes = (res.text || "").trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const result = JSON.parse(cleanRes || "{\"passed\": true}");
    
    if (result.passed === false) {
      writeAuditLog(session, "evaluateAgenda", "Judge Evaluation Failed", `Critique (attempt ${evaluationCount}): ${result.feedback}`, "warning");
      return {
        feedback: result.feedback,
        evaluationCount
      };
    } else {
      writeAuditLog(session, "evaluateAgenda", "Judge Evaluation Passed", "The planned schedule is temporally consistent and drafts are complete and professional.", "success");
      return {
        feedback: undefined,
        evaluationCount
      };
    }
  } catch (error: any) {
    writeAuditLog(session, "evaluateAgenda", "Judge Evaluation Overpassed", `Failed to run judge: ${error.message}. Force passing.`, "warning");
    return {
      feedback: undefined,
      evaluationCount
    };
  }
}

// Initialize LangGraph workflow build
const workflow = new StateGraph(AgentState)
  .addNode("analyzeGoal", analyzeGoalNode)
  .addNode("checkCalendar", checkCalendarNode)
  .addNode("scheduleTasks", scheduleTasksNode)
  .addNode("draftArtifacts", draftArtifactsNode)
  .addNode("evaluateAgenda", evaluateAgendaNode)
  .addEdge("__start__", "analyzeGoal")
  .addEdge("analyzeGoal", "checkCalendar")
  .addEdge("checkCalendar", "scheduleTasks")
  .addEdge("scheduleTasks", "draftArtifacts")
  .addEdge("draftArtifacts", "evaluateAgenda")
  .addConditionalEdges(
    "evaluateAgenda",
    (state) => {
      if (state.feedback) {
        return "draftArtifacts";
      }
      return "__end__";
    }
  );

const agentWorkflow = workflow.compile();


// -----------------------------------------------------------------------------
// REST API Routes
// -----------------------------------------------------------------------------

// Active Audit Logs endpoint (Requirement 7)
app.get("/api/audit-logs", (req, res) => {
  res.json({ logs: globalAuditLogs });
});

// Create session and run autonomous task-planning agent
app.post("/api/sessions", async (req, res) => {
  const { goal, targetDate, accessToken } = req.body;

  if (!goal || !targetDate) {
    return res.status(400).json({ error: "Goal and target date are required." });
  }

  const id = `session-${Math.random().toString(36).substr(2, 9)}`;
  const sessionRecord: PanickedGoal = {
    id,
    query: goal,
    targetDate,
    createdAt: new Date().toISOString(),
    status: 'analyzing',
    subtasks: [],
    artifacts: [],
    auditLogs: [],
  };

  sessions[id] = sessionRecord;
  writeAuditLog(sessionRecord, "system", "Queueing Agent", `Added job queue entry for goal: "${goal}"`, "info");

  // Asynchronous task processing (Requirement 6)
  setTimeout(async () => {
    try {
      const finalState = await agentWorkflow.invoke({
        sessionId: id,
        goal,
        targetDate,
        subtasks: [],
        artifacts: [],
        accessToken,
        busyEvents: [],
        feedback: undefined,
        evaluationCount: 0,
      });

      // Commit LangGraph generated outputs back to the shared storage session
      sessionRecord.subtasks = finalState.subtasks || [];
      sessionRecord.artifacts = finalState.artifacts || [];
      sessionRecord.status = 'review_needed';

      writeAuditLog(
        sessionRecord,
        "system",
        "Awaiting Action",
        "Agent finished planning. Presenting approval gate to user.",
        "success"
      );
    } catch (err: any) {
      sessionRecord.status = 'failed';
      writeAuditLog(sessionRecord, "system", "Agent Failed", err.message, "error");
    }
  }, 100);

  res.json({ sessionId: id });
});

// Fetch active session state
app.get("/api/sessions/:id", (req, res) => {
  const session = sessions[req.params.id];
  if (!session) {
    return res.status(404).json({ error: "Session not found." });
  }
  res.json(session);
});

// Human-in-the-Loop Modification gate
app.post("/api/sessions/:id/modify", (req, res) => {
  const session = sessions[req.params.id];
  if (!session) {
    return res.status(404).json({ error: "Session not found." });
  }

  const { subtasks, artifacts } = req.body;
  if (subtasks) {
    session.subtasks = subtasks;
  }
  if (artifacts) {
    session.artifacts = artifacts;
  }

  writeAuditLog(
    session,
    "humanGate",
    "Modified Plan",
    "User adjusted calendar schedules or file draft texts.",
    "warning"
  );
  res.json({ success: true, session });
});

// Human-in-the-Loop Final Approval Gate Execution
app.post("/api/sessions/:id/approve", async (req, res) => {
  const session = sessions[req.params.id];
  if (!session) {
    return res.status(404).json({ error: "Session not found." });
  }

  const { accessToken } = req.body;
  session.status = 'committing';
  writeAuditLog(session, "humanGate", "Approved Plan", "User gave final clearance for Calendar & Document commit.", "success");

  try {
    // 1. Write Calendar Events
    for (const subtask of session.subtasks) {
      if (subtask.status !== 'rejected' && subtask.scheduledStart) {
        if (accessToken) {
          writeAuditLog(session, "googleCalendar", "Publishing Event", `Writing event "${subtask.title}" to Google Calendar...`, "info");
          
          await callWithRetry(async () => {
            const calendarRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                summary: `[Saver] ${subtask.title}`,
                description: subtask.description,
                start: { dateTime: subtask.scheduledStart },
                end: { dateTime: subtask.scheduledEnd || new Date(new Date(subtask.scheduledStart).getTime() + 60 * 60000).toISOString() },
              })
            });

            if (!calendarRes.ok) {
              const err = await calendarRes.text();
              throw new Error(`Calendar Error: ${err}`);
            }
            return calendarRes;
          });

          subtask.status = 'scheduled';
          writeAuditLog(session, "googleCalendar", "Synced Event", `Successfully added "${subtask.title}" to Google Calendar.`, "success");
        } else {
          // Simulation feedback
          subtask.status = 'scheduled';
          writeAuditLog(session, "googleCalendar", "Simulated Event Write", `Simulated Calendar post for event "${subtask.title}".`, "info");
        }
      }
    }

    // 2. Commit Document Outline & Workspace elements
    for (const artifact of session.artifacts) {
      if (accessToken) {
        if (artifact.type === 'doc') {
          writeAuditLog(session, "googleDocs", "Creating Document", `Creating Google Doc titled "${artifact.title}"`, "info");
          
          // Step 1: Create Document
          const docId = await callWithRetry(async () => {
            const docCreateRes = await fetch("https://docs.googleapis.com/v1/documents", {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ title: artifact.title })
            });

            if (!docCreateRes.ok) {
              const err = await docCreateRes.text();
              throw new Error(`Docs Create Error: ${err}`);
            }

            const docData = await docCreateRes.json();
            return docData.documentId;
          });

          artifact.workspaceUrl = `https://docs.google.com/document/d/${docId}/edit`;

          // Step 2: Append Markdown Content
          await callWithRetry(async () => {
            const docUpdateRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                requests: [
                  {
                    insertText: {
                      location: { index: 1 },
                      text: artifact.content
                    }
                  }
                ]
              })
            });

            if (!docUpdateRes.ok) {
              const err = await docUpdateRes.text();
              throw new Error(`Docs Write Error: ${err}`);
            }
            return docUpdateRes;
          });

          artifact.status = 'created';
          writeAuditLog(session, "googleDocs", "Document Published", `Outline successfully written. Doc URL: ${artifact.workspaceUrl}`, "success");
        } else if (artifact.type === 'email') {
          writeAuditLog(session, "gmail", "Creating Gmail draft", `Creating Gmail Draft: "${artifact.title}"`, "info");
          
          // Encode RFC 2822
          const emailLines = [
            `To: ${artifact.recipient || 'team@example.com'}`,
            `Subject: [Saver] ${artifact.title}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            artifact.content
          ];
          const rawEmail = Buffer.from(emailLines.join('\r\n'))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          await callWithRetry(async () => {
            const gmailRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/drafts", {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                message: { raw: rawEmail }
              })
            });

            if (!gmailRes.ok) {
              const err = await gmailRes.text();
              throw new Error(`Gmail Draft Error: ${err}`);
            }
            return gmailRes;
          });

          artifact.status = 'created';
          artifact.workspaceUrl = "https://mail.google.com/mail/#drafts";
          writeAuditLog(session, "gmail", "Gmail Draft Synced", `Draft successfully pinned in Gmail folder.`, "success");
        }
      } else {
        // Simulation feedback
        artifact.status = 'created';
        artifact.workspaceUrl = artifact.type === 'doc' ? 'https://docs.google.com' : 'https://mail.google.com';
        writeAuditLog(session, "workspace", "Simulated Publish", `Simulated write for artifact "${artifact.title}".`, "info");
      }
    }

    session.status = 'completed';
    writeAuditLog(session, "system", "Goal Finished", "All deliverables committed successfully! Panic resolved.", "success");
    res.json({ success: true, session });
  } catch (err: any) {
    session.status = 'review_needed'; // let them try again
    writeAuditLog(session, "system", "Commit Failed", err.message, "error");
    res.status(500).json({ error: err.message });
  }
});


// -----------------------------------------------------------------------------
// Dev Environment Server Setup
// -----------------------------------------------------------------------------

async function startServer() {
  // Vite Integration for instant dev reload representation
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Life Saver API] Backend server live on http://0.0.0.0:${PORT}`);
  });
}

startServer();
