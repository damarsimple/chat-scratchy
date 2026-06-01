import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BlocklyPanel, type BlocklyPanelHandle } from '../BlocklyPanel';
import { ChatTranscript } from '../ChatTranscript';
import { Timeline } from './Timeline';
import { teacherApi, subscribeLive, type TeacherSession } from '../api';

type Tab = 'workspace' | 'code' | 'timeline';

// Read-only viewer of a single student session: chat replay on the left,
// their Blockly workspace / generated code / activity timeline on the right.
// Subscribes to the session SSE stream for near-real-time updates.
export function SessionViewer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [data, setData] = useState<TeacherSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('workspace');
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(new Set());
  const blocklyRef = useRef<BlocklyPanelHandle>(null);

  const refresh = useCallback(() => {
    if (!sessionId) return;
    teacherApi.getSession(sessionId).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(refresh, [refresh]);

  // Live updates for this session (throttled refresh).
  useEffect(() => {
    if (!sessionId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeLive({ sessionId }, () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; refresh(); }, 1200);
    });
    return () => { if (timer) clearTimeout(timer); unsub(); };
  }, [sessionId, refresh]);

  // Load the student's workspace JSON into the read-only Blockly panel.
  useEffect(() => {
    if (tab !== 'workspace' || !data?.latestWorkspace?.workspaceJson) return;
    // Defer so the panel has mounted/injected before we load state.
    const id = setTimeout(() => {
      blocklyRef.current?.loadWorkspaceState(data.latestWorkspace!.workspaceJson as object);
    }, 100);
    return () => clearTimeout(id);
  }, [tab, data?.latestWorkspace]);

  const toggleThinking = (idx: number) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  if (loading) return <div className="teacher-loading">Loading session…</div>;
  if (!data) return <div className="teacher-empty">Session not found.</div>;

  return (
    <div className="teacher-shell">
      <header className="teacher-topbar">
        <h1 className="teacher-topbar-title">
          <Link to="/teacher" className="teacher-back">←</Link>
          {data.student?.displayName ?? 'Student'} · {data.className ?? ''}
        </h1>
        <div className="teacher-topbar-right">
          <span className="teacher-stat-pill">{data.stats.interventionCount} AI hints</span>
          {data.stats.effectivenessRate !== null && (
            <span className="teacher-stat-pill">{data.stats.effectivenessRate}% effective</span>
          )}
          <span className="teacher-stat-pill">{data.objectiveId ?? 'no objective'}</span>
        </div>
      </header>

      <div className="teacher-viewer">
        {/* Left: chat replay */}
        <section className="teacher-viewer-chat">
          <div className="teacher-panel-label">Chat transcript</div>
          <div className="teacher-chat-scroll chat-container">
            <ChatTranscript
              messages={data.messages}
              t={(k) => k}
              expandedThinking={expandedThinking}
              onToggleThinking={toggleThinking}
            />
          </div>
        </section>

        {/* Right: workspace / code / timeline */}
        <section className="teacher-viewer-work">
          <div className="teacher-tabs">
            <button className={`teacher-tab ${tab === 'workspace' ? 'active' : ''}`} onClick={() => setTab('workspace')}>Blocks</button>
            <button className={`teacher-tab ${tab === 'code' ? 'active' : ''}`} onClick={() => setTab('code')}>Code</button>
            <button className={`teacher-tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>Timeline</button>
          </div>

          <div className="teacher-tab-body">
            {tab === 'workspace' && (
              data.latestWorkspace?.workspaceJson
                ? <BlocklyPanel ref={blocklyRef} readOnly />
                : <div className="teacher-empty-sm">No saved workspace for this session yet.</div>
            )}
            {tab === 'code' && (
              <pre className="teacher-code">{data.latestWorkspace?.generatedCode || '// No generated code yet.'}</pre>
            )}
            {tab === 'timeline' && (
              <Timeline interventions={data.interventions} events={data.activityEvents} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
