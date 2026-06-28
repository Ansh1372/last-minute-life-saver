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

### ✨ Key Hackathon Features & Agentic Depth
During the hackathon, we built 5 major enhancements to elevate the product experience:
1. **🎙️ Voice Input:** Speak your panic directly into the system using the Web Speech API for faster intake.
2. **🔄 Habit & Recurring Goal Tracking:** Automatically track goals in a local dashboard to identify recurring panic patterns and re-run saved habits.
3. **🚨 Triage Mode (Damage Control):** A secondary emergency flow for deadlines you *already missed*. Gemini immediately assesses severity, writes a professional damage-control email, and generates a 3-step escalation plan.
4. **🔔 Email Reminders (Nodemailer):** Close the loop securely. The app sends you an actual email reminder with your goal and deadline once your plan is approved.
5. **✨ Animated Onboarding:** A polished 3-step carousel to guide first-time users before they connect their Google Workspace.

---

### 🏆 Usage of Google Technologies
This project relies heavily on the Google Developer ecosystem as its core technological foundation:
* **Google AI Studio (Gemini 2.5 Flash):** Acts as the core reasoning engine. It parses natural language, decides task durations, writes damage control emails (in Triage Mode), and maps out exact daily schedules.
* **Google Cloud Console (OAuth 2.0):** Implements a secure, production-ready Google Authentication flow to identify users without requiring manual API key inputs.
* **Google Workspace Ecosystem:** The entire goal of the agent is to prepare and orchestrate data for Google Calendar, Gmail, and Google Docs.

*(Note: Groq is included strictly as a failover/fallback provider to demonstrate production-grade resiliency and error handling in case of rate limits).*

---

### 🏗️ Project Architecture & Workflow
The system utilizes a custom, multi-node agentic workflow inspired by **LangGraph** to process state transitions robustly and asynchronously:

```text
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

---

### 🛠️ Tech Stack & Production-Ready Standards
The application is built using a modern, reliable full-stack developer architecture with strong error handling:
* **Frontend:** React + Vite + Tailwind CSS. Wrapped in standard `ErrorBoundary` components to catch rendering crashes seamlessly.
* **Backend:** Fastify Node.js server with comprehensive `try/catch` exception blocks and detailed HTTP status code responses (400, 404, 500).
* **Logging:** Dedicated `writeAuditLog` utility that captures real-time agentic reasoning, API failures, and successful email dispatches for deep transparency.

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

# Centralized Google OAuth Client ID for Production Auth Flow
VITE_GOOGLE_CLIENT_ID=your_google_cloud_oauth_client_id

# Groq API Key for Fallback Provider (Required for resiliency)
GROQ_API_KEY=your_groq_api_key_here

# Email Reminder Config (Nodemailer via Gmail SMTP)
REMINDER_EMAIL_USER=your-gmail@gmail.com
REMINDER_EMAIL_PASS=your-app-password-here
```
*(Ensure `.env` matches your local workspace credentials and is never committed to Git).*

#### 3. Run the Development Server
Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3001](http://localhost:3001) in your browser to interact with the minimalist dashboard.
