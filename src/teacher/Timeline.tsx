import type { Intervention, ActivityEvent } from '../api';

interface TimelineProps {
  interventions: Intervention[];
  events: ActivityEvent[];
}

type Item = {
  at: number;
  kind: 'intervention' | 'event';
  icon: string;
  label: string;
  detail?: string | undefined;
  outcome?: string | null | undefined;
};

const EVENT_ICON: Record<string, string> = {
  confidence: '🎚️',
  run: '▶',
  stuck: '⏳',
  student_message: '💬',
  block_change: '🧩',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Merged chronological timeline of AI interventions + activity events.
export function Timeline({ interventions, events }: TimelineProps) {
  const items: Item[] = [
    ...interventions.map((i): Item => ({
      at: new Date(i.createdAt).getTime(),
      kind: 'intervention',
      icon: '🤖',
      label: i.message || 'AI intervention',
      detail: i.patternId ? `pattern: ${i.patternId}` : undefined,
      outcome: i.outcome,
    })),
    ...events.map((e): Item => {
      const sig = typeof e.payload?.signal === 'string' ? ` (${e.payload.signal})` : '';
      return {
        at: new Date(e.createdAt).getTime(),
        kind: 'event',
        icon: EVENT_ICON[e.type] ?? '•',
        label: e.type + sig,
      };
    }),
  ].sort((a, b) => a.at - b.at);

  if (items.length === 0) {
    return <div className="teacher-empty-sm">No activity recorded yet.</div>;
  }

  return (
    <div className="teacher-timeline">
      {items.map((it, i) => (
        <div key={i} className={`teacher-timeline-item teacher-timeline-${it.kind}`}>
          <span className="teacher-timeline-icon">{it.icon}</span>
          <div className="teacher-timeline-body">
            <div className="teacher-timeline-label">
              {it.label}
              {it.outcome && <span className={`teacher-outcome teacher-outcome-${it.outcome}`}>{it.outcome}</span>}
            </div>
            {it.detail && <div className="teacher-timeline-detail">{it.detail}</div>}
          </div>
          <span className="teacher-timeline-time">{fmtTime(new Date(it.at).toISOString())}</span>
        </div>
      ))}
    </div>
  );
}
