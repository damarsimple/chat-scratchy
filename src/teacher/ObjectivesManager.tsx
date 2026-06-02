import { useEffect, useState, useCallback } from 'react';
import { teacherApi, OBJECTIVE_LABELS, type Objective, type ObjectiveInput } from '../api';

// Built-in heuristic checkers a teacher can attach to an objective so completion
// is auto-detected. '' means "no auto-check" (manual / observational objective).
const CHECK_KEY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'No auto-check' },
  ...Object.entries(OBJECTIVE_LABELS).map(([value, label]) => ({ value, label: `Auto: ${label}` })),
];

const EMPTY: ObjectiveInput = { title: '', description: '', checkKey: '' };

// Per-class objective editor: list, add, edit, delete. When a class has no
// objectives the student app falls back to the bundled built-in set.
export function ObjectivesManager({ classId }: { classId: string }) {
  const [objectives, setObjectives] = useState<Objective[] | null>(null);
  const [draft, setDraft] = useState<ObjectiveInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ObjectiveInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    teacherApi.listObjectives(classId).then(setObjectives).catch(console.error);
  }, [classId]);
  useEffect(load, [load]);

  const add = async () => {
    if (!draft.title.trim() || busy) return;
    setBusy(true);
    try { await teacherApi.createObjective(classId, draft); setDraft(EMPTY); load(); }
    finally { setBusy(false); }
  };
  const startEdit = (o: Objective) => {
    setEditingId(o.id);
    setEdit({ title: o.title, description: o.description, checkKey: o.checkKey ?? '' });
  };
  const saveEdit = async () => {
    if (!editingId || busy) return;
    setBusy(true);
    try { await teacherApi.updateObjective(editingId, edit); setEditingId(null); load(); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this objective?')) return;
    setBusy(true);
    try { await teacherApi.deleteObjective(id); load(); }
    finally { setBusy(false); }
  };

  const count = objectives?.length ?? 0;

  return (
    <div className="teacher-objectives">
      <button className="teacher-obj-header" onClick={() => setOpen((o) => !o)}>
        <span>🎯 Objectives ({count})</span>
        <span className="teacher-obj-hint">
          {count === 0 ? 'using built-in defaults — add to customize' : 'students see these'}
        </span>
        <span>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="teacher-obj-body">
          <ul className="teacher-obj-list">
            {objectives?.map((o) => (
              <li key={o.id} className="teacher-obj-item">
                {editingId === o.id ? (
                  <div className="teacher-obj-form">
                    <input
                      className="teacher-obj-input" value={edit.title}
                      onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Title"
                    />
                    <textarea
                      className="teacher-obj-textarea" value={edit.description ?? ''}
                      onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                      placeholder="What should the student build?"
                    />
                    <div className="teacher-obj-row">
                      <select
                        className="teacher-obj-select" value={edit.checkKey ?? ''}
                        onChange={(e) => setEdit({ ...edit, checkKey: e.target.value })}
                      >
                        {CHECK_KEY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <button className="teacher-control-btn primary" onClick={saveEdit} disabled={busy}>Save</button>
                      <button className="teacher-control-btn" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="teacher-obj-view">
                    <div className="teacher-obj-main">
                      <div className="teacher-obj-title">{o.title}</div>
                      {o.description && <div className="teacher-obj-desc">{o.description}</div>}
                      {o.checkKey && (
                        <span className="teacher-obj-badge">auto: {OBJECTIVE_LABELS[o.checkKey] ?? o.checkKey}</span>
                      )}
                    </div>
                    <div className="teacher-obj-actions">
                      <button className="teacher-control-btn" onClick={() => startEdit(o)}>Edit</button>
                      <button className="teacher-control-btn" onClick={() => remove(o.id)}>Delete</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="teacher-obj-form teacher-obj-add">
            <input
              className="teacher-obj-input" value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="New objective title"
            />
            <textarea
              className="teacher-obj-textarea" value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Description shown to the student / AI tutor"
            />
            <div className="teacher-obj-row">
              <select
                className="teacher-obj-select" value={draft.checkKey ?? ''}
                onChange={(e) => setDraft({ ...draft, checkKey: e.target.value })}
              >
                {CHECK_KEY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button className="teacher-control-btn primary" onClick={add} disabled={busy || !draft.title.trim()}>
                Add objective
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
