import type { BlockData } from './scratchPatterns';

interface DiffResult {
  status: 'no_change' | 'reverted' | 'deleting_more_than_adding' | 'progressing' | 'unknown';
}

interface SnapshotEntry {
  snapshot: BlockData[];
  at: number;
}

function countNewBlocks(from: BlockData[], to: BlockData[]): number {
  const fromIds = new Set(from.map(b => b.id));
  return to.filter(b => !fromIds.has(b.id)).length;
}

export function analyzeBlockDiff(history: SnapshotEntry[]): DiffResult {
  if (history.length < 2) return { status: 'unknown' };

  const latestEntry = history[history.length - 1];
  const previousEntry = history[history.length - 2];
  if (!latestEntry || !previousEntry) return { status: 'unknown' };

  const latest = latestEntry.snapshot;
  const previous = previousEntry.snapshot;

  if (JSON.stringify(latest) === JSON.stringify(previous)) {
    return { status: 'no_change' };
  }

  const olderMatch = history
    .slice(0, -2)
    .some(h => JSON.stringify(h.snapshot) === JSON.stringify(latest));

  if (olderMatch) {
    return { status: 'reverted' };
  }

  const added = countNewBlocks(previous, latest);
  const removed = countNewBlocks(latest, previous);

  if (removed > added && removed >= 3) {
    return { status: 'deleting_more_than_adding' };
  }

  return { status: 'progressing' };
}
