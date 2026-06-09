# System Flows

## 1. Student Onboarding Flow

```
Student opens / 
        │
        ▼
  ┌─────────────────┐
  │  StudentJoin     │  Shows join card (class code + display name)
  │  (join-gate)     │
  └────────┬────────┘
           │ POST /api/join  { joinCode, displayName, clientToken? }
           ▼
  ┌─────────────────┐
  │  Server          │  prisma.class.findUnique({ joinCode })
  │  routes/student  │  → 404 "Class not found"
  │                  │  → re-identify if clientToken matches existing student
  │                  │  → create Student row with randomUUID clientToken
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │  StudentIdentity  │  Saved to localStorage as "chat-scratchy-identity"
  │                   │  { studentId, clientToken, classId, className, displayName }
  └────────┬────────┘
           │ App renders main UI
           ▼
  ┌───────────────────────────────────────────┐
  │  Two parallel loads:                       │
  │  1. GET /api/students/:id/profile          │
  │     → loads AI memory into studentProfileRef │
  │  2. GET /api/classes/:id/objectives        │
  │     → loads teacher-authored objectives    │
  │     (empty list → use built-in objectives) │
  └───────────────────────────────────────────┘
```

## 2. Chat Flow

```
Student types message
        │
        ▼
  handleSend()
        │
        ├──  llmBusyRef guard (prevents concurrent sends)
        ├──  if no activeSessionId → startNewSession()
        │      └── POST /api/sessions  → creates Session row
        │
        ├──  Build system prompt:
        │      └── EN_SYSTEM_PROMPT
        │          + language override (zh → Traditional Chinese)
        │          + current objective description
        │          + studentProfileRef (AI memory)
        │
        ├──  Auto-inject get_scratch_context if blocks changed
        │      since last tool call in the conversation
        │
        ├──  In task mode: append SCRATCH_TOOLS (function definitions)
        │
        ▼
  streamResponse()  ← POST to LLM endpoint (settings.endpoint)
        │
        │  Streaming loop reads SSE chunks:
        │  ┌────────────────────────────────────────────┐
        │  │  reasoning_content → setStreamingThinking() │
        │  │  content → setStreamingContent()            │
        │  │  tool_calls → accumulate by index           │
        │  └────────────────────────────────────────────┘
        │
        ├──  If tool_calls returned:
        │      └── executeToolCall() for each:
        │            get_scratch_context → ref.getContext()
        │            highlight_block → ref.highlightBlock()
        │            show_block_tip → ref.showBlockTip()
        │            clear_tips → ref.clearBlockTips()
        │            zoom_to_block → ref.zoomToBlock()
        │            zoom_to_fit → ref.zoomToFit()
        │            mark_block_correct → ref.showBlockTip(✅)
        │            mark_block_issue → ref.showBlockTip(⚠️)
        │            highlight_toolbox_block → ref.highlightToolboxBlock()
        │            suggest_category → ref.suggestCategory()
        │            run_program → ref.runProgram()
        │      └── Loop back to LLM (max 5 tool rounds)
        │
        └──  No tool_calls:
               └── Save final message → PUT /api/sessions/:id
                     └── publish() → SSE → teacher dashboard
                     └── loadSessionsList() (refresh sidebar)
                     └── Every 3 turns: updateStudentProfile()
                           └── LLM call to summarize recent activity
                           └── PUT /api/students/:id/profile
```

## 3. Blockly Execution Flow

