# Chat Scratchy

A Scratch tutoring platform with an AI tutor, Blockly workspace, teacher dashboard, and live classroom monitoring.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  React+Vite  │────▶│  Express API │────▶│   PostgreSQL     │
│  (frontend)  │◀────│  (backend)   │◀────│  (via Prisma)    │
└──────┬───────┘     └──────┬───────┘     └──────────────────┘
       │                    │
       │   SSE stream       │   SSE stream
       │  (teacher ⇄ student)│  (teacher ⇄ student)
       └────────────────────┘
```

## Tech Stack

- **Frontend**: React 19 + TypeScript 6 + Vite + react-router-dom
- **Blockly**: Google Blockly v12 (custom Scratch blocks + JS generator)
- **Backend**: Express.js (port 3500), cookie-based JWT auth
- **Database**: PostgreSQL via Prisma ORM
- **Streaming**: Server-Sent Events for live teacher monitoring + teacher-to-student commands

## Features

### Student App (`/`)
- AI tutor chat with streaming responses and thinking display (`reasoning_content`)
- Blockly Scratch workspace (motion, looks, events, control, sensing blocks)
- Stage with sprite rendering and program execution
- Task mode with objectives (built-in or teacher-authored)
- Learning mode for open-ended chat
- Language toggle (English / Traditional Chinese)
- Session persistence and history
- Confidence buttons (confused / thinking / got it)
- Proactive AI intervention when the student is stuck
- Rolling AI memory (student profile updates across sessions)

### Teacher Dashboard (`/teacher/*`)
- Auth (register/login/logout) with httpOnly JWT cookies
- Class management (create, join codes)
- Live roster with online status, objective progress, block summaries
- Per-session viewer with chat replay, workspace, generated code, and activity timeline
- Live teacher controls: highlight blocks, send tips, push workspace edits to student
- Objective editor (per-class, with auto-check keys for built-in heuristics)

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL (or Docker for the Postgres container)

### Frontend

```bash
npm install
npm run dev      # Vite dev server on port 5173
```

### Backend

```bash
cd server
npm install
cp .env.example .env   # edit DATABASE_URL + JWT_SECRET
npx prisma migrate dev
npm run dev            # Express on port 3500
```

### Environment Variables

Root `.env`:

```env
VITE_API_ENDPOINT=/api/chat/completions   # proxied via Vite → LLM backend
VITE_API_BASE=/api                        # proxied via Vite → Express
VITE_DEFAULT_MODEL=gpt-3.5-turbo
```

Server `.env` (in `server/`):

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME?schema=public"
JWT_SECRET="change-me"
```

### Vite Proxy

The dev server proxies:
- `/api/chat/*` → LLM backend (e.g. `http://192.168.1.205:8083`)
- `/api/*` → Express backend (`http://localhost:3500`)

### Docker (Postgres)

```bash
docker run -d --name chat-scratchy-pg \
  -e POSTGRES_USER=scratchy \
  -e POSTGRES_PASSWORD=... \
  -e POSTGRES_DB=chat_scratchy \
  -p 5433:5432 postgres:16
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend dev server |
| `npm run build` | TypeScript check + Vite build |
| `npm run lint` | ESLint |
| `cd server && npm run dev` | Backend |

## Objective Check Keys

Built-in heuristic completion checkers:

| Key | Description |
|-----|-------------|
| `animation` | Simple animation (motion + hat + loop or costume change) |
| `cat-mouse` | Cat chasing mouse (motion, sensing, if/then) |
| `quiz` | Quiz game (ask/wait, if/then, answer) |
| `pong` | Pong/bounce (edge bounce, key pressed) |
| `falling` | Falling objects (change y, glide, if/then) |

## License

MIT
