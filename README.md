# Last-Minute Life Saver ⏱️🚀
## Autonomous Agentic Planning Coordinator

Last-Minute Life Saver is an intelligent, autonomous agentic platform engineered to transform high-pressure crisis situations and tight deadlines into clear, structured, and actionable schedules. By parsing unstructured panic intake goals, analyzing current calendar commitments, and programmatically drafting workspace documents, it automates the tedious preparation and scheduling work so you can focus entirely on execution.

---

### 📌 Problem Statement
In high-pressure environments, professionals and students frequently encounter "panic scenarios"—sudden, massive crises or tight-deadline emergencies. Manually auditing available calendar spaces, breaking down target boundaries into micro-tasks, and composing initial outreach or supporting documentation consumes precious minutes when action should already be underway.

This friction leads to:
* **Analysis Paralysis:** Inability to start because the full scale of the plan hasn't been organized.
* **Scheduling Conflicts:** Double-booking or miscalculating how long critical preparation steps take.
* **Communication Lag:** Crucial stakeholders are left in the dark because draft updates or warning emails take too long to write while working under distress.

---

### 💡 The Solution
**Last-Minute Life Saver** acts as an autonomous agentic salvager. It processes an unstructured, panicked overview of a crisis, validates parameters, and runs an automated coordination cycle that:
1. **Structures an Action Plan:** Breaks the massive crisis down into manageable, chronological subtasks.
2. **Audits Live Calendars:** Analyzes current occupancy to locate dedicated, realistic execution slots.
3. **Drafts Critical Elements:** Prepares professional email updates within Gmail drafts and structures workspace agendas, checklists, and outline notes in Google Docs automatically.
4. **Enforces Human Clearance:** Requires human verification and clearance before executing any actions or syncing state back to real workspace endpoints.

---

### 🏗️ Project Architecture & Workflow
The system utilizes a custom, multi-node agentic workflow inspired by **LangGraph** to process state transitions robustly and asynchronously:

```
[ Panic Goal Intake ] 
         │
         ▼
 1. Goal Intake & Parsing  ───► Extracts deadlines, key constraints, and desired outcomes
         │
         ▼
 2. Live Calendar Audit    ───► Scans existing calendar events to identify free blocks
         │
         ▼
 3. Orchestrated Schedule  ───► Claims optimal slots for focused action with estimated durations
         │
         ▼
 4. Workspace Draft Gen     ───► Composes professional Gmail drafts & structures rich Google Docs
         │
         ▼
[ Human Clearance Gate ]   ───► Inline edits, inclusion switches, & final commit approval
```

| Cycle Node | Technical Responsibility | Primary Actions |
| :--- | :--- | :--- |
| **Goal Intake & Parsing Node** | Target analysis & extraction | Evaluates user crisis input against absolute deadlines to isolate key subgoals. |
| **Calendar Audit Node** | Constraints verification | Inspects Google Calendar to find free space and prevent conflicts. |
| **Orchestrated Scheduling Node** | Time-aware task allocation | Schedules specific preparation and execution events directly into appropriate slots. |
| **Workspace Content Generation Node** | Multi-channel communication | Generates markdown outlines for Google Docs and pre-populated client-safe email body templates. |

---

### 🛠️ Tech Stack & Ecosystem Tools
The application is built using a modern, reliable full-stack developer architecture:

* **Core Agentic Framework:** Lightweight TypeScript/Node.js multi-node coordinator inspired by LangGraph principles for state-driven task execution.
* **LLM Engine:** Google Gemini (utilizing `gemini-2.5-flash` via the `@google/genai` TypeScript SDK) configured with custom structured instructions.
* **Integrations & Tools:** Google Workspace sandbox APIs (Google Calendar for calendar sync, Gmail for email draft placement, Google Docs for document outlines).
* **Frontend/Environment:** React (Vite-powered SPA, optimized with high-contrast minimalist orange/gray utility layouts, responsive micro-animations via `motion`, and standard UI controls).

---

### 🚀 Quick Start (Local Setup)

Follow these instructions to spin up the application in a local developer environment:

#### 1. Clone & Install Dependencies
First, clone your repository and install the project dependencies:
```bash
npm install
```

#### 2. Environment Configuration
Create a `.env` file in the root directory and define the required secret and environment configuration variables:
```env
# Google Gemini API key used for the coordination loop
GEMINI_API_KEY=your_gemini_api_key_here

# App URL endpoint, used internally for self-referential links
APP_URL=http://localhost:3000
```
*(Ensure `.env` matches your local workspace credentials and is never committed to Git).*

#### 3. Run the Development Server
Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the minimalist dashboard.

---

### 🎨 Visual Theme & Interactive Experience
To inspire calm focus amidst tight timelines, the user interface features:
* **The Crimson-Orange Minimalist Theme:** Designed with soft-gray cards, sharp status lights, distinct borders, and highly readable high-contrast orange accent buttons.
* **Human-in-the-Loop Clearance Gate:** Gives users full inline configuration capabilities to edit titles, modify start times, rewrite drafts, and select which items sync directly to remote calendars and cloud drives.
* **Active Processing Log Rail:** Renders a scrolling live-terminal log illustrating real-time decisions, node evaluations, and state completions of the planning agent.
