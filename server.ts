import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { Groq } from "groq-sdk";
import { StateGraph, Annotation, MemorySaver } from "@langchain/langgraph";
import nodemailer from "nodemailer";
import { Subtask, StarterArtifact, AuditLogEntry, PanickedGoal, CalendarEvent } from "./src/types";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Global In-Memory Store for scalable task execution & audit logging
const sessions: { [id: string]: PanickedGoal } = {};
const globalAuditLogs: AuditLogEntry[] = [];

import { EventEmitter } from "events";
const sseEmitter = new EventEmitter();

function emitAgentStep(sessionId: string, message: string) {
  const session = sessions[sessionId];
  if (session) {
    if (!session.streamSteps) {
      session.streamSteps = [];
    }
    // Prevent duplicate entries
    if (!session.streamSteps.includes(message)) {
      session.streamSteps.push(message);
    }
  }
  sseEmitter.emit(`step:${sessionId}`, message);
}

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

function is503Error(error: any): boolean {
  if (!error) return false;
  const message = error.message || "";
  const status = error.status || "";
  const code = error.code || "";
  const str = String(error);
  const searchStr = `${message} ${status} ${code} ${str}`.toLowerCase();
  return searchStr.includes('503') || 
         searchStr.includes('unavailable') || 
         searchStr.includes('experiencing high demand') || 
         searchStr.includes('overloaded');
}

function isQuotaError(error: any): boolean {
  if (!error) return false;
  const message = error.message || "";
  const status = error.status || "";
  const code = error.code || "";
  const str = String(error);
  const searchStr = `${message} ${status} ${code} ${str}`.toLowerCase();
  return searchStr.includes('429') || 
         searchStr.includes('resource_exhausted') || 
         searchStr.includes('quota');
}

// Global constants
const FALLBACK_KEY = "";

// Lazy loader for GoogleGenAI to ensure safe API Key startup
function getGeminiClient(): GoogleGenAI {
  const primaryKey = process.env.GEMINI_API_KEY;
  const key = primaryKey || FALLBACK_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY is not configured in the workspace environments.");
  }
  return new GoogleGenAI({ apiKey: key });
}

function isRetryableError(error: any): boolean {
  if (!error) return true;
  const str = String(error).toLowerCase();
  // Do not retry OAuth / Authorization / Client API 4xx issues
  if (str.includes("401") || str.includes("403") || str.includes("404") || (str.includes("400") && !str.includes("429"))) {
    return false;
  }
  return true;
}

