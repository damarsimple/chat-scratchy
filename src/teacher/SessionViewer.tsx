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
  // Live control: when on, the workspace panel becomes editable so the teacher
  // can rearrange blocks and push the result to the student.
  const [editMode, setEditMode] = useState(false);
  const [controlMsg, setControlMsg] = useState<string | null>(null);
  const blocklyRef = useRef<BlocklyPanelHandle>(null);

  const refresh = useCallback(() => {
    if (!sessionId) return;
    teacherApi.getSession(sessionId).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(refresh, [refresh]);

  // Don't let the live refresh reload the workspace mid-edit and wipe the
  // teacher's in-progress changes.
  const editModeRef = useRef(false);
  editModeRef.current = editMode;

  // Live updates for this session (throttled refresh, paused while editing).
  useEffect(() => {
    if (!sessionId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeLive({ sessionId }, () => {
      if (timer || editModeRef.current) return;
      timer = setTimeout(() => { timer = null; refresh(); }, 1200);
    });
    return () => { if (timer) clearTimeout(timer); unsub(); };
  }, [sessionId, refresh]);

  // Load the student's workspace JSON into the Blockly panel. Re-runs when the
  // panel remounts (edit-mode toggle) so the teacher always starts from the
  // student's current blocks. Skipped in edit mode on a live refresh so we don't
  // clobber the teacher's in-progress edits.
  useEffect(() => {
    if (tab !== 'workspace' || !data?.latestWorkspace?.workspaceJson) return;
    // Defer so the panel has mounted/injected before we load state.
    const id = setTimeout(() => {
      blocklyRef.current?.loadWorkspaceState(data.latestWorkspace!.workspaceJson as object);
    }, 100);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, editMode, data?.latestWorkspace?.id]);

  const toggleThinking = (idx: number) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // ── Live control: push commands to the student's screen ──────────────
  const flashControl = (msg: string) => {
    setControlMsg(msg);
    setTimeout(() => setControlMsg((m) => (m === msg ? null : m)), 2500);
  };
  const send = (type: 'highlight' | 'tip' | 'clear' | 'load_workspace', payload?: unknown) => {
    if (!sessionId) return;
    teacherApi.sendCommand(sessionId, type, payload).catch((e) => flashControl(`Failed: ${e.message ?? e}`));
  };
  const highlightSelected = () => {
    const id = blocklyRef.current?.getSelectedBlockId();
    if (!id) return flashControl('Turn on Edit mode, then click a block to select it.');
    send('highlight', { blockId: id });
    flashControl('Highlighted on student’s screen.');
  };
  const tipSelected = () => {
    const id = blocklyRef.current?.getSelectedBlockId();
    if (!id) return flashControl('Turn on Edit mode, then click a block to select it.');
    const message = window.prompt('Tip to show on the student’s block:');
    if (!message) return;
    send('tip', { blockId: id, message });
    flashControl('Tip sent.');
  };
  const clearStudent = () => { send('clear'); flashControl('Cleared on student’s screen.'); };
  const pushWorkspace = () => {
    const ref = blocklyRef.current;
    if (!ref) return;
    send('load_workspace', {
      workspaceJson: ref.getWorkspaceState(),
      generatedCode: ref.getGeneratedCode(),
      blockSummary: ref.getContext(),
    });
    flashControl('Pushed your blocks to the student.');
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

      {data.studentProfile?.profile && (
        <div className="teacher-memory">
          <span className="teacher-memory-label">🧠 AI memory</span>
          <span className="teacher-memory-text">{data.studentProfile.profile}</span>
          {data.studentProfile.profileUpdatedAt && (
            <span className="teacher-memory-time">
              updated {new Date(data.studentProfile.profileUpdatedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

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
              data.latestWorkspace?.workspaceJson ? (
                <>
                  <div className="teacher-control-bar">
                    <button className="teacher-control-btn" onClick={highlightSelected}>👉 Highlight</button>
                    <button className="teacher-control-btn" onClick={tipSelected}>💬 Tip</button>
                    <button className="teacher-control-btn" onClick={clearStudent}>✖ Clear</button>
                    <span className="teacher-control-sep" />
                    <button
                      className={`teacher-control-btn ${editMode ? 'active' : ''}`}
                      onClick={() => setEditMode((e) => !e)}
                    >
                      {editMode ? '🔓 Editing' : '✏️ Edit mode'}
                    </button>
                    {editMode && (
                      <button className="teacher-control-btn primary" onClick={pushWorkspace}>⬆ Push to student</button>
                    )}
                    {controlMsg && <span className="teacher-control-msg">{controlMsg}</span>}
                  </div>
                  {/* key flips on edit toggle to remount the panel editable/read-only */}
                  <BlocklyPanel key={editMode ? 'edit' : 'ro'} ref={blocklyRef} readOnly={!editMode} />
                </>
              ) : (
                <div className="teacher-empty-sm">No saved workspace for this session yet.</div>
              )
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