```
Student clicks green flag (▶)
        │
        ▼
  handleStart() in BlocklyPanel
        │
        ├──  Prevent if already running (isRunning guard)
        ├──  Create AbortController (for Stop button)
        ├──  Reset sprite to student's configured appearance
        ├──  Register all window.__scratch* functions
        │    on the current spriteRef
        │
        ├──  javascriptGenerator.init(ws)
        ├──  For each top block:
        │     └── javascriptGenerator.blockToCode(block)
        │     └── new AsyncFunction(code)  → runner
        │
        ├──  Classify scripts by hat type:
        │     event_whenflagclicked    → flagScripts[]
        │     event_whenkeypressed     → keyScripts Map<key, runner[]>
        │     event_whenthisspriteclicked → spriteClickHandlers[]
        │     scratch_whenireceive     → broadcastHandlers Map<msg, runner[]>
        │
        ├──  Run all flagScripts concurrently:
        │     await Promise.all(flagScripts.map(fn => fn()))
        │
        ├──  If event handlers exist (key/click/broadcast):
        │     keepAlive promise holds until Stop
        │
        └──  finally block:
               removeEventListeners, setIsRunning(false)

Execution environment (window.__scratch*):
  - __scratchMove(steps) → updates sprite.x/y, requestAnimationFrame render
  - __scratchTurn(deg) → updates sprite.direction
  - __scratchGlide(secs, tx, ty) → requestAnimationFrame tween
  - __scratchSay(text) → setSayText (speech bubble on stage)
  - __scratchAsk(q) → show on-stage input, pause until submit
  - __scratchBroadcast(msg) → Promise.all(handlers)
  - All functions check sig.aborted → throw "STOPPED"
```

## 4. SSE Live Streaming Flow

### Teacher subscribes to class stream

```
Teacher opens ClassDetail page
        │
        ▼
  subscribeLive({ classId })
        │
        ├──  new EventSource(`/api/teacher/stream?classId=...`)
        │
        ▼
  Server: GET /api/teacher/stream
        ├──  requireTeacher middleware (JWT cookie check)
        ├──  Ownership check: class.teacherId === req.teacherId
        ├──  SSE headers + keepalive interval (25s)
        └──  Subscribe to bus channel `class:{classId}`
                │
                ▼  On every student action:
        ┌─────────────────────────────────┐
        │  publish(sessionId, classId,    │
        │    kind, data)                  │
        │  ┌─ session:{sid} listeners     │
        │  └─ class:{cid} listeners ──────┤──→ Teacher dashboard refresh
        └─────────────────────────────────┘
```

### Student subscribes to teacher commands

```
Student app active (has currentSessionId)
        │
        ▼
  subscribeCommands(sessionId) in useEffect
        │
        ├──  new EventSource(`/api/sessions/${id}/command-stream`)
        │
        ▼
  Server: GET /api/sessions/:id/command-stream
        ├──  Verify session exists
        ├──  SSE headers + keepalive
        └──  Subscribe to bus channel `cmd:{sessionId}`
                │
                ▼  Teacher pushes command:
        ┌─────────────────────────────────┐
        │  publishCommand(sessionId,       │
        │    type, payload)                │
        │                                 │
        │  Types:                          │
        │  highlight → ref.highlightBlockId│
        │  tip → ref.showBlockTipById      │
        │  clear → ref.clearBlockTips      │
        │  load_workspace → ref.loadWS()   │
        └─────────────────────────────────┘
```

### Pub/Sub architecture

```
Server lib/events.js  (in-process EventEmitter)

  publish(sessionId, classId, kind, data)
    → emits on `session:{sid}` channel  (teacher per-session view)
    → emits on `class:{cid}` channel     (teacher class roster view)

  publishCommand(sessionId, type, payload)
    → emits on `cmd:{sid}` channel       (student's command-stream)

Note: For multi-instance deployments, replace with Postgres LISTEN/NOTIFY.
```

## 5. Teacher Dashboard Flows

### 5a. Auth Flow

```
Teacher navigates to /teacher/*
        │
        ▼
  TeacherAuthProvider (context)
        ├──  On mount: GET /api/auth/me
        │     └── Reads httpOnly cookie "teacher_token"
        │     └── JWT.verify(token, JWT_SECRET) → req.teacherId
        │     └── Returns Teacher { id, email, name } or 401
        │
        ├──  login(email, password):
        │     POST /api/auth/login → JWT cookie set → Teacher info returned
        │
        ├──  register(email, password, name):
        │     POST /api/auth/register → JWT cookie set → Teacher info returned
        │
        └──  logout():
              POST /api/auth/logout → cookie cleared
```