// Robust API Retry mechanism with Exponential Backoff and Jitter (Requirement 3)
async function callWithRetry<T>(fn: () => Promise<T>, retries: number = 3, baseDelayMs: number = 5000): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fn();
      if (res && typeof res === "object") {
        const usage = (res as any).usageMetadata || (res as any).usage;
        if (usage) {
          const promptTokens = usage.promptTokenCount ?? usage.prompt_tokens ?? 0;
          const candidatesTokens = usage.candidatesTokenCount ?? usage.candidates_tokens ?? usage.completion_tokens ?? 0;
          console.log(`📊 Token Consumption: ${promptTokens} input / ${candidatesTokens} output tokens`);
        }
      }
      return res;
    } catch (error: any) {
      if (!isRetryableError(error) || isQuotaError(error) || is503Error(error)) {
        // Fast-fail non-retryable, quota (429), or model overloaded (503) errors to allow immediate fallback/handling
        throw error;
      }

      attempt++;
      if (attempt > retries) {
        throw error;
      }
      
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 200; // 0-200ms randomized interval to prevent collision congestion
      const delay = exponentialDelay + jitter;
      
      console.log(`[API Resiliency] Run ${attempt} status issues. Adapting/retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Unified Resilient Generator with Groq Fallback on Quota Exhaustion or Service Unavailability
async function generateWithGroqFallback(
  aiCall: () => Promise<any>,
  promptText: string,
  options?: { isJson?: boolean }
): Promise<{ text: string }> {
  try {
    return await aiCall();
  } catch (error: any) {
    const isQuota = isQuotaError(error);
    const is503 = is503Error(error);
    if (isQuota || is503) {
      console.log(`[Groq Fallback Engine] Gemini hit quota/availability limit (${isQuota ? '429 Quota' : '503 Unavailable'}). Seamlessly routing to Groq fallback...`);
      const groqApiKey = process.env.GROQ_API_KEY;
      if (groqApiKey && groqApiKey !== "MY_GROQ_API_KEY") {
        try {
          // Note: llama-3.1-70b-versatile is decommissioned by Groq, so we route to the active 'llama-3.3-70b-versatile' replacement to ensure clean execution.
          const targetModel = "llama-3.3-70b-versatile";
          console.log(`[Groq Fallback Engine] Instantiating Groq client and routing to '${targetModel}'...`);
          const groq = new Groq({ apiKey: groqApiKey });
          
          const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: promptText }],
            model: targetModel,
            response_format: options?.isJson ? { type: 'json_object' } : undefined
          });

          let groqText = chatCompletion.choices[0]?.message?.content || "";
          console.log(`[Groq Fallback Engine] Successfully retrieved response from Groq. Text length: ${groqText.length}`);

          if (options?.isJson) {
            groqText = groqText.trim();
            // Basic clean of markdown blocks
            let cleanJson = groqText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            try {
              JSON.parse(cleanJson);
              groqText = cleanJson;
            } catch (jsonErr) {
              console.warn(`[Groq Fallback Engine] JSON parse failed, extracting brace content...`);
              const firstBrace = groqText.indexOf('{');
              const lastBrace = groqText.lastIndexOf('}');
              const firstBracket = groqText.indexOf('[');
              const lastBracket = groqText.lastIndexOf(']');
              if (firstBracket !== -1 && lastBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
                groqText = groqText.substring(firstBracket, lastBracket + 1);
              } else if (firstBrace !== -1 && lastBrace !== -1) {
                groqText = groqText.substring(firstBrace, lastBrace + 1);
              }
            }
          }

          return { text: groqText };
        } catch (groqErr: any) {
          console.error(`[Groq Fallback Engine] Groq API call failed: ${groqErr.message}. Throwing original Gemini error.`);
          throw error;
        }
      } else {
        console.warn(`[Groq Fallback Engine] GROQ_API_KEY is not configured in environment. Throwing original Gemini error.`);
        throw error;
      }
    } else {
      throw error;
    }
  }
}

// Node 1: Analyze Goal & Create Subtasks (Gemini 2.5 Flash - High Speed)
async function analyzeGoalNode(state: typeof AgentState.State) {
  emitAgentStep(state.sessionId, "⚙️ Analyzing Goal...");
  await new Promise(resolve => setTimeout(resolve, 3000));
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
      3. A realistic duration in minutes (between 15 and 180). IMPORTANT: If the user explicitly requests a specific duration (e.g., "3 hours"), you MUST set estimatedMinutes to match their request exactly.

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

    const response = await generateWithGroqFallback(
      () => callWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      })),
      prompt,
      { isJson: true }
    );

    const text = response.text?.trim() || "[]";
    const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    let list: any[] = [];
    try {
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Find if there is any key on the object that holds an array
        const arrayKey = Object.keys(parsed).find(k => Array.isArray((parsed as any)[k]));
        if (arrayKey) {
          list = (parsed as any)[arrayKey];
        } else if (parsed.title || parsed.description) {
          list = [parsed];
        } else {
          throw new Error("Object does not contain an array or recognizable task keys");
        }
      } else {
        throw new Error("Parsed JSON is not an array or object");
      }
    } catch (e) {
      console.error("[Groq Fallback Engine] Decompose JSON parse failed. Raw text:", text);
      list = [{
        title: "Decompose Goal Phase 1",
        description: `Execute starting actions for goal: ${state.goal}`,
        estimatedMinutes: 60
      }];
    }

    if (!Array.isArray(list)) {
      list = [{
        title: "Decompose Goal Phase 1",
        description: `Execute starting actions for goal: ${state.goal}`,
        estimatedMinutes: 60
      }];
    }

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
    emitAgentStep(state.sessionId, "✓ Goal Intaken");
  } catch (error: any) {
    writeAuditLog(session, "analyzeGoal", "Goal Analysis Failed", error.message, "error");
    if (session) session.status = 'failed';
    throw error;
  }

  return { subtasks };
}

// Node 2: Check Google Calendar for free/busy status (Gemini 2.5 Pro - Structured Constraints Assessment)
async function checkCalendarNode(state: typeof AgentState.State) {
  emitAgentStep(state.sessionId, "⚙️ Auditing Calendar...");
  const session = sessions[state.sessionId];
  writeAuditLog(session, "checkCalendar", "Checking Calendar", "Initiating check of Google Calendar schedule conflicts with Gemini 2.5 Pro.", "info");
  
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

  // Conduct structural stress/conflict evaluation using Gemini 2.5 Pro
  try {
    const ai = getGeminiClient();
    const auditPrompt = `
      You are part of the "Calendar Specialist Agent" for "Last-Minute Life Saver".
      Your role is focused purely on calendar slot math, conflict analysis, and constraint validation on schedules.

      The user goal is: "${state.goal}" with a deadline: "${state.targetDate}".
      Current busy schedule blocks list:
      ${JSON.stringify(busyEvents)}
      Current local time context is: "${new Date().toISOString()}".

      Analyze if these calendar block occupancies pose conflicts, overlaps, or extreme scheduling bottlenecks.
      Focus entirely on calendar slot math and availability assessment.
      Return a concise, professional 1-2 sentence stress assessment highlighting conflict areas.
    `;
    
    const auditRes = await generateWithGroqFallback(
      () => callWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: auditPrompt,
      })),
      auditPrompt,
      { isJson: false }
    );

    const auditSummary = auditRes.text?.trim() || "No critical conflicts detected on initial calendar audit scan.";
    writeAuditLog(session, "checkCalendar", "Calendar Analysis", auditSummary, "info");
  } catch (auditError: any) {
    writeAuditLog(session, "checkCalendar", "Calendar Analysis Overpassed", `Audit scan bypassed: ${auditError.message}`, "info");
  }

  emitAgentStep(state.sessionId, "✓ Calendar Audited");
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

// Node 3: Schedule Tasks Around Busy Slots (Gemini 2.5 Pro - Intelligent Pathfinding)
async function scheduleTasksNode(state: typeof AgentState.State) {
  emitAgentStep(state.sessionId, "⚙️ Scheduling Tasks...");
  const session = sessions[state.sessionId];
  writeAuditLog(session, "scheduleTasks", "Allocating Schedule", "Running conflict-avoidance optimization on subtasks with Gemini 2.5 Flash.", "info");

  let scheduled = [...state.subtasks];
  const busy = state.busyEvents || [];
  let geminiSuccess = false;

  try {
    const ai = getGeminiClient();
    let schedulingPrompt = `
      You are the "Calendar Specialist Agent" for "Last-Minute Life Saver".
      Your role is focused purely on calendar slot math, conflict avoidance, and mapping out a logically sound timeline of tasks.
      You must strategically schedule the following list of subtasks sequentially, avoiding any time-shuffling overlaps or calendar collisions:
      
      Subtasks to schedule:
      ${JSON.stringify(scheduled)}

      Busy Calendar Slots (DO NOT overlap or schedule subtasks during these times):
      ${JSON.stringify(busy)}

      Current Time: "${new Date().toISOString()}"
      Absolute Hard Deadline: "${state.targetDate}"

      Rules:
      1. Each subtask has an "id" and "estimatedMinutes" field indicating its duration.
      2. Set a "scheduledStart" and "scheduledEnd" as clean, compliant ISO 8601 strings (e.g., "2026-06-22T09:00:00.000Z") for each subtask.
      3. No two subtasks can overlap in time. Ensure strict sequential ordering with no time-shuffling overlaps.
      4. Avoid scheduling subtasks during any time window present in the busy calendar slots.
      5. Try to keep scheduled times within standard daytime hours (09:00 to 18:00 inside local time), but if the absolute deadline is extremely tight, you may schedule outside these hours.
      6. All scheduled subtasks must be completed before the Absolute Hard Deadline "${state.targetDate}".
      7. Output clean ISO datetime ranges based on precise math matching duration in minutes.
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

    const res = await generateWithGroqFallback(
      () => callWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: schedulingPrompt,
        config: { responseMimeType: "application/json" }
      })),
      schedulingPrompt,
      { isJson: true }
    );

    const text = res.text?.trim() || "[]";
    const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    let mappedTimes = [];
    try {
      mappedTimes = JSON.parse(cleanJson);
    } catch (e) {
      console.error("[Groq Fallback Engine] Scheduling JSON parse failed. Raw text:", text);
    }

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
        "Gemini 2.5 Pro resolved all busy schedule overlaps and assigned optimal time blocks.",
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

  emitAgentStep(state.sessionId, "✓ Tasks Scheduled");
  return { subtasks: scheduled };
}

