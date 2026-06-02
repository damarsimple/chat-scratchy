import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/db.js';
import { publish, bus } from '../lib/events.js';

export const studentRouter = Router();

function titleFromMessages(messages) {
  const firstUser = Array.isArray(messages) ? messages.find((m) => m.role === 'user') : null;
  return (firstUser?.content ?? '').slice(0, 50) || 'New Chat';
}

// POST /api/join { joinCode, displayName, clientToken? }
// Joins a class by code. Re-joining with an existing clientToken reuses the record.
studentRouter.post('/join', async (req, res) => {
  const { joinCode, displayName, clientToken } = req.body ?? {};
  if (!joinCode || !displayName) {
    return res.status(400).json({ error: 'joinCode and displayName are required' });
  }
  const klass = await prisma.class.findUnique({ where: { joinCode: joinCode.trim().toUpperCase() } });
  if (!klass) return res.status(404).json({ error: 'Class not found' });

  // Re-identify an existing student if a valid token was supplied for this class.
  if (clientToken) {
    const existing = await prisma.student.findUnique({ where: { clientToken } });
    if (existing && existing.classId === klass.id) {
      return res.json({
        studentId: existing.id, clientToken: existing.clientToken,
        classId: klass.id, className: klass.name, displayName: existing.displayName,
      });
    }
  }

  const token = randomUUID();
  const student = await prisma.student.create({
    data: { displayName: displayName.trim().slice(0, 60), clientToken: token, classId: klass.id },
  });
  res.json({
    studentId: student.id, clientToken: token,
    classId: klass.id, className: klass.name, displayName: student.displayName,
  });
});

// GET /api/students/:id/profile  → the rolling AI memory for this student
studentRouter.get('/students/:id/profile', async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    select: { profile: true, profileUpdatedAt: true },
  });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ profile: student.profile ?? '', profileUpdatedAt: student.profileUpdatedAt });
});

// PUT /api/students/:id/profile  { profile }  → replace the rolling AI memory
studentRouter.put('/students/:id/profile', async (req, res) => {
  const { profile } = req.body ?? {};
  if (typeof profile !== 'string') return res.status(400).json({ error: 'profile (string) required' });
  try {
    const student = await prisma.student.update({
      where: { id: req.params.id },
      // Keep memory bounded so it can't grow without limit across many sessions.
      data: { profile: profile.slice(0, 2000), profileUpdatedAt: new Date() },
      select: { profile: true, profileUpdatedAt: true },
    });
    res.json({ profile: student.profile, profileUpdatedAt: student.profileUpdatedAt });
  } catch {
    res.status(404).json({ error: 'Student not found' });
  }
});

// GET /api/sessions?studentId=...  → that student's sessions (list view)
studentRouter.get('/sessions', async (req, res) => {
  const { studentId } = req.query;
  const where = studentId ? { studentId: String(studentId) } : {};
  const sessions = await prisma.session.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true },
  });
  res.json(sessions);
});

// POST /api/sessions { studentId?, classId?, objectiveId?, lang?, mode? }
studentRouter.post('/sessions', async (req, res) => {
  const { studentId, classId, objectiveId, lang, mode } = req.body ?? {};
  // Derive classId from the student if not explicitly given.
  let resolvedClassId = classId ?? null;
  if (!resolvedClassId && studentId) {
    const s = await prisma.student.findUnique({ where: { id: studentId }, select: { classId: true } });
    resolvedClassId = s?.classId ?? null;
  }
  const session = await prisma.session.create({
    data: {
      studentId: studentId ?? null,
      classId: resolvedClassId,
      objectiveId: objectiveId ?? null,
      lang: lang ?? 'zh',
      mode: mode ?? 'task',
    },
  });
  if (session.classId) publish(session.id, session.classId, 'presence', { created: true });
  res.json({ id: session.id });
});

