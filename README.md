# Last-Minute Life Saver ⏱️🚀
## Autonomous Agentic Planning Coordinator

[![Live Site](https://img.shields.io/badge/Live-App-orange?style=for-the-badge)](https://last-minute-life-saver-737688365498.asia-southeast1.run.app)
[![Google Cloud Run](https://img.shields.io/badge/Google--Cloud--Run-blue?logo=google-cloud&style=for-the-badge)](https://cloud.google.com)
[![Gemini API](https://img.shields.io/badge/Gemini--2.5--Flash-indigo?logo=google-gemini&style=for-the-badge)](https://ai.google.dev)

**Last-Minute Life Saver** is a high-fidelity, intelligent autonomous agentic platform engineered to transform high-pressure crisis situations, sudden panic goals, and near-impossible deadlines into clean, structured, and manageable daily execution schedules. 

By parsing unstructured natural language or live spoken voice inputs, securely auditing your real Google Calendar events, and dynamically structuring high-fidelity preparation agendas and draft Gmail updates, the agent handles the heavy lifting of scheduling and organization. This breaks the friction of analysis paralysis so you can immediately begin executing when every second counts.

🔗 **Live Deployment:** [https://last-minute-life-saver-737688365498.asia-southeast1.run.app](https://last-minute-life-saver-737688365498.asia-southeast1.run.app)

---

### 📌 The Problem
In high-pressure work, academic, or personal environments, we all face "panic scenarios"—a major presentation due tomorrow, an integration milestone that has slipped, or a project proposal due in 48 hours with nothing built. 

Under immense distress, our cognitive capacity drops. Initiating the recovery process requires:
1. **Auditing your current calendar** to find realistic blocks of time.
2. **Deconstructing a monolithic task** into discrete, realistic milestones with exact duration estimates.
3. **Drafting workspace files** (agendas, notes, presentation slide outlines) from scratch.
4. **Drafting update emails** to stakeholders to set realistic expectations.

Performing these coordination tasks manually takes valuable minutes when action should already have been taken. This results in **analysis paralysis**, **overlooked booking conflicts**, and **delayed stakeholder communication**.

---

### 💡 The Agentic Solution
**Last-Minute Life Saver** acts as an autonomous planning coordinator. When you input your panicked crisis, it immediately boots up an advanced orchestration loop to restore order:

1. **Intelligent Breakdown:** Gemini decomposes your massive crisis into logical, sequential subgoals with precise duration estimates.
2. **Context-Aware Calendar Audits:** The agent scans your Google Calendar (via secure OAuth) to detect free windows, skipping busy slots, and calendars preparation sessions realistically around your actual meetings.
3. **Drafting Deliverables:** It instantly structures high-fidelity document templates, outlining steps, slide outlines, or scripts in Google Docs, and drafts professional status emails inside Gmail.
4. **Human-in-the-Loop Clearance Gate:** No code executes silently. The app presents an interactive clearance dashboard where you can customize slots, edit tasks, tweak draft emails, and click a single button to push everything to your Google account.
5. **Real-time Reminders:** The server dispatches an actual email checklist right to your inbox when approved, making sure you stay accountable.

---

### ✨ Hackathon Highlights & Core Features

#### 🎙️ 1. Real-time Voice Intake
Never spend time typing when you're in a hurry. Powered by the **Web Speech API**, you can record your voice directly inside the intake dashboard. The engine streams your spoken panic, converts it to clean text, and passes it directly to the Gemini analysis loop.

#### 🚨 2. Crisis Triage Mode (Emergency Damage Control)
What if you *already* missed the deadline? Turn on **Triage Mode**. Gemini performs an emergency diagnostic:
* Evaluates impact severity (Low, Medium, High, Critical).
* Generates a 3-Step Immediate Recovery Plan.
* Establishes a professional, high-empathy "Damage Control" email draft that you can copy with one click to manage expectations with managers or clients.
* Re-centers your psychology with an AI-curated "Recovery Mindset" statement.

#### 🔄 3. Habit & Recurring Goal Tracker
Many tight deadlines arise from recurring patterns. You can toggle habit tracking on any goal. Approved goals are logged into a local history tracking dashboard with interactive recurrence schedules (Daily, Weekly, Monthly) to build long-term planning resilience.

#### 🔔 4. Automated Email Reminders
Integrated with secure server-side **Nodemailer** proxy routes, approving a recovery plan sends an elegant, instant HTML reminder containing your deadline and structured schedule checklist directly to your designated email address.

#### 🎨 5. Interactive Onboarding Experience
A modern, animated, step-by-step onboarding carousel built with **Framer Motion** and **Lucide Icons** guides first-time users. It explains the mechanics of the scheduling engine and showcases exactly what access is requested before initiating Google Authentication.

---

### 🏆 Google Developer Ecosystem Integration
This application leverages the full power of the Google developer ecosystem to deliver a seamless, autonomous workspace planning coordinator:
* **Google AI Studio (Gemini 2.5 Flash):** Serves as the central analytical brain. Gemini processes unstructured crisis descriptions, models realistic preparation durations, handles robust schema-perfect JSON structuralization, and drafts professional high-empathy communication.
* **Google OAuth 2.0 (Implicit Grant Flow):** Orchestrates safe, secure client-side user identification and permission grant flows without exposing sensitive credentials.
* **Google Workspace APIs:** Dynamically reads and writes user data to restore structure to their day:
  * **Google Calendar API:** Checks availability windows and automates booking slots to guarantee dedicated work blocks.
  * **Gmail API:** Drafts stakeholder-ready update communications for direct confirmation and immediate resolution.
  * **Google Docs API:** Dynamically structures high-fidelity document outlines, notes, and action plans directly in the user's workspace.

---

### 📦 Third-Party & Open-Source Credits
We would like to express our gratitude to the incredible open-source community and standard libraries that make this interface highly interactive, robust, and beautiful:
* **React 19 & TypeScript:** Provides the structural, declarative reactive framework and strong typing safety that binds the entire application state together.
* **Vite:** Operates as our ultra-fast build tool and development server, ensuring high-fidelity, lightning-fast rendering.
* **Tailwind CSS:** Powers the entire modern design language, utilizing fluid utility classes, premium color palettes, and responsive grid layouts.
* **Framer Motion:** Empowers smooth micro-animations, slide-in guides, and responsive step transitions for an elegant user onboarding experience.
* **Lucide React:** Supplies beautiful, clean, and highly descriptive modern stroke icons that enrich our button actions, tabs, and statuses.
* **Nodemailer:** Handles our robust, server-side secure SMTP email dispatch routes to deliver direct crisis alarms and timeline checklists right to your inbox.
* **Groq SDK:** Integrates as a production-ready failover and fallback AI provider to ensure maximum application uptime and resilient error recovery.

---

### 🏗️ Project Architecture & Workflow

```text
       ┌────────────────────────────────────────────────────────┐
       │             User Panic Intake (Voice or Text)          │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │              Google OAuth 2.0 Identity Token           │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │   Agentic Loop (Gemini 2.5 Flash + Fallback Resiliency)│
       ├────────────────────────────────────────────────────────┤
       │ 1. Structuring: Break goals into structured subtasks.  │
       │ 2. Audit: Scan Google Calendar events.                 │
       │ 3. Allocate: Time-block tasks within actual free slots.│
       │ 4. Draft: Create Google Doc outline & Gmail draft text.│
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │           Human-in-the-Loop Approval Gate              │
       ├────────────────────────────────────────────────────────┤
       │  - Tweak scheduled calendar times                      │
       │  - Edit, add, or delete subtasks                       │
       │  - Send customized email reminder via Nodemailer      │
       └───────────────────────────┬────────────────────────────┘
                                   │ (Approve & Deploy)
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                Workspace Resource Sync                 │
       ├────────────────────────────────────────────────────────┤
       │  ✔ Google Calendar Events Scheduled                    │
       │  ✔ Google Docs Outlines Created                        │
       │  ✔ Gmail Status Drafts Written                         │
       └────────────────────────────────────────────────────────┘
```

---

### 🛠️ Tech Stack & Implementation Standards

* **Client-side Framework:** React 19, Vite, Tailwind CSS, and Framer Motion. 
* **Backend:** Express & Node.js written in TypeScript, compiled with **esbuild**, and run on **tsx** in development.
* **Resiliency & Fallbacks:** Built-in failovers connect to alternative model providers (such as Groq SDK) to ensure the system remains responsive even under Google Cloud Platform quota limits.
* **Audit Logger:** A comprehensive, real-time client/server log drawer displays step-by-step agentic decisions, network updates, and auth updates, giving developers and users absolute transparency.
* **Type Safety:** 100% strict TypeScript types and enums share states perfectly across files. No rendering state is un-typed.

---

### 🚀 Running the App Locally

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Configure Environment Variables
Create a `.env` file in your root directory:
```env
# Google Gemini API key used for the planner & triage loops
GEMINI_API_KEY=your_gemini_api_key_here

# Centralized Google OAuth Client ID
VITE_GOOGLE_CLIENT_ID=your_google_cloud_oauth_client_id_here

# Optional: Groq API Key for Fallback Resiliency
GROQ_API_KEY=your_groq_api_key_here

# Email SMTP Config for Reminders
REMINDER_EMAIL_USER=your-email@gmail.com
REMINDER_EMAIL_PASS=your-gmail-app-password-here
```

#### 3. Run Development Server
```bash
npm run dev
```
The server will start on port `3000` with the Vite proxy automatically routing client-side requests. Visit [http://localhost:3000](http://localhost:3000) to begin using the application!

---

### 🛡️ Security & Privacy
Last-Minute Life Saver prioritizes user security:
* **Authorization Scope:** Access is requested via secure client-side Implicit Grant. Tokens are stored only inside browser memory (`localStorage`) and never persisted on any secondary database.
* **Draft Safely:** Real calendar write operations, email triggers, and document uploads only occur **after** you inspect them and click "Approve and Sync" on the Approval Gate.
