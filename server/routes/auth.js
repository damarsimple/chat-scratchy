import { Router } from 'express';
import { prisma } from '../lib/db.js';
import {
  hashPassword, verifyPassword, signTeacherToken,
  setAuthCookie, clearAuthCookie, requireTeacher,
} from '../lib/auth.js';

export const authRouter = Router();

// POST /api/auth/register { email, password, name }
authRouter.post('/register', async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password and name are required' });
  }
  const existing = await prisma.teacher.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const teacher = await prisma.teacher.create({
    data: { email, name, passwordHash: await hashPassword(password) },
  });
  setAuthCookie(res, signTeacherToken(teacher));
  res.json({ id: teacher.id, email: teacher.email, name: teacher.name });
});

// POST /api/auth/login { email, password }
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const teacher = await prisma.teacher.findUnique({ where: { email } });
  if (!teacher || !(await verifyPassword(password, teacher.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  setAuthCookie(res, signTeacherToken(teacher));
  res.json({ id: teacher.id, email: teacher.email, name: teacher.name });
});

// POST /api/auth/logout
authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

// GET /api/auth/me
authRouter.get('/me', requireTeacher, async (req, res) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id: req.teacherId },
    select: { id: true, email: true, name: true },
  });
  if (!teacher) return res.status(401).json({ error: 'Not authenticated' });
  res.json(teacher);
});
