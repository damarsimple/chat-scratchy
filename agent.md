# Agent Guidelines

## Project Overview

Chat Scratchy is a Scratch tutoring platform. Students build Scratch programs with Blockly while chatting with an AI tutor. Teachers monitor progress through a live dashboard.

## Tech Stack

- **Frontend**: React 19 + TypeScript 6 + Vite (strict mode) + react-router-dom
- **Blockly**: Google Blockly v12 with custom Scratch blocks + JS generator
- **Backend**: Express.js (port 3500), cookie-based JWT auth, SSE streaming
- **Database**: PostgreSQL via Prisma ORM
- **Styling**: Plain CSS with CSS variables (warm/light theme)

## Project Structure

```
├── src/                         # Frontend source
│   ├── main.tsx                 # Router: / (student), /teacher/* (dashboard)
│   ├── App.tsx                  # Student app: chat, Blockly, objectives, AI agent
│   ├── BlocklyPanel.tsx         # Blockly workspace + stage + sprite engine
│   ├── ChatTranscript.tsx       # Message rendering with thinking blocks
│   ├── ConfidenceButtons.tsx    # Student confidence signal buttons
│   ├── StudentJoin.tsx          # Class join gate
│   ├── api.ts                   # Shared API client + types
│   ├── i18n.ts                  # zh/en translations
│   ├── objectives.ts            # Heuristic objective completion checks
│   ├── scratchPatterns.ts       # Scratch block pattern matcher for hinting
│   ├── exampleChains.ts         # Pre-built Blockly XML examples
│   ├── useProactiveAgent.ts     # Background watchdog AI (intervenes when stuck)
│   ├── useInterventionTracker.ts# Tracks AI intervention outcomes
│   ├── useBlockDiff.ts          # Detects block edit velocity changes
│   ├── useActivityTracker.ts    # Tracks student activity state
│   ├── teacher/                 # Teacher dashboard components
│   │   ├── Login.tsx            # Auth page
│   │   ├── TeacherAuth.tsx      # Auth context
│   │   ├── ProtectedRoute.tsx   # Auth gate
│   │   ├── Classes.tsx          # Class list
│   │   ├── ClassDetail.tsx      # Roster + live monitoring
│   │   ├── SessionViewer.tsx    # Per-session viewer + live controls
│   │   ├── ObjectivesManager.tsx# Per-class objective editor
│   │   └── Timeline.tsx         # Activity/intervention timeline
│   └── index.css                # All styles + teacher/teacher.css
├── server/                      # Express backend
│   ├── server.js                # Entry point (port 3500)
│   ├── routes/auth.js           # Teacher auth (register/login/logout/me)
│   ├── routes/teacher.js        # Teacher API (classes, sessions, commands, objectives)
│   ├── routes/student.js        # Student API (join, sessions, blockly, events)
│   ├── routes/stream.js         # SSE stream for live classroom updates
│   ├── lib/db.js                # Prisma client singleton
│   ├── lib/auth.js              # JWT signing, password hashing, join codes
│   ├── lib/events.js            # In-process pub/sub for SSE
│   ├── prisma/schema.prisma     # Database schema
│   └── scripts/migrate-json.mjs # Legacy sessions.json → Postgres import
├── .env                         # Frontend env (API endpoint, model, key)
└── vite.config.ts               # Vite proxy config
```

## Key Patterns

### API Response Format (LLM streaming)
Uses Qwen-style streaming with `reasoning_content` field for thinking:
```json
{"choices":[{"delta":{"reasoning_content":"...","content":"..."}}]}
```

### Streaming architecture (server-sent events)
- Teacher dashboard subscribes to `GET /api/teacher/stream?classId=...` or `?sessionId=...`
- Student subscribes to `GET /api/sessions/:id/command-stream` for live teacher commands
- Events flow: student writes → `publish()` → EventEmitter → SSE → teacher dashboard
- Commands flow: teacher clicks → `publishCommand()` → EventEmitter → SSE → student

### Auth
- Teachers: email/password with bcrypt, JWT stored in httpOnly cookie (7-day expiry)
- Students: opaque `clientToken` UUID stored in localStorage, no password

### Strict TypeScript
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `exactOptionalPropertyTypes: true`
- `verbatimModuleSyntax: true`
- `noImplicitOverride: true`
- `noFallthroughCasesInSwitch: true`

Always run `npm run build` before marking a task complete.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend dev server (port 5173) |
| `npm run build` | TypeScript check + Vite build |
| `npm run lint` | ESLint |
| `cd server && npm run dev` | Backend (port 3500) |
| `cd server && npx prisma migrate dev` | Apply DB migrations |
| `cd server && npx prisma studio` | Prisma DB browser |

## Environment Variables

### Root `.env`
- `VITE_API_ENDPOINT` — LLM endpoint (proxied via Vite)
- `VITE_API_BASE` — Backend base URL (default `/api`)
- `VITE_DEFAULT_MODEL` — Default model name
- `VITE_API_KEY` — Optional API key for LLM endpoint

### Server `.env` (server/)
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for signing teacher JWT cookies