// GET /api/sessions/:id  → full session (messages blob)
studentRouter.get('/sessions/:id', async (req, res) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// PUT /api/sessions/:id  { messages, title?, objectiveId?, lang?, mode? }
studentRouter.put('/sessions/:id', async (req, res) => {
  const { messages, title, objectiveId, lang, mode } = req.body ?? {};
  const existing = await prisma.session.findUnique({
    where: { id: req.params.id }, select: { id: true, classId: true },
  });
  if (!existing) return res.status(404).json({ error: 'Session not found' });

  const session = await prisma.session.update({
    where: { id: req.params.id },
    data: {
      ...(messages !== undefined ? { messages, title: title ?? titleFromMessages(messages) } : {}),
      ...(objectiveId !== undefined ? { objectiveId } : {}),
      ...(lang !== undefined ? { lang } : {}),
      ...(mode !== undefined ? { mode } : {}),
      lastActiveAt: new Date(),
    },
  });
  publish(session.id, session.classId, 'chat', { messages: session.messages });
  res.json({ success: true });
});

// DELETE /api/sessions/:id
studentRouter.delete('/sessions/:id', async (req, res) => {
  try {
    await prisma.session.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(404).json({ error: 'Session not found' });
  }
});

// PUT /api/sessions/:id/blockly  { workspaceJson, generatedCode?, blockSummary? }
studentRouter.put('/sessions/:id/blockly', async (req, res) => {
  const { workspaceJson, generatedCode, blockSummary } = req.body ?? {};
  if (workspaceJson === undefined) return res.status(400).json({ error: 'workspaceJson required' });
  const session = await prisma.session.findUnique({
    where: { id: req.params.id }, select: { id: true, classId: true },
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const snap = await prisma.blocklySnapshot.create({
    data: {
      sessionId: session.id,
      workspaceJson,
      generatedCode: generatedCode ?? '',
      blockSummary: blockSummary ?? '',
    },
  });
  await prisma.session.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } });
  publish(session.id, session.classId, 'blockly', { snapshotId: snap.id });
  res.json({ id: snap.id });
});

// POST /api/sessions/:id/events  { type, payload? }
studentRouter.post('/sessions/:id/events', async (req, res) => {
  const { type, payload } = req.body ?? {};
  if (!type) return res.status(400).json({ error: 'type required' });
  const session = await prisma.session.findUnique({
    where: { id: req.params.id }, select: { id: true, classId: true },
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const ev = await prisma.activityEvent.create({
    data: { sessionId: session.id, type, payload: payload ?? {} },
  });
  publish(session.id, session.classId, 'event', { type, payload: payload ?? {} });
  res.json({ id: ev.id });
});

// POST /api/sessions/:id/interventions  { patternId?, message?, outcome?, blockSnapshot? }
studentRouter.post('/sessions/:id/interventions', async (req, res) => {
  const { patternId, message, outcome, blockSnapshot } = req.body ?? {};
  const session = await prisma.session.findUnique({
    where: { id: req.params.id }, select: { id: true, classId: true },
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const iv = await prisma.intervention.create({
    data: {
      sessionId: session.id,
      patternId: patternId ?? null,
      message: message ?? '',
      outcome: outcome ?? null,
      blockSnapshot: blockSnapshot ?? [],
    },
  });
  publish(session.id, session.classId, 'intervention', { id: iv.id, message: iv.message });
  res.json({ id: iv.id });
});

// PATCH /api/interventions/:id  { outcome }  → resolve an intervention outcome
studentRouter.patch('/interventions/:id', async (req, res) => {
  const { outcome } = req.body ?? {};
  try {
    const iv = await prisma.intervention.update({
      where: { id: req.params.id }, data: { outcome: outcome ?? null },
    });
    res.json({ id: iv.id, outcome: iv.outcome });
  } catch {
    res.status(404).json({ error: 'Intervention not found' });
  }
});

// GET /api/sessions/:id/command-stream  → SSE of live teacher commands for this
// session (highlight / tip / clear / workspace push). Knowing the session id is
// the capability here — same trust model as the rest of the student endpoints.
studentRouter.get('/sessions/:id/command-stream', async (req, res) => {
  const exists = await prisma.session.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) return res.status(404).json({ error: 'Session not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const channel = `cmd:${req.params.id}`;
  bus.on(channel, send);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    bus.off(channel, send);
    res.end();
  });
});

// POST /api/sessions/:id/ping  → presence heartbeat
studentRouter.post('/sessions/:id/ping', async (req, res) => {
  try {
    const session = await prisma.session.update({
      where: { id: req.params.id },
      data: { lastActiveAt: new Date() },
      select: { id: true, classId: true },
    });
    publish(session.id, session.classId, 'presence', { ping: true });
    res.json({ success: true });
  } catch {
    res.status(404).json({ error: 'Session not found' });
  }
});
