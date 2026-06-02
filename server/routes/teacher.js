import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireTeacher, generateJoinCode } from '../lib/auth.js';

export const teacherRouter = Router();
teacherRouter.use(requireTeacher);

// Ensure the requesting teacher owns the class; returns it or null.
async function ownedClass(teacherId, classId) {
  const klass = await prisma.class.findUnique({ where: { id: classId } });
  return klass && klass.teacherId === teacherId ? klass : null;
}

// POST /api/teacher/classes { name }
teacherRouter.post('/classes', async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });

  // Retry on the rare join-code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const klass = await prisma.class.create({
        data: { name: name.trim().slice(0, 80), joinCode: generateJoinCode(), teacherId: req.teacherId },
      });
      return res.json(klass);
    } catch (e) {
      if (e.code === 'P2002') continue; // unique constraint on joinCode
      throw e;
    }
  }
  res.status(500).json({ error: 'Could not generate a unique join code' });
});

// GET /api/teacher/classes  → classes with student/session counts
teacherRouter.get('/classes', async (req, res) => {
  const classes = await prisma.class.findMany({
    where: { teacherId: req.teacherId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { students: true, sessions: true } } },
  });
  res.json(classes.map((c) => ({
    id: c.id, name: c.name, joinCode: c.joinCode, createdAt: c.createdAt,
    studentCount: c._count.students, sessionCount: c._count.sessions,
  })));
});

const ACTIVE_WINDOW_MS = 90_000;

// GET /api/teacher/classes/:id  → roster with per-student live status
teacherRouter.get('/classes/:id', async (req, res) => {
  const klass = await ownedClass(req.teacherId, req.params.id);
  if (!klass) return res.status(404).json({ error: 'Class not found' });

  const students = await prisma.student.findMany({
    where: { classId: klass.id },
    orderBy: { createdAt: 'asc' },
    include: {
      sessions: {
        orderBy: { lastActiveAt: 'desc' },
        take: 1,
        select: {
          id: true, title: true, objectiveId: true, lastActiveAt: true, updatedAt: true,
          _count: { select: { interventions: true } },
          blocklySnapshots: { orderBy: { createdAt: 'desc' }, take: 1, select: { blockSummary: true } },
          // Pull just the completion events to derive per-objective done-status.
          activityEvents: { where: { type: 'objective_complete' }, select: { payload: true } },
        },
      },
    },
  });

  const now = Date.now();
  const roster = students.map((s) => {
    const latest = s.sessions[0] ?? null;
    const lastActiveAt = latest?.lastActiveAt ?? null;
    const online = lastActiveAt ? now - new Date(lastActiveAt).getTime() < ACTIVE_WINDOW_MS : false;
    const completed = (latest?.activityEvents ?? []).some(
      (e) => e.payload?.objectiveId === latest?.objectiveId,
    );
    return {
      studentId: s.id,
      displayName: s.displayName,
      latestSessionId: latest?.id ?? null,
      objectiveId: latest?.objectiveId ?? null,
      objectiveComplete: completed,
      lastActiveAt,
      online,
      interventionCount: latest?._count.interventions ?? 0,
      blockSummary: latest?.blocklySnapshots[0]?.blockSummary ?? '',
    };
  });

  // Aggregate across the class, grouped by objective: how many students are on it
  // and how many have completed it. Powers the class overview.
  const byObjective = {};
  for (const r of roster) {
    const key = r.objectiveId ?? '(none)';
    byObjective[key] ??= { objectiveId: r.objectiveId, students: 0, completed: 0 };
    byObjective[key].students++;
    if (r.objectiveComplete) byObjective[key].completed++;
  }
  const aggregate = {
    totalStudents: roster.length,
    online: roster.filter((r) => r.online).length,
    completed: roster.filter((r) => r.objectiveComplete).length,
    byObjective: Object.values(byObjective),
  };

  res.json({ id: klass.id, name: klass.name, joinCode: klass.joinCode, roster, aggregate });
});

// GET /api/teacher/sessions/:id  → full session detail for the viewer
teacherRouter.get('/sessions/:id', async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: {
      student: { select: { id: true, displayName: true } },
      class: { select: { id: true, name: true, teacherId: true } },
      interventions: { orderBy: { createdAt: 'asc' } },
      activityEvents: { orderBy: { createdAt: 'asc' } },
      blocklySnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // Ownership: teacher must own the class this session belongs to.
  if (!session.class || session.class.teacherId !== req.teacherId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const resolved = session.interventions.filter((i) => i.outcome && i.outcome !== 'pending');
  const helped = resolved.filter((i) => i.outcome === 'helped').length;
  const effectivenessRate = resolved.length ? Math.round((helped / resolved.length) * 100) : null;

  res.json({
    id: session.id,
    title: session.title,
    objectiveId: session.objectiveId,
    lang: session.lang,
    mode: session.mode,
    messages: session.messages,
    student: session.student,
    className: session.class?.name ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastActiveAt: session.lastActiveAt,
    latestWorkspace: session.blocklySnapshots[0] ?? null,
    interventions: session.interventions,
    activityEvents: session.activityEvents,
    stats: { interventionCount: session.interventions.length, effectivenessRate },
  });
});

// GET /api/teacher/sessions/:id/snapshots  → blockly history (for replay scrubbing)
teacherRouter.get('/sessions/:id/snapshots', async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id }, include: { class: { select: { teacherId: true } } },
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!session.class || session.class.teacherId !== req.teacherId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const snaps = await prisma.blocklySnapshot.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, blockSummary: true },
  });
  res.json(snaps);
});

// GET /api/teacher/snapshots/:id  → a single workspace snapshot (full json)
teacherRouter.get('/snapshots/:id', async (req, res) => {
  const snap = await prisma.blocklySnapshot.findUnique({
    where: { id: req.params.id },
    include: { session: { include: { class: { select: { teacherId: true } } } } },
  });
  if (!snap) return res.status(404).json({ error: 'Snapshot not found' });
  if (snap.session.class?.teacherId !== req.teacherId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(snap);
});
