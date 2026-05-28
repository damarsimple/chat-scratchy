import { useRef, useCallback } from 'react';
import type { BlockData } from './scratchPatterns';

interface Intervention {
  id: number;
  at: number;
  patternId: string | null;
  message: string;
  blockSnapshotAtTime: BlockData[];
  outcome: 'helped' | 'ignored' | 'pending' | null;
}

const IGNORED_AFTER_MS = 180_000;
const MIN_ELAPSED_BEFORE_RESOLVE_MS = 10_000;

export function useInterventionTracker() {
  const interventions = useRef<Intervention[]>([]);

  const recordIntervention = useCallback((decision: { patternId?: string | null; message?: string }, blockSnapshotAtTime: BlockData[]) => {
    interventions.current.push({
      id: Date.now(),
      at: Date.now(),
      patternId: decision.patternId ?? null,
      message: decision.message ?? '',
      blockSnapshotAtTime,
      outcome: null,
    });
  }, []);

  const resolveWithBlockChange = useCallback((newSnapshot: BlockData[]) => {
    const now = Date.now();
    interventions.current = interventions.current.map(inv => {
      if (inv.outcome !== null) return inv;
      const elapsed = now - inv.at;
      if (elapsed < MIN_ELAPSED_BEFORE_RESOLVE_MS) return inv;
      const changed = JSON.stringify(inv.blockSnapshotAtTime) !== JSON.stringify(newSnapshot);
      // Mark as helped if blocks changed, ignored if they have not changed after the timeout
      const outcome = changed ? 'helped' : (elapsed > IGNORED_AFTER_MS ? 'ignored' : null);
      return { ...inv, outcome };
    });
  }, []);

  const expirePending = useCallback(() => {
    const now = Date.now();
    interventions.current = interventions.current.map(inv => ({
      ...inv,
      outcome: inv.outcome === null && now - inv.at > IGNORED_AFTER_MS
        ? 'ignored'
        : inv.outcome,
    }));
  }, []);

  const getRecentInterventions = useCallback((windowMs = 600_000) => {
    const cutoff = Date.now() - windowMs;
    return interventions.current
      .filter(i => i.at > cutoff)
      .map(({ id, at, patternId, outcome }) => ({ id, at, patternId, outcome }));
  }, []);

  const getEffectivenessRate = useCallback((): number | null => {
    const resolved = interventions.current.filter(i => i.outcome && i.outcome !== 'pending');
    if (resolved.length === 0) return null;
    const helped = resolved.filter(i => i.outcome === 'helped').length;
    return Math.round((helped / resolved.length) * 100);
  }, []);

  return {
    recordIntervention,
    resolveWithBlockChange,
    expirePending,
    getRecentInterventions,
    getEffectivenessRate,
  };
}
