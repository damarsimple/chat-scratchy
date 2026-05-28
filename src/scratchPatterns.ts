export interface BlockData {
  id: string;
  type: string;
  category: string;
  inputs: Record<string, number | string | BlockData>;
  children: BlockData[];
}

export interface ScratchPattern {
  id: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  detect: (blocks: BlockData[]) => boolean;
  hint: string;
}

const CATEGORY_MAP: Record<string, string> = {
  scratch_move: 'motion',
  scratch_turn: 'motion',
  scratch_goto: 'motion',
  scratch_glide: 'motion',
  scratch_changex: 'motion',
  scratch_setx: 'motion',
  scratch_changey: 'motion',
  scratch_sety: 'motion',
  scratch_ifonedgebounce: 'motion',
  scratch_xposition: 'motion',
  scratch_yposition: 'motion',
  scratch_direction: 'motion',
  scratch_say: 'looks',
  scratch_show: 'looks',
  scratch_hide: 'looks',
  scratch_changesize: 'looks',
  scratch_setsize: 'looks',
  scratch_size: 'looks',
  scratch_wait: 'control',
  controls_repeat: 'control',
  controls_whileUntil: 'control',
  controls_if: 'control',
  scratch_touching: 'sensing',
  scratch_distance: 'sensing',
  scratch_mouse: 'sensing',
  scratch_keypressed: 'sensing',
  logic_compare: 'logic',
  logic_operation: 'logic',
  logic_boolean: 'logic',
  text: 'text',
  math_number: 'math',
  math_arithmetic: 'math',
  math_random_int: 'math',
};

function inferCategory(type: string): string {
  for (const [prefix, cat] of Object.entries(CATEGORY_MAP)) {
    if (type.startsWith(prefix)) return cat;
  }
  return 'other';
}

export function buildBlockData(block: BlocklyBlock, visited?: Set<string>): BlockData {
  const vis = visited ?? new Set<string>();
  if (vis.has(block.id)) return { id: block.id, type: block.type, category: 'other', inputs: {}, children: [] };
  vis.add(block.id);

  const inputs: Record<string, number | string | BlockData> = {};
  const inputList = block.inputList ?? [];
  for (const input of inputList) {
    const target = input.connection?.targetBlock();
    if (target) {
      if (target.type === 'math_number') {
        const val = target.getFieldValue('NUM');
        inputs[input.name] = val !== null ? Number(val) : 0;
      } else {
        inputs[input.name] = buildBlockData(target, vis);
      }
    }
  }

  const children: BlockData[] = [];
  let nextBlock = block.nextConnection?.targetBlock();
  while (nextBlock) {
    if (!vis.has(nextBlock.id)) {
      children.push(buildBlockData(nextBlock, vis));
    }
    nextBlock = nextBlock.nextConnection?.targetBlock();
  }

  return {
    id: block.id,
    type: block.type,
    category: inferCategory(block.type),
    inputs,
    children,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlocklyBlock = any;

export function extractAllBlocks(topBlocks: BlocklyBlock[]): BlockData[] {
  const result: BlockData[] = [];
  const visited = new Set<string>();
  for (const block of topBlocks) {
    result.push(buildBlockData(block, visited));
  }
  return result;
}

function flattenBlocks(blocks: BlockData[]): BlockData[] {
  const result: BlockData[] = [];
  function walk(list: BlockData[]) {
    for (const b of list) {
      result.push(b);
      if (b.children) walk(b.children);
      for (const v of Object.values(b.inputs)) {
        if (typeof v === 'object' && v !== null) {
          walk([v as BlockData]);
        }
      }
    }
  }
  walk(blocks);
  return result;
}

const HAT_BLOCK_TYPES = [
  'event_whenflagclicked',
  'event_whenkeypressed',
  'event_whenthisspriteclicked',
  'scratch_whenireceive',
  'scratch_whenclonestart',
];

export const SCRATCH_PATTERNS: ScratchPattern[] = [
  {
    id: 'no_start_block',
    description: 'No startable block (no event hat, forever loop, or repeat)',
    severity: 'high',
    detect: (blocks) => {
      const flat = flattenBlocks(blocks);
      return flat.length > 0 &&
        !flat.some(b =>
          HAT_BLOCK_TYPES.includes(b.type) ||
          b.type === 'controls_whileUntil' ||
          b.type === 'controls_repeat_ext'
        );
    },
    hint: '你的積木缺少「事件」觸發器（例如「當綠旗被點擊」）或「重複執行」——程式只會跑一次就結束了。',
  },
  {
    id: 'motion_without_loop',
    description: 'Motion blocks exist but no forever/repeat loop',
    severity: 'medium',
    detect: (blocks) => {
      const flat = flattenBlocks(blocks);
      // Only trigger if there's also no hat block (hat + no loop is valid for one-shot movement)
      const hasHat = flat.some(b => HAT_BLOCK_TYPES.includes(b.type));
      return hasHat &&
        flat.some(b => b.category === 'motion') &&
        !flat.some(b => b.type === 'controls_whileUntil' || b.type === 'controls_repeat_ext');
    },
    hint: '角色移動的積木在迴圈外面——它只會動一次就停了。試試用「重複執行」包住移動積木。',
  },
  {
    id: 'condition_without_loop',
    description: 'If block exists but no loop wrapping it',
    severity: 'medium',
    detect: (blocks) => {
      const flat = flattenBlocks(blocks);
      return flat.some(b => b.type === 'controls_if' || b.type === 'logic_compare') &&
        !flat.some(b => b.type === 'controls_whileUntil' || b.type === 'controls_repeat_ext');
    },
    hint: '你的「如果」積木只會被檢查一次——它需要放在「重複無限次」裡面。',
  },
  {
    id: 'sprite_offscreen',
    description: 'X or Y coordinates set outside visible stage',
    severity: 'low',
    detect: (blocks) => {
      const flat = flattenBlocks(blocks);
      return flat.some(b =>
        (b.type === 'scratch_goto' || b.type === 'scratch_glide') &&
        (typeof b.inputs['X'] === 'number' && Math.abs(b.inputs['X'] as number) > 240 ||
         typeof b.inputs['Y'] === 'number' && Math.abs(b.inputs['Y'] as number) > 180)
      );
    },
    hint: '角色的位置在舞台外面，你可能看不到它。',
  },
  {
    id: 'empty_loop_body',
    description: 'Loop block with no blocks inside',
    severity: 'low',
    detect: (blocks) => {
      const flat = flattenBlocks(blocks);
      return flat.some(b =>
        (b.type === 'controls_whileUntil' || b.type === 'controls_repeat_ext') &&
        !b.inputs['DO']
      );
    },
    hint: '你有一個迴圈積木，但裡面還沒有放任何積木——它現在什麼都不會做。',
  },
];

export function runPatternMatcher(blocks: BlockData[]): ScratchPattern[] {
  if (!blocks || blocks.length === 0) return [];
  return SCRATCH_PATTERNS.filter(p => {
    try { return p.detect(blocks); } catch { return false; }
  });
}