### 5b. Class Management Flow

```
Teacher on Classes page
        │
        ├──  GET /api/teacher/classes → list with student/session counts
        │
        ├──  Create class:
        │     POST /api/teacher/classes { name }
        │     → generateJoinCode() (6 chars, no ambiguous: ABCDEFGHJKLMNPQRSTUVWXYZ23456789)
        │     → Retry on P2002 (join code collision, max 5 attempts)
        │
        └──  Teacher shares joinCode with students (physical/verbal)
```

### 5c. Live Roster Flow

```
ClassDetail page (real-time)
        │
        ├──  GET /api/teacher/classes/:id
        │     └── For each student:
        │           ├── latest session (by lastActiveAt)
        │           ├── online? (lastActiveAt < 90s ago)
        │           ├── objective completion (from activityEvents type='objective_complete')
        │           ├── latest block summary
        │           └── intervention count
        │     └── Aggregate: byObjective totals, online/completed counts
        │
        └──  subscribeLive({ classId }) → SSE → throttled refresh (1.5s)
```

### 5d. Session Viewer Flow

```
Teacher opens session
        │
        ├──  GET /api/teacher/sessions/:id
        │     └── Ownership check: session.class.teacherId === req.teacherId
        │     └── Returns messages, student profile, interventions,
        │         activity events, latest workspace snapshot, stats
        │
        ├──  subscribeLive({ sessionId }) → SSE → throttled refresh (1.2s)
        │     (paused when editMode is on)
        │
        ├──  Tabs: Blocks | Code | Timeline
        │     ├── Blocks: BlocklyPanel (read-only by default)
        │     │     ├── Edit mode toggle → workspace editable
        │     │     └── Live controls:
        │     │           ├── 👉 Highlight → POST /teacher/sessions/:id/command
        │     │           │     { type: 'highlight', payload: { blockId } }
        │     │           ├── 💬 Tip → POST ...command
        │     │           │     { type: 'tip', payload: { blockId, message } }
        │     │           ├── ✖ Clear → POST ...command
        │     │           │     { type: 'clear' }
        │     │           └── ⬆ Push → POST ...command
        │     │                { type: 'load_workspace', payload:
        │     │                  { workspaceJson, generatedCode, blockSummary } }
        │     │                → Also persists BlocklySnapshot row
        │     └── Timeline: merges interventions + activityEvents chronologically
        │
        └──  Snapshot history:
              GET /api/teacher/sessions/:id/snapshots → list
              GET /api/teacher/snapshots/:id → full workspace JSON
```

## 6. Proactive Agent (Watchdog) Flow

```
useProactiveAgent() — runs every 30s in background
        │
        ├──  Guards:
        │     ├── document.visibilityState !== 'hidden' → skip
        │     ├── llmBusyRef.current (student mid-chat) → skip
        │     ├── max backoff (5 consecutive LLM failures) → skip
        │     ├── cooldown (3 min since last intervene) → skip
        │     └── stuckSeconds < 5 → skip (not stuck)
        │
        ├──  Build context snapshot:
        │     ├── stuckSeconds (time since last msg/block change)
        │     ├── blockDiff (no_change / reverted / progressing / deleting_more_than_adding)
        │     ├── blockContext (full block tree with #ref labels)
        │     ├── matchedPatterns (from runPatternMatcher)
        │     ├── consecutiveShortMessages
        │     ├── editVelocityDropped (was editing fast, stopped)
        │     ├── confidenceSignal + timestamp
        │     ├── recentMessages (last 6)
        │     └── recentInterventions
        │
        ├──  Call LLM (watchdog system prompt):
        │     └── Decision: { action, reason, message, patternId, suggestBreak, toolCalls }
        │
        └──  If action === 'intervene':
              ├── Record intervention in useInterventionTracker
              ├── Inject assistant message into chat
              ├── Execute toolCalls (highlight, tip, etc.)
              └── POST /api/sessions/:id/interventions (server persistence)

Intervention outcome tracking:
  - resolveWithBlockChange() on every block change
  - Blocks changed after intervention → outcome = 'helped'
  - No change after 3 min → outcome = 'ignored'
  - Effectiveness rate = helped / resolved * 100
```