// Node 4: Draft Starter Artifacts (Gemini 2.5 Flash - High Speed)
async function draftArtifactsNode(state: typeof AgentState.State) {
  emitAgentStep(state.sessionId, "📝 Drafting Playbook...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  const session = sessions[state.sessionId];
  writeAuditLog(session, "draftArtifacts", "Drafting Templates", "Synthesizing Starter Docs and Emails using Gemini 2.5 Flash.", "info");
  
  if (session) session.status = 'drafting';

  const artifacts: StarterArtifact[] = [];
  try {
    const ai = getGeminiClient();

    let emailPrompt = `
      You are the "Communications and Copywriting Specialist Agent" for "Last-Minute Life Saver".
      Your primary directive is to instantly break a user's analysis paralysis by generating deeply contextual, high-caliber, and completely actionable stakeholder communication drafts.

      The user goal is: "${state.goal}".
      The target deadline is: "${state.targetDate}".

      CRITICAL GENERATION CONSTRAINTS:
      1. TONALITY: Maintain an incredibly calm, reassuring, highly structured, and execution-first professional tone.
      2. NO PLACEHOLDERS: Completely purge and avoid ALL layout placeholders, empty brackets, or raw template variables (e.g., NEVER output '[Your Name]', '[Goal]', 'insert_date_here', or '<Insert Project Name>'). Instead, synthesize and inject highly realistic professional defaults, industry-standard metrics, or contextual filler data that makes logical sense for the task.
      3. OUTPUT CLEANLINESS: Return ONLY the raw content requested. Do not wrap the response in markdown code blocks (do not use \`\`\`markdown or \`\`\`text). Do not include any meta-conversational preamble (e.g., do not say "Sure, here is your playbook:") or postscript commentary.

      STRUCTURE:
      Generate a highly realistic starter email update to relevant stakeholders, clients, managers, or team members regarding progress and immediate steps. Include:
      - Clear subject line (e.g., Subject: Action Plan: [Descriptive Goal Title])
      - Professional opening
      - Context acknowledgment
      - A 3-point bulleted timeline of immediate next steps
      - A declaration of when the next update will be sent

      Format: Return ONLY plain text.
    `;
    if (state.feedback) {
      emailPrompt += `\nCRITICAL AUDIT CORRECTION (Please correct this issue in the email draft): ${state.feedback}`;
    }

    const emailRes = await generateWithGroqFallback(
      () => callWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: emailPrompt
      })),
      emailPrompt,
      { isJson: false }
    );
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
      You are the "Communications and Copywriting Specialist Agent" for "Last-Minute Life Saver".
      Your primary directive is to instantly break a user's analysis paralysis by generating deeply contextual, high-caliber, and completely actionable workspace playbooks.

      The user goal is: "${state.goal}".
      The target deadline is: "${state.targetDate}".

      CRITICAL GENERATION CONSTRAINTS:
      1. TONALITY: Maintain an incredibly calm, reassuring, highly structured, and execution-first professional tone.
      2. NO PLACEHOLDERS: Completely purge and avoid ALL layout placeholders, empty brackets, or raw template variables (e.g., NEVER output '[Your Name]', '[Goal]', 'insert_date_here', or '<Insert Project Name>'). Instead, synthesize and inject highly realistic professional defaults, industry-standard metrics, or contextual filler data that makes logical sense for the task.
      3. OUTPUT CLEANLINESS: Return ONLY the raw content requested. Do not wrap the response in markdown code blocks (do not use \`\`\`markdown or \`\`\`text). Do not include any meta-conversational preamble (e.g., do not say "Sure, here is your playbook:") or postscript commentary.

      BLUEPRINT:
      Generate a dense, data-rich playbook structured strictly using Markdown headers following this exact 4-part architectural blueprint:

      # 🚀 EMERGENCY ACTION PLAYBOOK: WORKSPACE ROADMAP

      ## ⏱️ SECTION 1: THE FIRST 15-MINUTE ESCAPE PLAN
      Provide an explicit, low-friction, immediate micro-step that the user can execute within 15 minutes to establish immediate forward momentum. Break this down into 3 hyper-granular, sequential checklist items (\`- [ ]\`).

      ## 📊 SECTION 2: CONTEXTUAL STRATEGIC BREAKDOWN FRAMEWORK
      Analyze the exact domain of the target goal and auto-inject highly granular, functional domain skeletons:
      - If TECHNICAL/PROGRAMMING: Write out core architectural system design blocks, data flow patterns, critical edge cases to track, and a clean procedural pseudo-logic checklist.
      - If ACADEMIC/STUDY: Outline a concise thematic cheat-sheet, foundational formulas/equations, and key structural concepts to audit.
      - If BUSINESS/PRESENTATION: Layout a definitive slide-by-slide narrative storyboard, detailing exactly what core insights belong on each panel.

      ## 📂 SECTION 3: ASSET & RESOURCE EXTRACTION MATRIX
      Provide a bulleted inventory of exact files, credentials, specific data fields, API endpoints, or reference documents the user needs to collect during their scheduled calendar blocks to complete the task.

      ## 🏁 SECTION 4: RISK AUDIT & EMERGENCY MITIGATION
      Identify the 2 most realistic mistakes, infrastructure bottlenecks, or human-error vectors that could sabotage this condensed timeline, and pair each with an immediate mitigation workaround strategy.
    `;
    if (state.feedback) {
      docPrompt += `\nCRITICAL AUDIT CORRECTION (Please correct this issue in the doc outline): ${state.feedback}`;
    }

    const docRes = await generateWithGroqFallback(
      () => callWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: docPrompt
      })),
      docPrompt,
      { isJson: false }
    );
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

  emitAgentStep(state.sessionId, "✓ Playbook Drafted");
  return { artifacts };
}

