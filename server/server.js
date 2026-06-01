import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { authRouter } from './routes/auth.js';
import { teacherRouter } from './routes/teacher.js';
import { studentRouter } from './routes/student.js';
import { streamRouter } from './routes/stream.js';
import { prisma } from './lib/db.js';

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' })); // blockly snapshots can be largish
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/teacher', teacherRouter);
app.use('/api/teacher', streamRouter); // GET /api/teacher/stream
// Student + session endpoints (also serves the existing student app routes).
app.use('/api', studentRouter);

// Centralized error handler so a thrown route never hangs the request.
app.use((err, _req, res, _next) => {
  console.error('[server] error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function shutdown() {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
