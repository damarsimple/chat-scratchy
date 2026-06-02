// Shared client API layer for student persistence + teacher dashboard.
// All requests use credentials:'include' so the teacher auth cookie rides along.

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error ?? ''; } catch { /* ignore */ }
    throw new ApiError(res.status, detail || res.statusText);
  }
  // Some endpoints return empty body
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ── Student identity (localStorage) ─────────────────────────────────

export interface StudentIdentity {
  studentId: string;
  clientToken: string;
  classId: string;
  className: string;
  displayName: string;
}

const IDENTITY_KEY = 'chat-scratchy-identity';

export function loadIdentity(): StudentIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as StudentIdentity) : null;
  } catch { return null; }
}

export function saveIdentity(id: StudentIdentity): void {
  try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(id)); } catch { /* ignore */ }
}

export function clearIdentity(): void {
  try { localStorage.removeItem(IDENTITY_KEY); } catch { /* ignore */ }
}

export async function joinClass(joinCode: string, displayName: string): Promise<StudentIdentity> {
  const existing = loadIdentity();
  const body = JSON.stringify({ joinCode, displayName, clientToken: existing?.clientToken });
  const id = await http<StudentIdentity>('/join', { method: 'POST', body });
  saveIdentity(id);
  return id;
}

// ── Student persistence ─────────────────────────────────────────────

export function saveBlockly(
  sessionId: string,
  data: { workspaceJson: unknown; generatedCode: string; blockSummary: string },
): Promise<{ id: string }> {
  return http(`/sessions/${sessionId}/blockly`, { method: 'PUT', body: JSON.stringify(data) });
}

export function postEvent(sessionId: string, type: string, payload?: unknown): Promise<{ id: string }> {
  return http(`/sessions/${sessionId}/events`, { method: 'POST', body: JSON.stringify({ type, payload }) });
}

export function postIntervention(
  sessionId: string,
  data: { patternId?: string | null; message?: string; outcome?: string | null; blockSnapshot?: unknown },
): Promise<{ id: string }> {
  return http(`/sessions/${sessionId}/interventions`, { method: 'POST', body: JSON.stringify(data) });
}

export function ping(sessionId: string): Promise<{ success: boolean }> {
  return http(`/sessions/${sessionId}/ping`, { method: 'POST' });
}

// ── Rolling student profile (AI memory) ─────────────────────────────

export interface StudentProfile { profile: string; profileUpdatedAt: string | null; }

export function getStudentProfile(studentId: string): Promise<StudentProfile> {
  return http(`/students/${studentId}/profile`);
}

export function saveStudentProfile(studentId: string, profile: string): Promise<StudentProfile> {
  return http(`/students/${studentId}/profile`, { method: 'PUT', body: JSON.stringify({ profile }) });
}

// ── Teacher API ─────────────────────────────────────────────────────

export interface TeacherInfo { id: string; email: string; name: string; }

export const teacherApi = {
  register: (email: string, password: string, name: string) =>
    http<TeacherInfo>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    http<TeacherInfo>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => http<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => http<TeacherInfo>('/auth/me'),

  listClasses: () => http<ClassSummary[]>('/teacher/classes'),
  createClass: (name: string) => http<ClassSummary>('/teacher/classes', { method: 'POST', body: JSON.stringify({ name }) }),
  getClass: (id: string) => http<ClassDetail>(`/teacher/classes/${id}`),
  getSession: (id: string) => http<TeacherSession>(`/teacher/sessions/${id}`),
  getSnapshots: (id: string) => http<SnapshotMeta[]>(`/teacher/sessions/${id}/snapshots`),
  getSnapshot: (id: string) => http<BlocklySnapshot>(`/teacher/snapshots/${id}`),
};

// ── Teacher types ───────────────────────────────────────────────────

export interface ClassSummary {
  id: string; name: string; joinCode: string; createdAt: string;
  studentCount: number; sessionCount: number;
}

export interface RosterEntry {
  studentId: string; displayName: string; latestSessionId: string | null;
  objectiveId: string | null; objectiveComplete: boolean;
  lastActiveAt: string | null; online: boolean;
  interventionCount: number; blockSummary: string;
}

export interface ObjectiveAgg { objectiveId: string | null; students: number; completed: number; }
export interface ClassAggregate {
  totalStudents: number; online: number; completed: number; byObjective: ObjectiveAgg[];
}

export interface ClassDetail {
  id: string; name: string; joinCode: string;
  roster: RosterEntry[]; aggregate: ClassAggregate;
}

// Shared label lookup for built-in objective ids (raw id → human label).
export const OBJECTIVE_LABELS: Record<string, string> = {
  animation: 'Simple Animation',
  'cat-mouse': 'Cat Chasing Mouse',
  quiz: 'Quiz Game',
  pong: 'Pong / Bounce',
  falling: 'Falling Objects',
};
export function objectiveLabel(id: string | null | undefined): string {
  if (!id) return '—';
  return OBJECTIVE_LABELS[id] ?? id;
}

export interface BlocklySnapshot {
  id: string; workspaceJson: unknown; generatedCode: string; blockSummary: string; createdAt: string;
}
export interface SnapshotMeta { id: string; createdAt: string; blockSummary: string; }

export interface Intervention {
  id: string; patternId: string | null; message: string; outcome: string | null; createdAt: string;
}
export interface ActivityEvent { id: string; type: string; payload: Record<string, unknown>; createdAt: string; }

export interface TeacherSession {
  id: string; title: string; objectiveId: string | null; lang: string; mode: string;
  messages: ChatMessage[];
  student: { id: string; displayName: string } | null;
  studentProfile: { profile: string; profileUpdatedAt: string | null } | null;
  className: string | null;
  createdAt: string; updatedAt: string; lastActiveAt: string;
  latestWorkspace: BlocklySnapshot | null;
  interventions: Intervention[];
  activityEvents: ActivityEvent[];
  stats: { interventionCount: number; effectivenessRate: number | null };
}

// Chat message shape shared with the student app.
export interface ToolCallDef { id: string; type: 'function'; function: { name: string; arguments: string }; }
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallDef[];
  tool_call_id?: string;
}

// ── Live updates (SSE) ──────────────────────────────────────────────

export interface LiveEvent {
  sessionId: string | null; classId: string | null;
  kind: 'chat' | 'blockly' | 'event' | 'intervention' | 'presence';
  data: unknown; at: number;
}

// Subscribe to a class or session live stream. Returns an unsubscribe fn.
export function subscribeLive(
  params: { classId?: string; sessionId?: string },
  onMessage: (ev: LiveEvent) => void,
): () => void {
  const qs = new URLSearchParams(
    params.classId ? { classId: params.classId } : { sessionId: params.sessionId! },
  ).toString();
  const es = new EventSource(`${API_BASE}/teacher/stream?${qs}`, { withCredentials: true });
  es.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data) as LiveEvent); } catch { /* ignore keep-alives */ }
  };
  return () => es.close();
}
