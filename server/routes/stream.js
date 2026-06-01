import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireTeacher } from '../lib/auth.js';
import { bus } from '../lib/events.js';

export const streamRouter = Router();

// GET /api/teacher/stream?classId=...   (or ?sessionId=...)
// Server-Sent Events stream of live updates for a class or a single session.
// Teacher-only; verifies ownership before subscribing.
streamRouter.get('/stream', requireTeacher, async (req, res) => {
  const { classId, sessionId } = req.query;
  if (!classId && !sessionId) {
    return res.status(400).json({ error: 'classId or sessionId required' });
  }

  // Ownership check.
  if (classId) {
    const klass = await prisma.class.findUnique({ where: { id: String(classId) } });
    if (!klass || klass.teacherId !== req.teacherId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } else {
    const session = await prisma.session.findUnique({
      where: { id: String(sessionId) }, include: { class: { select: { teacherId: true } } },
    });
    if (!session || session.class?.teacherId !== req.teacherId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const channel = classId ? `class:${classId}` : `session:${sessionId}`;
  bus.on(channel, send);

  // Keep-alive comment ping every 25s (proxies often time out idle connections).
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    bus.off(channel, send);
    res.end();
  });
});
