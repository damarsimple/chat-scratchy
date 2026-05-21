import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';

export interface BlocklyPanelHandle {
  getContext(): string;
  highlightBlock(ref: string): void;
  suggestCategory(category: string): void;
}

// ── Sprite state ───────────────────────────────────────────────────

interface SpriteState {
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
}

function defaultSprite(): SpriteState {
  return { x: 0, y: 0, direction: 90, size: 100, visible: true };
}

// ── Custom blocks ──────────────────────────────────────────────────

function defineBlock(type: string, def: Record<string, unknown>) {
  Blockly.Blocks[type] = { init() { this.jsonInit(def); } };
}

defineBlock('scratch_movesteps', {
  message0: 'move %1 steps',
  args0: [{ type: 'input_value', name: 'STEPS', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_turnright', {
  message0: 'turn right %1 degrees',
  args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_turnleft', {
  message0: 'turn left %1 degrees',
  args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_goto', {
  message0: 'go to x: %1 y: %2',
  args0: [
    { type: 'input_value', name: 'X', check: 'Number' },
    { type: 'input_value', name: 'Y', check: 'Number' },
  ],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_glide', {
  message0: 'glide %1 secs to x: %2 y: %3',
  args0: [
    { type: 'input_value', name: 'SECS', check: 'Number' },
    { type: 'input_value', name: 'X', check: 'Number' },
    { type: 'input_value', name: 'Y', check: 'Number' },
  ],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_changex', {
  message0: 'change x by %1',
  args0: [{ type: 'input_value', name: 'DX', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_setx', {
  message0: 'set x to %1',
  args0: [{ type: 'input_value', name: 'X', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_changey', {
  message0: 'change y by %1',
  args0: [{ type: 'input_value', name: 'DY', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_sety', {
  message0: 'set y to %1',
  args0: [{ type: 'input_value', name: 'Y', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_ifonedgebounce', {
  message0: 'if on edge, bounce',
  previousStatement: null, nextStatement: null, colour: 120,
});

defineBlock('scratch_xposition', {
  message0: 'x position',
  output: 'Number', colour: 120,
});

defineBlock('scratch_yposition', {
  message0: 'y position',
  output: 'Number', colour: 120,
});

defineBlock('scratch_direction', {
  message0: 'direction',
  output: 'Number', colour: 120,
});

defineBlock('scratch_says', {
  message0: 'say %1',
  args0: [{ type: 'input_value', name: 'TEXT' }],
  previousStatement: null, nextStatement: null, colour: 200,
});

defineBlock('scratch_sayseconds', {
  message0: 'say %1 for %2 seconds',
  args0: [
    { type: 'input_value', name: 'TEXT' },
    { type: 'input_value', name: 'SECS', check: 'Number' },
  ],
  previousStatement: null, nextStatement: null, colour: 200,
});

defineBlock('scratch_show', {
  message0: 'show',
  previousStatement: null, nextStatement: null, colour: 200,
});

defineBlock('scratch_hide', {
  message0: 'hide',
  previousStatement: null, nextStatement: null, colour: 200,
});

defineBlock('scratch_changesize', {
  message0: 'change size by %1',
  args0: [{ type: 'input_value', name: 'DELTA', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 200,
});

defineBlock('scratch_setsize', {
  message0: 'set size to %1 %',
  args0: [{ type: 'input_value', name: 'SIZE', check: 'Number' }],
  previousStatement: null, nextStatement: null, colour: 200,
});

defineBlock('scratch_size', {
  message0: 'size',
  output: 'Number', colour: 200,
});

defineBlock('scratch_touchingmouse', {
  message0: 'touching mouse-pointer?',
  output: 'Boolean', colour: 60,
});

defineBlock('scratch_touchingedge', {
  message0: 'touching edge?',
  output: 'Boolean', colour: 60,
});

defineBlock('scratch_distancetomouse', {
  message0: 'distance to mouse-pointer',
  output: 'Number', colour: 60,
});

defineBlock('scratch_mousex', {
  message0: 'mouse x',
  output: 'Number', colour: 60,
});

defineBlock('scratch_mousey', {
  message0: 'mouse y',
  output: 'Number', colour: 60,
});

defineBlock('scratch_keypressed', {
  message0: 'key %1 pressed?',
  args0: [
    {
      type: 'field_dropdown',
      name: 'KEY',
      options: [
        ['space', 'space'],
        ['up arrow', 'ArrowUp'],
        ['down arrow', 'ArrowDown'],
        ['left arrow', 'ArrowLeft'],
        ['right arrow', 'ArrowRight'],
        ['a', 'a'],
        ['b', 'b'],
      ],
    },
  ],
  output: 'Boolean', colour: 60,
});

// ── JavaScript generators ──────────────────────────────────────────

javascriptGenerator.forBlock['scratch_movesteps'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'STEPS', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchMove(${v});\n`;
};
javascriptGenerator.forBlock['scratch_turnright'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'DEGREES', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchTurn(${v});\n`;
};
javascriptGenerator.forBlock['scratch_turnleft'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'DEGREES', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchTurn(-${v});\n`;
};
javascriptGenerator.forBlock['scratch_goto'] = function (b) {
  const x = javascriptGenerator.valueToCode(b, 'X', javascriptGenerator.ORDER_NONE) || '0';
  const y = javascriptGenerator.valueToCode(b, 'Y', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchGoTo(${x}, ${y});\n`;
};
javascriptGenerator.forBlock['scratch_glide'] = function (b) {
  const s = javascriptGenerator.valueToCode(b, 'SECS', javascriptGenerator.ORDER_NONE) || '1';
  const x = javascriptGenerator.valueToCode(b, 'X', javascriptGenerator.ORDER_NONE) || '0';
  const y = javascriptGenerator.valueToCode(b, 'Y', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchGlide(${s}, ${x}, ${y});\n`;
};
javascriptGenerator.forBlock['scratch_changex'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'DX', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchChangeX(${v});\n`;
};
javascriptGenerator.forBlock['scratch_setx'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'X', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchSetX(${v});\n`;
};
javascriptGenerator.forBlock['scratch_changey'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'DY', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchChangeY(${v});\n`;
};
javascriptGenerator.forBlock['scratch_sety'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'Y', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchSetY(${v});\n`;
};
javascriptGenerator.forBlock['scratch_ifonedgebounce'] = function () {
  return 'await window.__scratchBounce();\n';
};
javascriptGenerator.forBlock['scratch_xposition'] = function () {
  return ['window.__scratchPos().x', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_yposition'] = function () {
  return ['window.__scratchPos().y', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_direction'] = function () {
  return ['window.__scratchPos().direction', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_says'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'TEXT', javascriptGenerator.ORDER_NONE);
  return `window.__scratchSay(${v});\n`;
};
javascriptGenerator.forBlock['scratch_sayseconds'] = function (b) {
  const t = javascriptGenerator.valueToCode(b, 'TEXT', javascriptGenerator.ORDER_NONE);
  const s = javascriptGenerator.valueToCode(b, 'SECS', javascriptGenerator.ORDER_NONE) || '2';
  return `await window.__scratchSaySeconds(${t}, ${s});\n`;
};
javascriptGenerator.forBlock['scratch_show'] = function () {
  return 'await window.__scratchShow();\n';
};
javascriptGenerator.forBlock['scratch_hide'] = function () {
  return 'await window.__scratchHide();\n';
};
javascriptGenerator.forBlock['scratch_changesize'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'DELTA', javascriptGenerator.ORDER_NONE) || '0';
  return `await window.__scratchChangeSize(${v});\n`;
};
javascriptGenerator.forBlock['scratch_setsize'] = function (b) {
  const v = javascriptGenerator.valueToCode(b, 'SIZE', javascriptGenerator.ORDER_NONE) || '100';
  return `await window.__scratchSetSize(${v});\n`;
};
javascriptGenerator.forBlock['scratch_size'] = function () {
  return ['window.__scratchPos().size', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_touchingmouse'] = function () {
  return ['window.__scratchTouchingMouse()', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_touchingedge'] = function () {
  return ['window.__scratchTouchingEdge()', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_distancetomouse'] = function () {
  return ['window.__scratchDistToMouse()', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_mousex'] = function () {
  return ['window.__scratchMousePos().x', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_mousey'] = function () {
  return ['window.__scratchMousePos().y', javascriptGenerator.ORDER_MEMBER];
};
javascriptGenerator.forBlock['scratch_keypressed'] = function (b) {
  const key = b.getFieldValue('KEY');
  return [`window.__scratchKeyPressed('${key}')`, javascriptGenerator.ORDER_MEMBER];
};

// ── Toolbox ────────────────────────────────────────────────────────

const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Motion', colour: '#4C97FF',
      contents: [
        { kind: 'block', type: 'scratch_movesteps' },
        { kind: 'block', type: 'scratch_turnright' },
        { kind: 'block', type: 'scratch_turnleft' },
        { kind: 'block', type: 'scratch_goto' },
        { kind: 'block', type: 'scratch_glide' },
        { kind: 'block', type: 'scratch_changex' },
        { kind: 'block', type: 'scratch_setx' },
        { kind: 'block', type: 'scratch_changey' },
        { kind: 'block', type: 'scratch_sety' },
        { kind: 'block', type: 'scratch_ifonedgebounce' },
        { kind: 'block', type: 'scratch_xposition' },
        { kind: 'block', type: 'scratch_yposition' },
        { kind: 'block', type: 'scratch_direction' },
      ],
    },
    {
      kind: 'category', name: 'Looks', colour: '#9966FF',
      contents: [
        { kind: 'block', type: 'scratch_says' },
        { kind: 'block', type: 'scratch_sayseconds' },
        { kind: 'block', type: 'scratch_show' },
        { kind: 'block', type: 'scratch_hide' },
        { kind: 'block', type: 'scratch_changesize' },
        { kind: 'block', type: 'scratch_setsize' },
        { kind: 'block', type: 'scratch_size' },
      ],
    },
    {
      kind: 'category', name: 'Control', colour: '#EC4899',
      contents: [
        { kind: 'block', type: 'scratch_wait' },
        { kind: 'block', type: 'controls_repeat_ext' },
        { kind: 'block', type: 'controls_whileUntil' },
      ],
    },
    {
      kind: 'category', name: 'Sensing', colour: '#4CBFE6',
      contents: [
        { kind: 'block', type: 'scratch_touchingmouse' },
        { kind: 'block', type: 'scratch_touchingedge' },
        { kind: 'block', type: 'scratch_distancetomouse' },
        { kind: 'block', type: 'scratch_mousex' },
        { kind: 'block', type: 'scratch_mousey' },
        { kind: 'block', type: 'scratch_keypressed' },
      ],
    },
    {
      kind: 'category', name: 'Logic', colour: '#F97316',
      contents: [
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_boolean' },
      ],
    },
    {
      kind: 'category', name: 'Text', colour: '#10B981',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_length' },
      ],
    },
    {
      kind: 'category', name: 'Math', colour: '#3B82F6',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'math_random_int' },
      ],
    },
  ],
};

// ── Canvas helpers ─────────────────────────────────────────────────

const SPRITE_SIZE = 28;
const COORD_RANGE = 150;

function scratchToCanvas(sx: number, sy: number): [number, number] {
  return [sx + COORD_RANGE, COORD_RANGE - sy];
}

function canvasToScratch(px: number, py: number): [number, number] {
  return [px - COORD_RANGE, COORD_RANGE - py];
}

function drawSprite(ctx: CanvasRenderingContext2D, s: SpriteState) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Background grid
  ctx.fillStyle = '#E8F5E9';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#C8E6C9';
  ctx.lineWidth = 0.5;
  for (let i = -COORD_RANGE; i <= COORD_RANGE; i += 30) {
    const [px] = scratchToCanvas(i, 0);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  }
  for (let i = -COORD_RANGE; i <= COORD_RANGE; i += 30) {
    const [, py] = scratchToCanvas(0, i);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
  }

  // Axes
  const [cx, cy] = scratchToCanvas(0, 0);
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();

  if (!s.visible) return;

  const [px, py] = scratchToCanvas(s.x, s.y);
  const scale = s.size / 100;
  const size = Math.round(SPRITE_SIZE * scale);

  ctx.save();
  ctx.translate(px, py);

  // Direction indicator
  const rad = s.direction * Math.PI / 180;
  const len = size * 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len * Math.sin(rad), -len * Math.cos(rad));
  ctx.strokeStyle = '#4C97FF';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Cat circle body
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#FFB74D';
  ctx.fill();
  ctx.strokeStyle = '#F57C00';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eyes (look in direction of movement)
  const eyeOff = size * 0.2;
  const eyeR = size * 0.08;
  const lookX = Math.sin(rad) * 2;
  const lookY = -Math.cos(rad) * 2;
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(-eyeOff + lookX, -size * 0.1 + lookY, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(eyeOff + lookX, -size * 0.1 + lookY, eyeR, 0, Math.PI * 2); ctx.fill();

  // Mouth
  ctx.beginPath();
  ctx.arc(0, size * 0.1, size * 0.12, 0, Math.PI);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ears
  ctx.fillStyle = '#FFB74D';
  ctx.beginPath();
  ctx.moveTo(-size * 0.35, -size * 0.3);
  ctx.lineTo(-size * 0.2, -size * 0.55);
  ctx.lineTo(-size * 0.05, -size * 0.3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.35, -size * 0.3);
  ctx.lineTo(size * 0.2, -size * 0.55);
  ctx.lineTo(size * 0.05, -size * 0.3);
  ctx.fill();

  ctx.restore();
}

// ── Blockly block definitions that depend on built-in blocks ───────

Blockly.Blocks['scratch_wait'] = {
  init: function () {
    this.jsonInit({
      message0: 'wait %1 seconds',
      args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
      previousStatement: null, nextStatement: null, colour: 330,
    });
  },
};

javascriptGenerator.forBlock['scratch_wait'] = function (block) {
  const seconds = javascriptGenerator.valueToCode(block, 'SECONDS', javascriptGenerator.ORDER_NONE) || '1';
  return `await window.__scratchWait(${seconds});\n`;
};

// ── Component ──────────────────────────────────────────────────────

export const BlocklyPanel = forwardRef<BlocklyPanelHandle>(function BlocklyPanel(_, ref) {
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [sprite, setSprite] = useState<SpriteState>(defaultSprite);
  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });
  const [keysDown, setKeysDown] = useState<Set<string>>(new Set());

  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const spriteRef = useRef<SpriteState>(defaultSprite());
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef({ x: 0, y: 0 });
  const outputRef = useRef<string[]>([]);
  const blockRefsMap = useRef<Map<string, string>>(new Map());

  const describeBlockTree = useCallback((block: Blockly.Block, indent: number = 0): string => {
    const pad = '  '.repeat(indent);
    let result = pad + '→ ' + block.toString() + '\n';
    for (const input of block.inputList) {
      const target = input.connection?.targetBlock();
      if (target) result += describeBlockTree(target, indent + 1);
    }
    const next = block.nextConnection?.targetBlock();
    if (next) result += describeBlockTree(next, indent);
    return result;
  }, []);

  useImperativeHandle(ref, () => ({
    getContext() {
      const ws = workspace.current;
      if (!ws) return 'Scratch pad: not initialized';
      const s = spriteRef.current;
      const topBlocks = ws.getTopBlocks(true);
      blockRefsMap.current.clear();
      let result = `Sprite: x=${Math.round(s.x)}, y=${Math.round(s.y)}, dir=${Math.round(s.direction)}, size=${s.size}%, visible=${s.visible}\n\nBlocks:\n`;
      topBlocks.forEach((block, i) => {
        const refId = `#ref${i + 1}`;
        blockRefsMap.current.set(block.id, refId);
        result += `${refId}:\n${describeBlockTree(block)}`;
      });
      return result || 'Scratch pad: empty';
    },
    highlightBlock(ref: string) {
      const ws = workspace.current;
      if (!ws) return;
      const blockId = [...blockRefsMap.current.entries()].find(([, v]) => v === ref)?.[0];
      if (!blockId) return;
      const block = ws.getBlockById(blockId);
      if (!block) return;
      ws.getAllBlocks().forEach(b => b.setHighlighted(false));
      block.setHighlighted(true);
      ws.centerOnBlock(blockId);
    },
    suggestCategory(category: string) {
      const ws = workspace.current;
      if (!ws) return;
      const toolbox = ws.getToolbox();
      if (toolbox) toolbox.selectCategoryByName(category);
    },
  }), [describeBlockTree]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawSprite(ctx, spriteRef.current);
  }, []);

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  // Keyboard tracking
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current = new Set(keysRef.current).add(e.key);
      setKeysDown(new Set(keysRef.current));
    };
    const up = (e: KeyboardEvent) => {
      const next = new Set(keysRef.current);
      next.delete(e.key);
      keysRef.current = next;
      setKeysDown(next);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Init Blockly
  useEffect(() => {
    const container = workspaceRef.current;
    if (!container) return;
    workspace.current = Blockly.inject(container, {
      toolbox: TOOLBOX,
      grid: { spacing: 20, length: 3, colour: '#E8DDD0', snap: true },
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.85 },
      trashcan: true,
    });
    return () => { workspace.current?.dispose(); workspace.current = null; };
  }, []);

  // ── Window API for generated code ───────────────────────────────

  const handleStart = useCallback(async () => {
    const ws = workspace.current;
    if (!ws || isRunning) return;

    const abort = new AbortController();
    abortRef.current = abort;
    setIsRunning(true);
    setOutput([]);
    outputRef.current = [];

    const s = spriteRef.current;
    const sig = abort.signal;

    window.__scratchPos = () => s;
    window.__scratchMousePos = () => mouseRef.current;
    window.__scratchKeyPressed = (k: string) => keysRef.current.has(k);

    window.__scratchMove = (steps: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      const rad = s.direction * Math.PI / 180;
      s.x += steps * Math.sin(rad);
      s.y += steps * Math.cos(rad);
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchTurn = (deg: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.direction = ((s.direction + deg) % 360 + 360) % 360;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchGoTo = (x: number, y: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.x = x; s.y = y;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchChangeX = (dx: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.x += dx;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchSetX = (x: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.x = x;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchChangeY = (dy: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.y += dy;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchSetY = (y: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.y = y;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchBounce = () => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      const margin = 25 * (s.size / 100);
      const half = COORD_RANGE - margin;
      if (s.x > half) { s.x = half; s.direction = 180 - s.direction; }
      if (s.x < -half) { s.x = -half; s.direction = 180 - s.direction; }
      if (s.y > half) { s.y = half; s.direction = -s.direction; }
      if (s.y < -half) { s.y = -half; s.direction = -s.direction; }
      s.direction = ((s.direction % 360) + 360) % 360;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchGlide = (secs: number, tx: number, ty: number) =>
      new Promise<void>((resolve, reject) => {
        if (sig.aborted) return reject(Error('STOPPED'));
        const sx = s.x, sy = s.y;
        const start = performance.now();
        function tick(time: number) {
          if (sig.aborted) return reject(Error('STOPPED'));
          const t = Math.min((time - start) / (secs * 1000), 1);
          s.x = sx + (tx - sx) * t;
          s.y = sy + (ty - sy) * t;
          renderCanvas();
          setSprite({ ...s });
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });

    window.__scratchSay = (text: string) => {
      if (sig.aborted) throw Error('STOPPED');
      outputRef.current = [...outputRef.current, String(text)];
      setOutput([...outputRef.current]);
    };

    window.__scratchSaySeconds = (text: string, secs: number) =>
      new Promise<void>((resolve, reject) => {
        if (sig.aborted) return reject(Error('STOPPED'));
        outputRef.current = [...outputRef.current, String(text)];
        setOutput([...outputRef.current]);
        setTimeout(() => {
          if (sig.aborted) return reject(Error('STOPPED'));
          resolve();
        }, secs * 1000);
      });

    window.__scratchShow = () => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.visible = true;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchHide = () => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.visible = false;
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchChangeSize = (delta: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.size = Math.max(5, s.size + delta);
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchSetSize = (size: number) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      s.size = Math.max(5, size);
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchWait = (seconds: number) =>
      new Promise<void>((resolve, reject) => {
        if (sig.aborted) return reject(Error('STOPPED'));
        const timer = setTimeout(resolve, seconds * 1000);
        sig.addEventListener('abort', () => { clearTimeout(timer); reject(Error('STOPPED')); });
      });

    window.__scratchTouchingMouse = () => {
      const m = mouseRef.current;
      const dx = s.x - m.x;
      const dy = s.y - m.y;
      const r = 15 * (s.size / 100);
      return Math.sqrt(dx * dx + dy * dy) < r;
    };

    window.__scratchTouchingEdge = () => {
      const r = 15 * (s.size / 100);
      return s.x + r > COORD_RANGE || s.x - r < -COORD_RANGE ||
             s.y + r > COORD_RANGE || s.y - r < -COORD_RANGE;
    };

    window.__scratchDistToMouse = () => {
      const m = mouseRef.current;
      return Math.sqrt((s.x - m.x) ** 2 + (s.y - m.y) ** 2);
    };

    const code = javascriptGenerator.workspaceToCode(ws);
    if (!code.trim()) { setIsRunning(false); abortRef.current = null; return; }

    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    try {
      const fn = new AsyncFunction(code);
      await fn();
    } catch (e) {
      if ((e as Error)?.message !== 'STOPPED') console.error('Blockly error:', e);
    }

    setIsRunning(false);
    abortRef.current = null;
  }, [isRunning, renderCanvas]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const [sx, sy] = canvasToScratch(px, py);
    mouseRef.current = { x: Math.round(sx), y: Math.round(sy) };
    setMouseCoords({ x: Math.round(sx), y: Math.round(sy) });
  }, []);

  return (
    <div className="scratch-panel-inner">
      <div className="scratch-toolbar">
        <button className="scratch-flag-btn" onClick={handleStart} disabled={isRunning} title="Start">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4v16l14-8z" /></svg>
        </button>
        <button className="scratch-stop-btn" onClick={handleStop} disabled={!isRunning} title="Stop">
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
        </button>
        <span className="scratch-coords">x: {Math.round(sprite.x)} y: {Math.round(sprite.y)} dir: {Math.round(sprite.direction)}</span>
      </div>
      <div className="scratch-body">
        <div ref={workspaceRef} className="blockly-workspace" />
        <div className="scratch-stage-area">
          <div className="scratch-stage-label">Stage</div>
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            className="scratch-canvas"
            onMouseMove={handleCanvasMouseMove}
          />
          <div className="scratch-sprite-info">
            <span>🐱 {sprite.size}%</span>
            <span>mouse: {mouseCoords.x}, {mouseCoords.y}</span>
          </div>
        </div>
      </div>
      <div className="scratch-output">
        {output.map((msg, i) => (
          <div key={i} className="scratch-bubble">{msg}</div>
        ))}
      </div>
    </div>
  );
});
