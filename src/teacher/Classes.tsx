import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { teacherApi, type ClassSummary } from '../api';
import { useTeacherAuth } from './TeacherAuth';

// Teacher landing page: list of classes + create a new one.
export function Classes() {
  const { teacher, logout } = useTeacherAuth();
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    teacherApi.listClasses().then(setClasses).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const createClass = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await teacherApi.createClass(newName.trim());
      setNewName('');
      refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="teacher-shell">
      <header className="teacher-topbar">
        <h1 className="teacher-topbar-title">📘 Scratchy Dashboard</h1>
        <div className="teacher-topbar-right">
          <span className="teacher-whoami">{teacher?.name}</span>
          <button className="teacher-link-btn" onClick={() => void logout()}>Log out</button>
        </div>
      </header>

      <main className="teacher-main">
        <div className="teacher-create-row">
          <input
            className="teacher-input"
            placeholder="New class name (e.g. Grade 5 — Period 2)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void createClass(); }}
          />
          <button className="teacher-btn-primary" onClick={() => void createClass()} disabled={creating || !newName.trim()}>
            + Create class
          </button>
        </div>

        {loading ? (
          <div className="teacher-loading">Loading classes…</div>
        ) : classes.length === 0 ? (
          <div className="teacher-empty">No classes yet. Create one above, then share its join code with students.</div>
        ) : (
          <div className="teacher-class-grid">
            {classes.map((c) => (
              <Link key={c.id} to={`/teacher/classes/${c.id}`} className="teacher-class-card">
                <div className="teacher-class-name">{c.name}</div>
                <div className="teacher-class-code">Join code: <strong>{c.joinCode}</strong></div>
                <div className="teacher-class-stats">
                  <span>{c.studentCount} students</span>
                  <span>{c.sessionCount} sessions</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