## 7. Objective Flow

### 7a. Teacher creates objectives

```
Teacher opens ClassDetail → ObjectivesManager
        │
        └──  POST /api/teacher/classes/:id/objectives
              { title, description?, checkKey? }
              → Prisma: create Objective row (order = last + 1)

        Editing:
              PUT /api/teacher/objectives/:id  { title?, description?, checkKey?, order? }

        Deleting:
              DELETE /api/teacher/objectives/:id
```

### 7b. Student loads objectives

```
Student joins class
        │
        ├──  GET /api/classes/:id/objectives
        │     → if empty: use built-in objectives (i18n-translated)
        │     → if present: use teacher's objectives
        │
        └──  Objective selector in Blockly toolbar
              └── onClick → onSelectObjective(i)
                    → useEffect syncs objectiveIdRef + checkKeyRef
                    → checkObjective() runs heuristic check on current blocks
```

### 7c. Objective completion detection

```
handleBlockChange() fires on every Blockly workspace change
        │
        └──  checkObjective(checkKeyRef.current, blocks)
              │
              ├──  Built-in checkKeys (5 heuristics):
              │     animation → hat + motion + (loop or costume change)
              │     cat-mouse → hat + loop + goto/mouse + if/touching
              │     quiz → hat + ask + if + answer
              │     pong → hat + loop + bounce/edge + key
              │     falling → hat + loop + changeY/glide + if/touching
              │
              ├──  Teacher-authored with checkKey → same heuristics by key
              ├──  Teacher-authored without checkKey → null (no auto-check)
              │
              └──  If complete:
                    ├── setObjectiveComplete(true) → banner shown
                    ├── POST /api/sessions/:id/events { type:'objective_complete', payload:{objectiveId} }
                    └── updateProfileRef('objective_complete')
```

## 8. Student Profile (AI Memory) Flow

```
On mount: GET /api/students/:id/profile → studentProfileRef

On every 3rd chat turn:
  updateStudentProfile(reason)
        │
        ├──  Gather recent messages (last 12), block context, objective status
        ├──  LLM call (non-streaming) with system prompt:
        │     "You maintain a concise tutoring memory about a young Scratch student..."
        │     → Output: 2-4 sentence profile (English, <100 words)
        ├──  Strip <think> tags, trim to 1500 chars
        └──  PUT /api/students/:id/profile

The profile is injected into the system prompt on every chat turn:
  buildSystemContent() → appends memory_heading + studentProfileRef
```

## 9. Database Schema Relationships

```
Teacher
  │
  └── Class (1:N)
        │
        ├── Objective (1:N)  — teacher-authored tasks
        ├── Student (1:N)
        │     └── Session (1:N)
        │           │
        │           ├── BlocklySnapshot (1:N)  — workspace save history
        │           ├── Intervention (1:N)     — AI proactive hints
        │           └── ActivityEvent (1:N)    — confidence, runs, messages, block changes
        │
        └── Session (1:N) — direct class sessions (no student identity)
```

## 10. Activity Event Types

| Type | Trigger | Payload |
|------|---------|---------|
| `confidence` | Student clicks a confidence button | `{ signal: "confused" \| "thinking" \| "good" }` |
| `run` | Student clicks green flag | — |
| `stuck` | Watchdog detects stuck state | `{ seconds: number }` |
| `student_message` | Student sends a chat | — |
| `block_change` | Blocks change in workspace | — |
| `objective_complete` | Heuristic check passes | `{ objectiveId: string }` |
