import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const app = express();
const PORT = 3001;

const DATA_FILE = './sessions.json';

app.use(cors());
app.use(express.json());

function loadSessions() {
  if (existsSync(DATA_FILE)) {
    try {
      return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveSessions(sessions) {
  writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2));
}

let sessions = loadSessions();

app.get('/api/sessions', (_req, res) => {
  const list = Object.entries(sessions).map(([id, data]) => ({
    id,
    title: data.messages[0]?.content?.slice(0, 50) || 'New Chat',
    updatedAt: data.updatedAt,
  }));
  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json(list);
});

app.post('/api/sessions', (_req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  sessions[id] = { messages: [], createdAt: now, updatedAt: now };
  saveSessions(sessions);
  res.json({ id });
});

app.get('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const session = sessions[id];
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

app.put('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const { messages } = req.body;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  sessions[id].messages = messages;
  sessions[id].updatedAt = new Date().toISOString();
  saveSessions(sessions);
  res.json({ success: true });
});

app.delete('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  delete sessions[id];
  saveSessions(sessions);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});