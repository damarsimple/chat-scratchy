import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teacherApi, subscribeLive, objectiveLabel, type ClassDetail as ClassDetailData } from '../api';
import { ObjectivesManager } from './ObjectivesManager';

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// Class roster with per-student live status. Subscribes to the class SSE
// stream and re-fetches the roster on any update (debounced by a short timer).
export function ClassDetail() {
  const { classId } = useParams<{ classId: string }>();
  const [data, setData] = useState<ClassDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!classId) return;
    teacherApi.getClass(classId).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [classId]);

  useEffect(refresh, [refresh]);

  // Live updates: any student activity in this class → refresh roster (throttled).
  useEffect(() => {
    if (!classId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeLive({ classId }, () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; refresh(); }, 1500);
    });
    return () => { if (timer) clearTimeout(timer); unsub(); };
  }, [classId, refresh]);

  if (loading) return <div className="teacher-loading">Loading roster…</div>;
  if (!data) return <div className="teacher-empty">Class not found.</div>;

  return (
    <div className="teacher-shell">
      <header className="teacher-topbar">
        <h1 className="teacher-topbar-title">
          <Link to="/teacher" className="teacher-back">←</Link> {data.name}
        </h1>
        <div className="teacher-topbar-right">
          <span className="teacher-code-badge">Join code: <strong>{data.joinCode}</strong></span>
        </div>
      </header>

      <main className="teacher-main">
        {classId && <ObjectivesManager classId={classId} />}

        {/* Class aggregate overview */}
        {data.aggregate && data.roster.length > 0 && (
          <div className="teacher-aggregate">
            <div className="teacher-agg-cards">
              <div className="teacher-agg-card">
                <div className="teacher-agg-num">{data.aggregate.totalStudents}</div>
                <div className="teacher-agg-label">students</div>
              </div>
              <div className="teacher-agg-card">
                <div className="teacher-agg-num teacher-agg-online">{data.aggregate.online}</div>
                <div className="teacher-agg-label">active now</div>
              </div>
              <div className="teacher-agg-card">
                <div className="teacher-agg-num teacher-agg-done">{data.aggregate.completed}</div>
                <div className="teacher-agg-label">completed</div>
              </div>
            </div>
            <div className="teacher-agg-objectives">
              {data.aggregate.byObjective.map((o) => (
                <div key={o.objectiveId ?? 'none'} className="teacher-agg-obj">
                  <span className="teacher-agg-obj-name">{o.objectiveTitle ?? objectiveLabel(o.objectiveId)}</span>
                  <div className="teacher-agg-bar">
                    <div
                      className="teacher-agg-bar-fill"
                      style={{ width: `${o.students ? (o.completed / o.students) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="teacher-agg-obj-count">{o.completed}/{o.students}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.roster.length === 0 ? (
          <div className="teacher-empty">No students have joined yet. Share join code <strong>{data.joinCode}</strong>.</div>
        ) : (
          <table className="teacher-roster">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Objective</th>
                <th>Progress</th>
                <th>Blocks</th>
                <th>AI hints</th>
                <th>Last active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.roster.map((s) => (
                <tr key={s.studentId}>
                  <td className="teacher-roster-name">{s.displayName}</td>
                  <td>
                    <span className={`teacher-dot ${s.online ? 'online' : 'offline'}`} />
                    {s.online ? 'Active' : 'Idle'}
                  </td>
                  <td>{s.objectiveTitle ?? objectiveLabel(s.objectiveId)}</td>
                  <td>
                    {s.objectiveComplete
                      ? <span className="teacher-badge-done">✅ Done</span>
                      : <span className="teacher-muted">in progress</span>}
                  </td>
                  <td className="teacher-roster-blocks" title={s.blockSummary}>
                    {s.blockSummary ? s.blockSummary.split('\n')[0] : '—'}
                  </td>
                  <td>{s.interventionCount}</td>
                  <td>{timeAgo(s.lastActiveAt)}</td>
                  <td>
                    {s.latestSessionId
                      ? <Link className="teacher-view-link" to={`/teacher/sessions/${s.latestSessionId}`}>Open →</Link>
                      : <span className="teacher-muted">no session</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
