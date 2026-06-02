import type { BlockData } from './scratchPatterns';

// Heuristic "did the student achieve this objective?" checks.
// These are intentionally lenient — they reward the key concept of each task,
// not a pixel-perfect solution. Used for the student ✅ banner, roster status,
// and the class aggregate view.

function flatten(blocks: BlockData[]): BlockData[] {
  const out: BlockData[] = [];
  const walk = (list: BlockData[]) => {
    for (const b of list) {
      out.push(b);
      if (b.children) walk(b.children);
      for (const v of Object.values(b.inputs)) {
        if (typeof v === 'object' && v !== null) walk([v as BlockData]);
      }
    }
  };
  walk(blocks);
  return out;
}

const HAT_TYPES = [
  'event_whenflagclicked', 'event_whenkeypressed',
  'event_whenthisspriteclicked', 'scratch_whenireceive', 'scratch_whenclonestart',
];
const LOOP_TYPES = ['controls_whileUntil', 'controls_repeat_ext'];

interface ObjectiveCheck {
  id: string;
  // Returns the fraction of sub-goals met (0..1); 1 === complete.
  progress: (flat: BlockData[]) => number;
}

const has = (flat: BlockData[], pred: (b: BlockData) => boolean) => flat.some(pred);
const ratio = (parts: boolean[]) => parts.filter(Boolean).length / parts.length;

const CHECKS: Record<string, ObjectiveCheck> = {
  animation: {
    id: 'animation',
    progress: (flat) => ratio([
      has(flat, (b) => HAT_TYPES.includes(b.type)),
      has(flat, (b) => b.category === 'motion'),
      has(flat, (b) => LOOP_TYPES.includes(b.type)) ||
        has(flat, (b) => b.type === 'scratch_nextcostume' || b.type === 'scratch_switchcostume'),
    ]),
  },
  'cat-mouse': {
    id: 'cat-mouse',
    progress: (flat) => ratio([
      has(flat, (b) => HAT_TYPES.includes(b.type)),
      has(flat, (b) => LOOP_TYPES.includes(b.type)),
      has(flat, (b) => b.type === 'scratch_goto' || b.type.startsWith('scratch_mouse') || b.type === 'scratch_distancetomouse'),
      has(flat, (b) => b.type === 'controls_if' || b.type === 'scratch_touchingmouse'),
    ]),
  },
  quiz: {
    id: 'quiz',
    progress: (flat) => ratio([
      has(flat, (b) => HAT_TYPES.includes(b.type)),
      has(flat, (b) => b.type === 'scratch_askandwait'),
      has(flat, (b) => b.type === 'controls_if' || b.type === 'logic_compare'),
      has(flat, (b) => b.type === 'scratch_answer' || b.type === 'logic_compare'),
    ]),
  },
  pong: {
    id: 'pong',
    progress: (flat) => ratio([
      has(flat, (b) => HAT_TYPES.includes(b.type)),
      has(flat, (b) => LOOP_TYPES.includes(b.type)),
      has(flat, (b) => b.type === 'scratch_ifonedgebounce' || b.type === 'scratch_touchingedge'),
      has(flat, (b) => b.type === 'event_whenkeypressed' || b.type === 'scratch_keypressed'),
    ]),
  },
  falling: {
    id: 'falling',
    progress: (flat) => ratio([
      has(flat, (b) => HAT_TYPES.includes(b.type)),
      has(flat, (b) => LOOP_TYPES.includes(b.type)),
      has(flat, (b) => b.type === 'scratch_changey' || b.type === 'scratch_sety' || b.type === 'scratch_glide'),
      has(flat, (b) => b.type === 'controls_if' || b.type === 'scratch_touchingmouse'),
    ]),
  },
};

export interface ObjectiveStatus {
  progress: number;   // 0..1
  complete: boolean;
}

// Evaluate an objective against the current workspace blocks.
// Unknown objective ids (e.g. teacher-authored custom ones) return null — we
// can't auto-grade those yet, only the built-in templates.
export function checkObjective(objectiveId: string | null | undefined, blocks: BlockData[]): ObjectiveStatus | null {
  if (!objectiveId) return null;
  const check = CHECKS[objectiveId];
  if (!check) return null;
  const flat = flatten(blocks);
  if (flat.length === 0) return { progress: 0, complete: false };
  const progress = check.progress(flat);
  return { progress, complete: progress >= 1 };
}

export function hasObjectiveCheck(objectiveId: string | null | undefined): boolean {
  return !!objectiveId && objectiveId in CHECKS;
}