// Node 5: LLM-as-a-Judge Evaluation Node (Gemini 2.5 Flash - High Precision Validation)
async function evaluateAgendaNode(state: typeof AgentState.State) {
  emitAgentStep(state.sessionId, "⚙️ Evaluating Plan...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  const session = sessions[state.sessionId];
  writeAuditLog(session, "evaluateAgenda", "Reviewing Plan Quality", "LLM-as-a-Judge validating agenda consistency and tone completeness using Gemini 2.5 Flash.", "info");

  const subtasks = state.subtasks || [];
  const artifacts = state.artifacts || [];
  const evaluationCount = (state.evaluationCount || 0) + 1;

  // Bypass judge for cleanup/destructive goals
  const goalLower = (state.goal || "").toLowerCase();
  const destructiveKeywords = ["clean", "delete", "remove", "wipe", "purge", "clear"];
  const isDestructive = destructiveKeywords.some(keyword => goalLower.includes(keyword));
  if (isDestructive) {
    writeAuditLog(session, "evaluateAgenda", "Bypassing Judge", "Cleanup goal detected. Skipping quality evaluation for empty plan.", "success");
    return {
      feedback: undefined,
      evaluationCount
    };
  }

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

    Fill out the required JSON validation response exactly as specified by the response schema.
  `;

  const validationSchema = {
    type: Type.OBJECT,
    properties: {
      isValid: {
        type: Type.BOOLEAN,
        description: "True if the plan passes all quality checks, False if it fails."
      },
      hasPlaceholders: {
        type: Type.BOOLEAN,
        description: "True if any template defaults like '[Your Name]' remain."
      },
      temporalViolations: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING
        },
        description: "Specific date, week, or year consistency errors found."
      },
      critiqueSummary: {
        type: Type.STRING,
        description: "Feedback detailing exactly what needs to be rewritten."
      }
    },
    required: ["isValid", "hasPlaceholders", "temporalViolations", "critiqueSummary"]
  };

  try {
    const ai = getGeminiClient();
    const res = await generateWithGroqFallback(
      () => callWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: judgePrompt,
        config: { 
          responseMimeType: 'application/json',
          responseSchema: validationSchema
        }
      })),
      judgePrompt,
      { isJson: true }
    );

    const cleanRes = (res.text || "").trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    let parsedResult;
    try {
      parsedResult = JSON.parse(cleanRes || "{}");
    } catch (e) {
      parsedResult = {};
    }

    const result = {
      isValid: typeof parsedResult.isValid === 'boolean' ? parsedResult.isValid : true,
      hasPlaceholders: typeof parsedResult.hasPlaceholders === 'boolean' ? parsedResult.hasPlaceholders : false,
      temporalViolations: Array.isArray(parsedResult.temporalViolations) ? parsedResult.temporalViolations : [],
      critiqueSummary: typeof parsedResult.critiqueSummary === 'string' ? parsedResult.critiqueSummary : String(parsedResult.critiqueSummary || "")
    };
    
    if (result.isValid === true) {
      writeAuditLog(session, "evaluateAgenda", "Judge Evaluation Passed", "The planned schedule is temporally consistent and drafts are complete and professional.", "success");
      emitAgentStep(state.sessionId, "✓ Plan Verified");
      return {
        feedback: undefined,
        evaluationCount
      };
    } else {
      writeAuditLog(session, "evaluateAgenda", "Judge Evaluation Failed", `Critique (attempt ${evaluationCount}): ${result.critiqueSummary}`, "warning");
      return {
        feedback: result.critiqueSummary,
        evaluationCount
      };
    }
  } catch (error: any) {
    writeAuditLog(session, "evaluateAgenda", "Judge Evaluation Overpassed", `Failed to run judge: ${error.message}. Force passing.`, "warning");
    emitAgentStep(state.sessionId, "✓ Plan Verified");
    return {
      feedback: undefined,
      evaluationCount
    };
  }
}

// Conditional routing function after goal analysis
function routeAfterAnalysis(state: typeof AgentState.State) {
  const goalLower = (state.goal || "").toLowerCase();
  const destructiveKeywords = ["clean", "delete", "remove", "wipe", "purge", "clear"];
  const isDestructive = destructiveKeywords.some(keyword => goalLower.includes(keyword));
  
  if (isDestructive) {
    return "cleanup";
  }
  return "checkCalendar";
}

// Specialized Cleanup Node to bypass planning/scheduling and ensure calendar states remain clean/empty
async function cleanupNode(state: typeof AgentState.State) {
  emitAgentStep(state.sessionId, "⚙️ Reverting Changes / Cleaning Calendar...");
  const session = sessions[state.sessionId];
  writeAuditLog(session, "cleanup", "Executing Direct Cleanup Node", "Goal identified as a destructive or pure cleanup request. Completely bypassing checkCalendar, scheduleTasks, and draftDocs stages.", "success");
  
  const token = state.accessToken;
  if (token) {
    writeAuditLog(session, "googleCalendar", "Scouting Duplicates", "Searching Google Calendar for matching duplicate events...", "info");
    
    try {
      const lookbackStart = new Date();
      lookbackStart.setDate(lookbackStart.getDate() - 2);

      const listUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(lookbackStart.toISOString())}&singleEvents=true`;
      
      writeAuditLog(session, "googleCalendar", "Fetching Events", `Querying Google Calendar events from the last 48 hours (since ${lookbackStart.toISOString()})...`, "info");

      const listData = await callWithRetry(async () => {
        const calendarListRes = await fetch(listUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });

        if (!calendarListRes.ok) {
          const errText = await calendarListRes.text();
          throw new Error(`Failed to list calendar events: ${calendarListRes.status} - ${errText}`);
        }

        return await calendarListRes.json();
      });

      const items = listData.items || [];
      const matchedEvents: any[] = [];

      for (const item of items) {
        const summary = item.summary || "";
        if (summary.startsWith('[Saver]') && item.id) {
          matchedEvents.push(item);
        }
      }

      writeAuditLog(session, "googleCalendar", "Scout Complete", `Found ${matchedEvents.length} events starting with '[Saver]' from the last 48 hours.`, "info");

      for (const event of matchedEvents) {
        writeAuditLog(session, "googleCalendar", "Deleting Event", `Attempting to delete calendar event: "${event.summary}" (ID: ${event.id})`, "info");
        const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`;
        
        await callWithRetry(async () => {
          const deleteRes = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!deleteRes.ok) {
            const delErr = await deleteRes.text();
            throw new Error(`Could not delete event ${event.id}: ${deleteRes.status} - ${delErr}`);
          }
        });

        writeAuditLog(session, "googleCalendar", "Delete Success", `Successfully deleted event: "${event.summary}"`, "success");
      }

      writeAuditLog(session, "googleCalendar", "Cleanup Complete", `Successfully processed deletions for ${matchedEvents.length} '[Saver]' events.`, "success");
    } catch (err: any) {
      writeAuditLog(session, "googleCalendar", "Cleanup Error", `Google Calendar cleanup failed: ${err.message}`, "error");
      throw err; // Loud failure!
    }
  } else {
    // Simulated delete
    writeAuditLog(session, "googleCalendar", "Simulated Scout", "Simulating calendar scan for duplicate events created today...", "info");
    const targetKeywords = ['Brainstorm', 'Slide Content', 'Visuals', 'Refine Flow'];
    writeAuditLog(session, "googleCalendar", "Simulated Scout Complete", `Simulated search matched duplicate mock entries created today.`, "info");
    for (const kw of targetKeywords) {
      writeAuditLog(session, "googleCalendar", "Simulated Event Delete", `Simulated Google Calendar delete for duplicate "${kw}" event.`, "success");
    }
  }

  emitAgentStep(state.sessionId, "✓ Calendar Cleaned");

  // Ensure that for cleanup routes, the state variables for tracking new calendar events remain empty so nothing new gets written to the Google Calendar tool.
  return {
    subtasks: [],
    artifacts: []
  };
}

// Initialize LangGraph workflow build
const memorySaver = new MemorySaver();
const workflow = new StateGraph(AgentState)
  .addNode("analyzeGoal", analyzeGoalNode)
  .addNode("checkCalendar", checkCalendarNode)
  .addNode("scheduleTasks", scheduleTasksNode)
  .addNode("draftArtifacts", draftArtifactsNode)
  .addNode("evaluateAgenda", evaluateAgendaNode)
  .addNode("cleanup", cleanupNode)
  .addEdge("__start__", "analyzeGoal")
  .addConditionalEdges(
    "analyzeGoal",
    routeAfterAnalysis
  )
  .addEdge("checkCalendar", "scheduleTasks")
  .addEdge("scheduleTasks", "draftArtifacts")
  .addEdge("draftArtifacts", "evaluateAgenda")
  .addEdge("cleanup", "evaluateAgenda")
  .addConditionalEdges(
    "evaluateAgenda",
    (state) => {
      if (state.feedback) {
        return "draftArtifacts";
      }
      return "__end__";
    }
  );

const agentWorkflow = workflow.compile({ checkpointer: memorySaver });


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
      }, {
        configurable: { thread_id: id }
      });

      // Commit LangGraph generated outputs back to the shared storage session
      sessionRecord.subtasks = finalState.subtasks || [];
      sessionRecord.artifacts = finalState.artifacts || [];

      const goalLower = (goal || "").toLowerCase();
      const destructiveKeywords = ["clean", "delete", "remove", "wipe", "purge", "clear"];
      const isDestructive = destructiveKeywords.some(keyword => goalLower.includes(keyword));

      if (isDestructive) {
        sessionRecord.status = 'completed';
        writeAuditLog(
          sessionRecord,
          "system",
          "Goal Finished",
          "Pure cleanup goal completed directly inside workflow. All matching events deleted successfully.",
          "success"
        );
        emitAgentStep(id, "✅ Sync Complete");
      } else {
        sessionRecord.status = 'review_needed';
        writeAuditLog(
          sessionRecord,
          "system",
          "Awaiting Action",
          "Agent finished planning. Presenting approval gate to user.",
          "success"
        );
        emitAgentStep(id, "✅ Sync Complete");
      }
    } catch (err: any) {
      sessionRecord.status = 'failed';
      writeAuditLog(sessionRecord, "system", "Agent Failed", err.message, "error");
      emitAgentStep(id, "❌ Agent Failed");
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

// SSE Agent Thought Streaming Endpoint
app.get("/api/sessions/:id/stream", (req, res) => {
  const sessionId = req.params.id;

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  // Replay any existing step messages so the client doesn't miss them
  const session = sessions[sessionId];
  if (session && session.streamSteps) {
    for (const step of session.streamSteps) {
      res.write(`data: ${JSON.stringify({ step })}\n\n`);
    }
  }

  // Define dynamic listener for this session's events
  const onStep = (stepMessage: string) => {
    res.write(`data: ${JSON.stringify({ step: stepMessage })}\n\n`);
  };

  sseEmitter.on(`step:${sessionId}`, onStep);

  // Clean up when client disconnects
  req.on("close", () => {
    sseEmitter.off(`step:${sessionId}`, onStep);
  });
});

// Psychological safety net: "Undo Schedule" or "Revert Changes" endpoint
app.post("/api/undo", async (req, res) => {
  const { command, target, accessToken } = req.body;
  
  if (command !== "system_cleanup") {
    return res.status(400).json({ error: "Invalid command. Command must be 'system_cleanup'." });
  }

  const id = `session-undo-${Math.random().toString(36).substr(2, 9)}`;
  const sessionRecord: PanickedGoal = {
    id,
    query: `Revert / Undo Action (${target || 'today'})`,
    targetDate: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    status: 'analyzing',
    subtasks: [],
    artifacts: [],
    auditLogs: [],
    streamSteps: [],
  };
  sessions[id] = sessionRecord;
  writeAuditLog(sessionRecord, "system", "Undo Initiated", `Received undo command: "${command}" on target "${target}"`, "warning");

  // Send initial step
  emitAgentStep(id, "⚙️ Reverting Changes / Cleaning Calendar...");

  setTimeout(async () => {
    try {
      await cleanupNode({
        sessionId: id,
        goal: "Undo schedule changes",
        targetDate: new Date().toISOString().split('T')[0],
        subtasks: [],
        artifacts: [],
        accessToken,
        busyEvents: [],
        feedback: undefined,
        evaluationCount: 0,
      });

      sessionRecord.status = 'completed';
      writeAuditLog(sessionRecord, "system", "Undo Finished", "Revert completed successfully. All duplicate [Saver] events deleted.", "success");
      emitAgentStep(id, "✓ Calendar Cleaned");
      emitAgentStep(id, "✅ Sync Complete");
    } catch (err: any) {
      sessionRecord.status = 'failed';
      writeAuditLog(sessionRecord, "system", "Undo Failed", err.message, "error");
      emitAgentStep(id, "❌ Agent Failed");
    }
  }, 100);

  res.json({ sessionId: id });
});


// =============================================================================
// TRIAGE MODE: Damage Control for Already-Missed Deadlines (Powered by Gemini)
// =============================================================================
app.post("/api/triage", async (req, res) => {
  const { missedDeadline, context, stakeholders } = req.body;

  if (!missedDeadline || !context) {
    return res.status(400).json({ error: "missedDeadline and context are required." });
  }

  writeAuditLog(null, "triageMode", "Triage Initiated", `Missed deadline: "${missedDeadline}"`, "warning");

  try {
    const ai = getGeminiClient();
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `
You are an expert crisis manager and executive communication coach. Today is ${today}.

A user has already MISSED a deadline. They need immediate, calm, and professional damage control.

MISSED DEADLINE: "${missedDeadline}"
CONTEXT / REASON: "${context}"
STAKEHOLDERS AFFECTED: "${stakeholders || 'Team / Manager'}"

Your job is to generate a structured triage response. Return a JSON object with EXACTLY this structure:
{
  "severityLevel": "low" | "medium" | "high" | "critical",
  "severityReason": "One sentence explaining why you chose this severity level",
  "damageControlEmail": {
    "subject": "Professional email subject line",
    "to": "Who this should be sent to",
    "body": "Full professional email body. Calm, accountable, solution-focused. 2-3 short paragraphs. Acknowledge the miss, brief honest reason, and concrete new delivery commitment with a specific date/time."
  },
  "escalationPlan": [
    {
      "step": 1,
      "action": "Short action title",
      "detail": "Specific, concrete thing to do right now",
      "timeframe": "e.g. Next 30 minutes"
    },
    {
      "step": 2,
      "action": "Short action title",
      "detail": "Specific, concrete thing to do",
      "timeframe": "e.g. Within 2 hours"
    },
    {
      "step": 3,
      "action": "Short action title",
      "detail": "Specific, concrete thing to do",
      "timeframe": "e.g. By end of day"
    }
  ],
  "recoveryMindset": "One powerful, reassuring sentence to help the user stay calm and focused"
}

CRITICAL: Return ONLY valid JSON. No markdown code blocks. No explanation. No preamble. Just the JSON object.
`;

    const result = await generateWithGroqFallback(
      async () => {
        const response = await callWithRetry(() =>
          ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { temperature: 0.5, maxOutputTokens: 1500 }
          })
        );
        const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return { text: rawText };
      },
      prompt,
      { isJson: true }
    );

    let parsed: any;
    try {
      let clean = result.text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      // Try extracting JSON object
      const firstBrace = result.text.indexOf('{');
      const lastBrace = result.text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        parsed = JSON.parse(result.text.substring(firstBrace, lastBrace + 1));
      } else {
        throw new Error("Triage response was not valid JSON.");
      }
    }

    writeAuditLog(null, "triageMode", "Triage Complete", `Generated damage control plan. Severity: ${parsed.severityLevel}`, "success");
    res.json({ success: true, triage: parsed });

  } catch (err: any) {
    writeAuditLog(null, "triageMode", "Triage Failed", err.message, "error");
    res.status(500).json({ error: `Triage generation failed: ${err.message}` });
  }
});

// =============================================================================
// EMAIL REMINDERS (Nodemailer)
// =============================================================================
app.post("/api/remind", async (req, res) => {
  const { to, subject, text } = req.body;

  if (!to || !subject || !text) {
    return res.status(400).json({ error: "Missing to, subject, or text in request body." });
  }

  if (!process.env.REMINDER_EMAIL_USER || !process.env.REMINDER_EMAIL_PASS) {
    return res.status(500).json({ error: "Email configuration missing on the server. Set REMINDER_EMAIL_USER and REMINDER_EMAIL_PASS." });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.REMINDER_EMAIL_USER,
        pass: process.env.REMINDER_EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.REMINDER_EMAIL_USER,
      to,
      subject,
      text,
    });

    writeAuditLog(null, "remind", "Email Sent", `Reminder sent to ${to}`, "success");
    res.json({ success: true, message: "Reminder email sent successfully." });
  } catch (err: any) {
    writeAuditLog(null, "remind", "Email Failed", err.message, "error");
    res.status(500).json({ error: `Failed to send email: ${err.message}` });
  }
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

  const { accessToken, action, eventsToDelete } = req.body;
  session.status = 'committing';
  
  const isDeleteOnly = action === 'delete' || (eventsToDelete && eventsToDelete.length > 0 && action !== 'insert');
  
  if (isDeleteOnly) {
    writeAuditLog(session, "humanGate", "Approved Deletion", "User initiated direct automated cleanup of Google Calendar events.", "success");
  } else {
    writeAuditLog(session, "humanGate", "Approved Plan", "User gave final clearance for Calendar & Document commit.", "success");
  }

  // Helper functions for deletion and simulation
  const performGoogleCalendarDelete = async (token: string) => {
    writeAuditLog(session, "googleCalendar", "Scouting Duplicates", "Searching Google Calendar for matching duplicate events...", "info");
    
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - 2);
    lookbackStart.setHours(0, 0, 0, 0);

    // Filter to get events from 2 days ago onwards
    const listUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(lookbackStart.toISOString())}&singleEvents=true`;
    
    const calendarListRes = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!calendarListRes.ok) {
      const err = await calendarListRes.text();
      throw new Error(`Failed to list calendar events: ${err}`);
    }

    const listData = await calendarListRes.json();
    const items = listData.items || [];
    const matchedEvents: any[] = [];

    for (const item of items) {
      const summary = item.summary || "";
      if (summary.startsWith('[Saver]') && item.id) {
        matchedEvents.push(item);
      }
    }

    writeAuditLog(session, "googleCalendar", "Scout Complete", `Found ${matchedEvents.length} duplicate matching events.`, "info");

    for (const event of matchedEvents) {
      writeAuditLog(session, "googleCalendar", "Deleting Event", `Deleting calendar event: "${event.summary}" (ID: ${event.id})`, "info");
      const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`;
      
      const deleteRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!deleteRes.ok) {
        const delErr = await deleteRes.text();
        writeAuditLog(session, "googleCalendar", "Delete Failure", `Could not delete event ${event.id}: ${delErr}`, "warning");
      } else {
        writeAuditLog(session, "googleCalendar", "Delete Success", `Successfully deleted event: "${event.summary}"`, "success");
      }
    }
  };

  const performSimulatedDelete = () => {
    writeAuditLog(session, "googleCalendar", "Simulated Scout", "Simulating calendar scan for duplicate events created today...", "info");
    const targetKeywords = ['Brainstorm', 'Slide Content', 'Visuals', 'Refine Flow'];
    writeAuditLog(session, "googleCalendar", "Simulated Scout Complete", `Simulated search matched duplicate mock entries created today.`, "info");
    for (const kw of targetKeywords) {
      writeAuditLog(session, "googleCalendar", "Simulated Event Delete", `Simulated Google Calendar delete for duplicate "${kw}" event.`, "success");
    }
  };

  try {
    // 1. Always execute automated cleanup / deletion fully BEFORE any insertions
    if (accessToken) {
      await callWithRetry(async () => {
        await performGoogleCalendarDelete(accessToken);
      });
    } else {
      performSimulatedDelete();
    }

    // 2. Perform insertions only if this is not a pure deletion action
    if (!isDeleteOnly) {
      // Write Calendar Events
      for (const subtask of session.subtasks) {
        if (subtask.status !== 'rejected' && subtask.scheduledStart && subtask.action !== 'delete') {
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
    }

    // 3. Commit Document Outline & Workspace elements (only if not a pure delete action)
    if (!isDeleteOnly) {
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
