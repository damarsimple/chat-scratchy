import {
  useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator, Order } from 'blockly/javascript';
import * as ZhHant from 'blockly/msg/zh-hant';
import * as En from 'blockly/msg/en';
import { extractAllBlocks } from './scratchPatterns';
import type { BlockData } from './scratchPatterns';
import { EXAMPLE_CHAINS } from './exampleChains';

// ── Global Window API declarations ─────────────────────────────────

declare global {
  interface Window {
    __scratchAnswer: string;
    __scratchPos: () => SpriteState;
    __scratchMousePos: () => { x: number; y: number };
    __scratchKeyPressed: (key: string) => boolean;
    __scratchMove: (steps: number) => Promise<void>;
    __scratchTurn: (deg: number) => Promise<void>;
    __scratchGoTo: (x: number, y: number) => Promise<void>;
    __scratchChangeX: (dx: number) => Promise<void>;
    __scratchSetX: (x: number) => Promise<void>;
    __scratchChangeY: (dy: number) => Promise<void>;
    __scratchSetY: (y: number) => Promise<void>;
    __scratchBounce: () => Promise<void>;
    __scratchGlide: (secs: number, tx: number, ty: number) => Promise<void>;
    __scratchSay: (text: string) => void;
    __scratchSaySeconds: (text: string, secs: number) => Promise<void>;
    __scratchShow: () => Promise<void>;
    __scratchHide: () => Promise<void>;
    __scratchChangeSize: (delta: number) => Promise<void>;
    __scratchSetSize: (size: number) => Promise<void>;
    __scratchWait: (seconds: number) => Promise<void>;
    __scratchAsk: (question: string) => Promise<void>;
    __scratchPlaySound: (name: string) => void;
    __scratchSwitchCostume: (num: number) => void;
    __scratchNextCostume: () => void;
    __scratchCostumeNumber: () => number;
    __scratchBroadcast: (msg: string) => Promise<void>;
    __scratchCreateClone: () => void;
    __scratchDeleteClone: () => void;
    __scratchTouchingMouse: () => boolean;
    __scratchTouchingEdge: () => boolean;
    __scratchDistToMouse: () => number;
  }
}

// ── Handle interface ────────────────────────────────────────────────

export interface BlocklyPanelHandle {
  // Observation
  getContext(): string;
  getBlockSnapshot(): BlockData[];
  getGeneratedCode(): string;
  getOutputLogs(): string[];
  getWorkspaceState(): object;     // Blockly.serialization.workspaces.save()
  loadWorkspaceState(state: object): void;
  hasBlock(ref: string): boolean;  // true if the ref resolves to a live block

  // Pointing
  highlightBlock(ref: string): void;
  zoomToBlock(ref: string): void;
  zoomToFit(): void;

  // Raw-blockId variants for cross-client control (teacher→student live ops):
  // both panels load the same workspace JSON, so block IDs are identical and
  // don't depend on each side having an up-to-date #refN map.
  getSelectedBlockId(): string | null;
  highlightBlockId(blockId: string | null): void; // null clears all highlights
  showBlockTipById(blockId: string, message: string): void;

  // Annotation
  showBlockTip(blockRef: string, message: string): void;
  clearBlockTips(): void;

  // Building
  suggestCategory(category: string): void;
  highlightToolboxBlock(category: string, blockType: string): void;
  insertBlock(type: string): string;       // returns refId
  deleteBlock(blockRef: string): void;
  setBlockField(blockRef: string, fieldName: string, value: string): void;
  connectBelow(topRef: string, bottomRef: string): void;
  wrapInLoop(blockRef: string, loopType: string): void;

  // Examples & control
  addExampleChain(conceptName: string): void;
  runProgram(): void;
}

// ── Block tip type ──────────────────────────────────────────────────

interface BlockTip {
  blockId: string;
  message: string;
}

// ── Sprite state ────────────────────────────────────────────────────

type RotationStyle = 'all' | 'leftRight' | 'none';

interface SpriteState {
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  costume: number;            // 1-based index into COSTUMES
  rotationStyle: RotationStyle;
}

// The student-editable starting configuration (everything but live position).
interface SpriteConfig {
  costume: number;
  size: number;
  direction: number;
  rotationStyle: RotationStyle;
  visible: boolean;
}
function defaultSpriteConfig(): SpriteConfig {
  return { costume: 1, size: 100, direction: 90, rotationStyle: 'all', visible: true };
}

function defaultSprite(): SpriteState {
  return { x: 0, y: 0, direction: 90, size: 100, visible: true, costume: 1, rotationStyle: 'all' };
}

// ── Helper: resolve refId → blockId ────────────────────────────────

function resolveRef(refId: string, map: Map<string, string>): string | undefined {
  return [...map.entries()].find(([, v]) => v === refId)?.[0];
}

// ── Block locale ─────────────────────────────────────────────────────

// Read at block init() time so serialize→setLang→deserialize refreshes labels.
let _blockLang = 'en';

type BlockMsg = { en: string; zh: string };
type KeyOption = [string, string]; // [displayLabel, value]

function msg(m: BlockMsg): string { return _blockLang === 'zh' ? m.zh : m.en; }
function keyOpts(includeAny = false): KeyOption[] {
  const isZh = _blockLang === 'zh';
  const opts: KeyOption[] = [
    [isZh ? '空白鍵' : 'space', 'space'],
    [isZh ? '上箭頭' : 'up arrow', 'ArrowUp'],
    [isZh ? '下箭頭' : 'down arrow', 'ArrowDown'],
    [isZh ? '左箭頭' : 'left arrow', 'ArrowLeft'],
    [isZh ? '右箭頭' : 'right arrow', 'ArrowRight'],
    ['a', 'a'], ['b', 'b'],
  ];
  if (includeAny) opts.push([isZh ? '任意鍵' : 'any', 'any']);
  return opts;
}

// ── Custom block definitions ────────────────────────────────────────

function defineBlock(type: string, enDef: Record<string, unknown>, zhDef?: Record<string, unknown>) {
  const zh = zhDef ?? enDef;
  Blockly.Blocks[type] = { init() { this.jsonInit(_blockLang === 'zh' ? zh : enDef); } };
}

// Motion
defineBlock('scratch_movesteps',
  { message0: 'move %1 steps',            args0: [{ type: 'input_value', name: 'STEPS',   check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: '移動 %1 步',               args0: [{ type: 'input_value', name: 'STEPS',   check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_turnright',
  { message0: 'turn right %1 degrees',    args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: '右轉 %1 度',               args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_turnleft',
  { message0: 'turn left %1 degrees',     args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: '左轉 %1 度',               args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_goto',
  { message0: 'go to x: %1 y: %2',       args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: '移到 x: %1 y: %2',        args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_glide',
  { message0: 'glide %1 secs to x: %2 y: %3', args0: [{ type: 'input_value', name: 'SECS', check: 'Number' }, { type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: '在 %1 秒內滑行到 x: %2 y: %3', args0: [{ type: 'input_value', name: 'SECS', check: 'Number' }, { type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_changex',
  { message0: 'change x by %1',           args0: [{ type: 'input_value', name: 'DX', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: 'x 改變 %1',               args0: [{ type: 'input_value', name: 'DX', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_setx',
  { message0: 'set x to %1',             args0: [{ type: 'input_value', name: 'X', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: '設定 x 為 %1',            args0: [{ type: 'input_value', name: 'X', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_changey',
  { message0: 'change y by %1',           args0: [{ type: 'input_value', name: 'DY', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: 'y 改變 %1',               args0: [{ type: 'input_value', name: 'DY', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_sety',
  { message0: 'set y to %1',             args0: [{ type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 },
  { message0: '設定 y 為 %1',            args0: [{ type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_ifonedgebounce',
  { message0: 'if on edge, bounce',       previousStatement: null, nextStatement: null, colour: 120 },
  { message0: '碰到邊緣就反彈',           previousStatement: null, nextStatement: null, colour: 120 });
defineBlock('scratch_xposition',  { message0: 'x position', output: 'Number', colour: 120 }, { message0: 'x 座標', output: 'Number', colour: 120 });
defineBlock('scratch_yposition',  { message0: 'y position', output: 'Number', colour: 120 }, { message0: 'y 座標', output: 'Number', colour: 120 });
defineBlock('scratch_direction',  { message0: 'direction',  output: 'Number', colour: 120 }, { message0: '方向',   output: 'Number', colour: 120 });

// Looks
defineBlock('scratch_says',
  { message0: 'say %1',                  args0: [{ type: 'input_value', name: 'TEXT' }], previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '說 %1',                   args0: [{ type: 'input_value', name: 'TEXT' }], previousStatement: null, nextStatement: null, colour: 200 });
defineBlock('scratch_sayseconds',
  { message0: 'say %1 for %2 seconds',   args0: [{ type: 'input_value', name: 'TEXT' }, { type: 'input_value', name: 'SECS', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '說 %1 %2 秒',             args0: [{ type: 'input_value', name: 'TEXT' }, { type: 'input_value', name: 'SECS', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 200 });
defineBlock('scratch_show',
  { message0: 'show',  previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '顯示',  previousStatement: null, nextStatement: null, colour: 200 });
defineBlock('scratch_hide',
  { message0: 'hide',  previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '隱藏',  previousStatement: null, nextStatement: null, colour: 200 });
defineBlock('scratch_changesize',
  { message0: 'change size by %1',       args0: [{ type: 'input_value', name: 'DELTA', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '尺寸改變 %1',             args0: [{ type: 'input_value', name: 'DELTA', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 200 });
defineBlock('scratch_setsize',
  { message0: 'set size to %1 %',        args0: [{ type: 'input_value', name: 'SIZE', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '設定尺寸為 %1 %',         args0: [{ type: 'input_value', name: 'SIZE', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 200 });
defineBlock('scratch_size',         { message0: 'size',     output: 'Number', colour: 200 }, { message0: '尺寸',   output: 'Number', colour: 200 });
defineBlock('scratch_switchcostume',
  { message0: 'switch costume to %1',    args0: [{ type: 'input_value', name: 'COSTUME', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '切換造型到 %1',           args0: [{ type: 'input_value', name: 'COSTUME', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 200 });
defineBlock('scratch_nextcostume',
  { message0: 'next costume',            previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '下一個造型',              previousStatement: null, nextStatement: null, colour: 200 });
defineBlock('scratch_costumenumber', { message0: 'costume #', output: 'Number', colour: 200 }, { message0: '造型編號', output: 'Number', colour: 200 });
defineBlock('scratch_playsound',
  { message0: 'play sound %1',           args0: [{ type: 'input_value', name: 'SOUND', check: 'String' }], previousStatement: null, nextStatement: null, colour: 200 },
  { message0: '播放音效 %1',             args0: [{ type: 'input_value', name: 'SOUND', check: 'String' }], previousStatement: null, nextStatement: null, colour: 200 });

// Events
defineBlock('event_whenflagclicked',
  { message0: 'when flag clicked',        nextStatement: null, colour: 330 },
  { message0: '當綠旗被點擊',             nextStatement: null, colour: 330 });
defineBlock('event_whenthisspriteclicked',
  { message0: 'when this sprite clicked', nextStatement: null, colour: 330 },
  { message0: '當角色被點擊',             nextStatement: null, colour: 330 });
defineBlock('scratch_broadcast',
  { message0: 'broadcast %1',            args0: [{ type: 'input_value', name: 'MESSAGE', check: 'String' }], previousStatement: null, nextStatement: null, colour: 330 },
  { message0: '廣播 %1',                  args0: [{ type: 'input_value', name: 'MESSAGE', check: 'String' }], previousStatement: null, nextStatement: null, colour: 330 });
defineBlock('scratch_whenireceive',
  { message0: 'when I receive %1',       args0: [{ type: 'input_value', name: 'MESSAGE', check: 'String' }], nextStatement: null, colour: 330 },
  { message0: '當收到 %1',               args0: [{ type: 'input_value', name: 'MESSAGE', check: 'String' }], nextStatement: null, colour: 330 });

// Sensing — dropdowns built at init time via keyOpts()
Blockly.Blocks['scratch_keypressed'] = {
  init() {
    this.jsonInit({
      message0: msg({ en: 'key %1 pressed?', zh: '按下 %1 鍵？' }),
      args0: [{ type: 'field_dropdown', name: 'KEY', options: keyOpts() }],
      output: 'Boolean', colour: 60,
    });
  },
};
Blockly.Blocks['event_whenkeypressed'] = {
  init() {
    this.jsonInit({
      message0: msg({ en: 'when %1 key pressed', zh: '當 %1 鍵被按下' }),
      args0: [{ type: 'field_dropdown', name: 'KEY', options: keyOpts(true) }],
      nextStatement: null, colour: 330,
    });
  },
};
defineBlock('scratch_touchingmouse',
  { message0: 'touching mouse-pointer?',    output: 'Boolean', colour: 60 },
  { message0: '碰到滑鼠指標？',              output: 'Boolean', colour: 60 });
defineBlock('scratch_touchingedge',
  { message0: 'touching edge?',             output: 'Boolean', colour: 60 },
  { message0: '碰到邊緣？',                  output: 'Boolean', colour: 60 });
defineBlock('scratch_distancetomouse',
  { message0: 'distance to mouse-pointer',  output: 'Number', colour: 60 },
  { message0: '到滑鼠的距離',               output: 'Number', colour: 60 });
defineBlock('scratch_mousex',    { message0: 'mouse x', output: 'Number', colour: 60 }, { message0: '滑鼠 x', output: 'Number', colour: 60 });
defineBlock('scratch_mousey',    { message0: 'mouse y', output: 'Number', colour: 60 }, { message0: '滑鼠 y', output: 'Number', colour: 60 });
defineBlock('scratch_askandwait',
  { message0: 'ask %1 and wait',            args0: [{ type: 'input_value', name: 'QUESTION', check: 'String' }], previousStatement: null, nextStatement: null, colour: 60 },
  { message0: '詢問 %1 並等待',             args0: [{ type: 'input_value', name: 'QUESTION', check: 'String' }], previousStatement: null, nextStatement: null, colour: 60 });
defineBlock('scratch_answer',    { message0: 'answer', output: 'String', colour: 60 }, { message0: '回答', output: 'String', colour: 60 });

// Clone
defineBlock('scratch_createclone',
  { message0: 'create clone of myself',    previousStatement: null, nextStatement: null, colour: 330 },
  { message0: '建立自己的分身',             previousStatement: null, nextStatement: null, colour: 330 });
defineBlock('scratch_whenclonestart',
  { message0: 'when I start as a clone',   nextStatement: null, colour: 330 },
  { message0: '當分身產生',                 nextStatement: null, colour: 330 });
defineBlock('scratch_deleteclone',
  { message0: 'delete this clone',         previousStatement: null, nextStatement: null, colour: 330 },
  { message0: '刪除此分身',                 previousStatement: null, nextStatement: null, colour: 330 });

// Control
Blockly.Blocks['scratch_wait'] = {
  init() {
    this.jsonInit({
      message0: msg({ en: 'wait %1 seconds', zh: '等待 %1 秒' }),
      args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
      previousStatement: null, nextStatement: null, colour: 330,
    });
  },
};

// ── JS generators ───────────────────────────────────────────────────

javascriptGenerator.forBlock['scratch_movesteps'] = b => `await window.__scratchMove(${javascriptGenerator.valueToCode(b, 'STEPS', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_turnright'] = b => `await window.__scratchTurn(${javascriptGenerator.valueToCode(b, 'DEGREES', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_turnleft'] = b => `await window.__scratchTurn(-${javascriptGenerator.valueToCode(b, 'DEGREES', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_goto'] = b => `await window.__scratchGoTo(${javascriptGenerator.valueToCode(b, 'X', Order.NONE) || '0'}, ${javascriptGenerator.valueToCode(b, 'Y', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_glide'] = b => `await window.__scratchGlide(${javascriptGenerator.valueToCode(b, 'SECS', Order.NONE) || '1'}, ${javascriptGenerator.valueToCode(b, 'X', Order.NONE) || '0'}, ${javascriptGenerator.valueToCode(b, 'Y', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_changex'] = b => `await window.__scratchChangeX(${javascriptGenerator.valueToCode(b, 'DX', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_setx'] = b => `await window.__scratchSetX(${javascriptGenerator.valueToCode(b, 'X', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_changey'] = b => `await window.__scratchChangeY(${javascriptGenerator.valueToCode(b, 'DY', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_sety'] = b => `await window.__scratchSetY(${javascriptGenerator.valueToCode(b, 'Y', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_ifonedgebounce'] = () => 'await window.__scratchBounce();\n';
javascriptGenerator.forBlock['scratch_xposition'] = () => ['window.__scratchPos().x', Order.MEMBER];
javascriptGenerator.forBlock['scratch_yposition'] = () => ['window.__scratchPos().y', Order.MEMBER];
javascriptGenerator.forBlock['scratch_direction'] = () => ['window.__scratchPos().direction', Order.MEMBER];
javascriptGenerator.forBlock['scratch_says'] = b => `window.__scratchSay(${javascriptGenerator.valueToCode(b, 'TEXT', Order.NONE)});\n`;
javascriptGenerator.forBlock['scratch_sayseconds'] = b => `await window.__scratchSaySeconds(${javascriptGenerator.valueToCode(b, 'TEXT', Order.NONE)}, ${javascriptGenerator.valueToCode(b, 'SECS', Order.NONE) || '2'});\n`;
javascriptGenerator.forBlock['scratch_show'] = () => 'await window.__scratchShow();\n';
javascriptGenerator.forBlock['scratch_hide'] = () => 'await window.__scratchHide();\n';
javascriptGenerator.forBlock['scratch_changesize'] = b => `await window.__scratchChangeSize(${javascriptGenerator.valueToCode(b, 'DELTA', Order.NONE) || '0'});\n`;
javascriptGenerator.forBlock['scratch_setsize'] = b => `await window.__scratchSetSize(${javascriptGenerator.valueToCode(b, 'SIZE', Order.NONE) || '100'});\n`;
javascriptGenerator.forBlock['scratch_size'] = () => ['window.__scratchPos().size', Order.MEMBER];
javascriptGenerator.forBlock['scratch_touchingmouse'] = () => ['window.__scratchTouchingMouse()', Order.MEMBER];
javascriptGenerator.forBlock['scratch_touchingedge'] = () => ['window.__scratchTouchingEdge()', Order.MEMBER];
javascriptGenerator.forBlock['scratch_distancetomouse'] = () => ['window.__scratchDistToMouse()', Order.MEMBER];
javascriptGenerator.forBlock['scratch_mousex'] = () => ['window.__scratchMousePos().x', Order.MEMBER];
javascriptGenerator.forBlock['scratch_mousey'] = () => ['window.__scratchMousePos().y', Order.MEMBER];
javascriptGenerator.forBlock['scratch_keypressed'] = b => [`window.__scratchKeyPressed('${b.getFieldValue('KEY')}')`, Order.MEMBER];
javascriptGenerator.forBlock['scratch_wait'] = b => `await window.__scratchWait(${javascriptGenerator.valueToCode(b, 'SECONDS', Order.NONE) || '1'});\n`;
javascriptGenerator.forBlock['scratch_playsound'] = b => `window.__scratchPlaySound(${javascriptGenerator.valueToCode(b, 'SOUND', Order.NONE) || '""'});\n`;
javascriptGenerator.forBlock['scratch_switchcostume'] = b => `window.__scratchSwitchCostume(${javascriptGenerator.valueToCode(b, 'COSTUME', Order.NONE) || '1'});\n`;
javascriptGenerator.forBlock['scratch_nextcostume'] = () => 'window.__scratchNextCostume();\n';
javascriptGenerator.forBlock['scratch_costumenumber'] = () => ['window.__scratchCostumeNumber()', Order.MEMBER];
javascriptGenerator.forBlock['scratch_askandwait'] = b => `await window.__scratchAsk(${javascriptGenerator.valueToCode(b, 'QUESTION', Order.NONE) || '""'});\n`;
javascriptGenerator.forBlock['scratch_answer'] = () => ['window.__scratchAnswer || ""', Order.MEMBER];
javascriptGenerator.forBlock['scratch_createclone'] = () => 'window.__scratchCreateClone();\n';
javascriptGenerator.forBlock['scratch_deleteclone'] = () => 'window.__scratchDeleteClone();\n';
javascriptGenerator.forBlock['scratch_broadcast'] = b => `await window.__scratchBroadcast(${javascriptGenerator.valueToCode(b, 'MESSAGE', Order.NONE) || '""'});\n`;

// Hat blocks (when-flag / when-key / when-clicked / when-receive) contribute no
// code of their own — Blockly's scrub_ appends the chained body when we call
// blockToCode on the hat. (Returning the chain here too would emit it twice.)
function generateChain(_b: Blockly.Block): string {
  return '';
}
javascriptGenerator.forBlock['event_whenflagclicked'] = generateChain;
javascriptGenerator.forBlock['event_whenkeypressed'] = generateChain;
javascriptGenerator.forBlock['event_whenthisspriteclicked'] = generateChain;
javascriptGenerator.forBlock['scratch_whenireceive'] = generateChain;
javascriptGenerator.forBlock['scratch_whenclonestart'] = generateChain;

// ── Toolbox ─────────────────────────────────────────────────────────

const ZH_CATEGORY_NAMES: Record<string, string> = {
  Motion: '動作', Looks: '外觀', Sound: '音效', Events: '事件',
  Control: '控制', Sensing: '偵測', Logic: '邏輯', Text: '文字',
  Math: '數學', Variables: '變數',
};

// Returns the display name for a canonical English category in the current language.
function catName(en: string): string {
  return _blockLang === 'zh' ? (ZH_CATEGORY_NAMES[en] ?? en) : en;
}

function getToolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: [
      { kind: 'category', name: catName('Motion'), colour: '#4C97FF', contents: [
        { kind: 'block', type: 'scratch_movesteps' }, { kind: 'block', type: 'scratch_turnright' }, { kind: 'block', type: 'scratch_turnleft' },
        { kind: 'block', type: 'scratch_goto' }, { kind: 'block', type: 'scratch_glide' }, { kind: 'block', type: 'scratch_changex' },
        { kind: 'block', type: 'scratch_setx' }, { kind: 'block', type: 'scratch_changey' }, { kind: 'block', type: 'scratch_sety' },
        { kind: 'block', type: 'scratch_ifonedgebounce' }, { kind: 'block', type: 'scratch_xposition' }, { kind: 'block', type: 'scratch_yposition' }, { kind: 'block', type: 'scratch_direction' },
      ] },
      { kind: 'category', name: catName('Looks'), colour: '#9966FF', contents: [
        { kind: 'block', type: 'scratch_says' }, { kind: 'block', type: 'scratch_sayseconds' }, { kind: 'block', type: 'scratch_show' }, { kind: 'block', type: 'scratch_hide' },
        { kind: 'block', type: 'scratch_changesize' }, { kind: 'block', type: 'scratch_setsize' }, { kind: 'block', type: 'scratch_size' },
        { kind: 'block', type: 'scratch_switchcostume' }, { kind: 'block', type: 'scratch_nextcostume' }, { kind: 'block', type: 'scratch_costumenumber' },
      ] },
      { kind: 'category', name: catName('Sound'), colour: '#CF63CF', contents: [{ kind: 'block', type: 'scratch_playsound' }] },
      { kind: 'category', name: catName('Events'), colour: '#FFAB00', contents: [
        { kind: 'block', type: 'event_whenflagclicked' }, { kind: 'block', type: 'event_whenkeypressed' }, { kind: 'block', type: 'event_whenthisspriteclicked' },
        { kind: 'block', type: 'scratch_broadcast' }, { kind: 'block', type: 'scratch_whenireceive' },
      ] },
      { kind: 'category', name: catName('Control'), colour: '#EC4899', contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'controls_repeat_ext' }, { kind: 'block', type: 'controls_whileUntil' }, { kind: 'block', type: 'scratch_wait' },
      ] },
      { kind: 'category', name: catName('Sensing'), colour: '#4CBFE6', contents: [
        { kind: 'block', type: 'scratch_touchingmouse' }, { kind: 'block', type: 'scratch_touchingedge' },
        { kind: 'block', type: 'scratch_distancetomouse' }, { kind: 'block', type: 'scratch_mousex' }, { kind: 'block', type: 'scratch_mousey' },
        { kind: 'block', type: 'scratch_keypressed' }, { kind: 'block', type: 'scratch_askandwait' }, { kind: 'block', type: 'scratch_answer' },
      ] },
      { kind: 'category', name: catName('Logic'), colour: '#F97316', contents: [
        { kind: 'block', type: 'logic_compare' }, { kind: 'block', type: 'logic_operation' }, { kind: 'block', type: 'logic_boolean' },
      ] },
      { kind: 'category', name: catName('Text'), colour: '#10B981', contents: [
        { kind: 'block', type: 'text' }, { kind: 'block', type: 'text_join' }, { kind: 'block', type: 'text_length' },
      ] },
      { kind: 'category', name: catName('Math'), colour: '#3B82F6', contents: [
        { kind: 'block', type: 'math_number' }, { kind: 'block', type: 'math_arithmetic' }, { kind: 'block', type: 'math_random_int' },
      ] },
      { kind: 'category', name: catName('Variables'), colour: '#FF8C00', custom: 'VARIABLE' },
    ],
  };
}

// ── Canvas helpers ──────────────────────────────────────────────────

const SPRITE_SIZE = 28;
const COORD_RANGE = 150;

function scratchToCanvas(sx: number, sy: number): [number, number] {
  return [sx + COORD_RANGE, COORD_RANGE - sy];
}
function canvasToScratch(px: number, py: number): [number, number] {
  return [px - COORD_RANGE, COORD_RANGE - py];
}

// ── Costume library ─────────────────────────────────────────────────
// Each costume draws centered at the origin in "up" orientation, sized to the
// `size` diameter. drawSprite handles position/rotation/flip around these.
type Costume = { name: string; emoji: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void };

const COSTUMES: [Costume, ...Costume[]] = [
  {
    name: 'Cat', emoji: '🐱',
    draw(ctx, size) {
      ctx.fillStyle = '#FFB74D';
      // ears
      ctx.beginPath(); ctx.moveTo(-size * 0.35, -size * 0.3); ctx.lineTo(-size * 0.2, -size * 0.6); ctx.lineTo(-size * 0.05, -size * 0.3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(size * 0.35, -size * 0.3); ctx.lineTo(size * 0.2, -size * 0.6); ctx.lineTo(size * 0.05, -size * 0.3); ctx.fill();
      // head
      ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#F57C00'; ctx.lineWidth = 2; ctx.stroke();
      // eyes + smile
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(-size * 0.2, -size * 0.1, size * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(size * 0.2, -size * 0.1, size * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, size * 0.1, size * 0.12, 0, Math.PI); ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.stroke();
    },
  },
  {
    name: 'Dog', emoji: '🐶',
    draw(ctx, size) {
      ctx.fillStyle = '#A1887F';
      // floppy ears
      ctx.beginPath(); ctx.ellipse(-size * 0.45, -size * 0.05, size * 0.16, size * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(size * 0.45, -size * 0.05, size * 0.16, size * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      // head
      ctx.fillStyle = '#C8A27C';
      ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2; ctx.stroke();
      // muzzle, nose, eyes
      ctx.fillStyle = '#5D4037';
      ctx.beginPath(); ctx.arc(0, size * 0.18, size * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(-size * 0.18, -size * 0.1, size * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(size * 0.18, -size * 0.1, size * 0.07, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    name: 'Ball', emoji: '⚽',
    draw(ctx, size) {
      ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#EF5350'; ctx.fill(); ctx.strokeStyle = '#C62828'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size / 2, 0); ctx.lineTo(size / 2, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(-size * 0.18, -size * 0.18, size * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    },
  },
  {
    name: 'Star', emoji: '⭐',
    draw(ctx, size) {
      const R = size * 0.55, r = size * 0.24;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? R : r;
        const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#FFD54F'; ctx.fill(); ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 2; ctx.stroke();
    },
  },
  {
    name: 'Arrow', emoji: '➡️',
    draw(ctx, size) {
      // points "up" (toward the sprite's heading)
      ctx.fillStyle = '#4C97FF';
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.55);
      ctx.lineTo(size * 0.35, 0);
      ctx.lineTo(size * 0.15, 0);
      ctx.lineTo(size * 0.15, size * 0.5);
      ctx.lineTo(-size * 0.15, size * 0.5);
      ctx.lineTo(-size * 0.15, 0);
      ctx.lineTo(-size * 0.35, 0);
      ctx.closePath();
      ctx.fill(); ctx.strokeStyle = '#2962FF'; ctx.lineWidth = 1.5; ctx.stroke();
    },
  },
  {
    name: 'Rocket', emoji: '🚀',
    draw(ctx, size) {
      // body
      ctx.fillStyle = '#ECEFF1';
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.6);
      ctx.quadraticCurveTo(size * 0.3, -size * 0.1, size * 0.22, size * 0.4);
      ctx.lineTo(-size * 0.22, size * 0.4);
      ctx.quadraticCurveTo(-size * 0.3, -size * 0.1, 0, -size * 0.6);
      ctx.fill(); ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 1.5; ctx.stroke();
      // fins
      ctx.fillStyle = '#EF5350';
      ctx.beginPath(); ctx.moveTo(-size * 0.22, size * 0.15); ctx.lineTo(-size * 0.4, size * 0.45); ctx.lineTo(-size * 0.22, size * 0.4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(size * 0.22, size * 0.15); ctx.lineTo(size * 0.4, size * 0.45); ctx.lineTo(size * 0.22, size * 0.4); ctx.fill();
      // window
      ctx.beginPath(); ctx.arc(0, -size * 0.1, size * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#4FC3F7'; ctx.fill(); ctx.strokeStyle = '#0288D1'; ctx.lineWidth = 1.5; ctx.stroke();
    },
  },
];

function costumeAt(index: number): Costume {
  const i = ((Math.round(index) - 1) % COSTUMES.length + COSTUMES.length) % COSTUMES.length;
  return COSTUMES[i] ?? COSTUMES[0];  // tuple guarantees [0] exists
}

function drawSprite(ctx: CanvasRenderingContext2D, s: SpriteState) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.fillStyle = '#E8F5E9'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#C8E6C9'; ctx.lineWidth = 0.5;
  for (let i = -COORD_RANGE; i <= COORD_RANGE; i += 30) {
    const [px] = scratchToCanvas(i, 0); ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  }
  for (let i = -COORD_RANGE; i <= COORD_RANGE; i += 30) {
    const [, py] = scratchToCanvas(0, i); ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
  }
  const [cx, cy] = scratchToCanvas(0, 0);
  ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
  if (!s.visible) return;

  const [px, py] = scratchToCanvas(s.x, s.y);
  const scale = s.size / 100;
  const size = Math.round(SPRITE_SIZE * scale);
  const rad = s.direction * Math.PI / 180;

  ctx.save();
  ctx.translate(px, py);

  // Faint heading indicator so direction is always legible, even when the
  // costume itself isn't rotated (left-right / don't-rotate styles).
  if (s.rotationStyle !== 'all') {
    const len = size * 0.95;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * Math.sin(rad), -len * Math.cos(rad));
    ctx.strokeStyle = 'rgba(76,151,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  }

  ctx.save();
  if (s.rotationStyle === 'all') ctx.rotate(rad);
  else if (s.rotationStyle === 'leftRight' && Math.sin(rad) < 0) ctx.scale(-1, 1);
  costumeAt(s.costume).draw(ctx, size);
  ctx.restore();

  ctx.restore();
}

// ── AsyncFunction constructor ───────────────────────────────────────

type AsyncFunctionConstructor = new (code: string) => () => Promise<void>;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as AsyncFunctionConstructor;

// ── Category name normalizer ────────────────────────────────────────
// LLMs replying in Chinese sometimes output Chinese category names even when
// the system prompt specifies English. Map aliases → canonical English name.
const CATEGORY_ALIASES: Record<string, string> = {
  // Traditional Chinese
  動作: 'Motion', 外觀: 'Looks', 音效: 'Sound', 事件: 'Events',
  控制: 'Control', 偵測: 'Sensing', 邏輯: 'Logic', 文字: 'Text',
  數學: 'Math', 數學運算: 'Math', 變數: 'Variables',
  // Simplified Chinese
  动作: 'Motion', 外观: 'Looks', 声音: 'Sound',
  侦测: 'Sensing', 逻辑: 'Logic', 数学: 'Math', 变量: 'Variables',
};

function normalizeCategory(raw: string): string {
  const trimmed = raw.trim();
  // Exact match (already English)
  if (trimmed) {
    const alias = CATEGORY_ALIASES[trimmed];
    if (alias) return alias;
    // Case-insensitive match for English variants (e.g. 'motion' → 'Motion')
    const lower = trimmed.toLowerCase();
    const mapped: Record<string, string> = {
      motion: 'Motion', looks: 'Looks', sound: 'Sound', events: 'Events',
      control: 'Control', sensing: 'Sensing', logic: 'Logic', text: 'Text',
      math: 'Math', variables: 'Variables',
    };
    if (mapped[lower]) return mapped[lower];
  }
  return trimmed;
}

// ── Component ───────────────────────────────────────────────────────

export const BlocklyPanel = forwardRef<BlocklyPanelHandle, {
  lang?: string;
  objectiveDescription?: string;
  objectives?: { id: string; label: string }[];
  selectedObjective?: number;
  onSelectObjective?: (idx: number) => void;
  onBlockChange?: (blocks: BlockData[]) => void;
  onAskAboutBlock?: (blockRef: string, description: string) => void;
  partnerStatus?: 'idle' | 'analyzing' | 'intervening';
  readOnly?: boolean;
}>(function BlocklyPanel({
  lang,
  objectiveDescription, objectives, selectedObjective, onSelectObjective,
  onBlockChange, onAskAboutBlock, partnerStatus = 'idle', readOnly = false,
}, ref) {
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [sprite, setSprite] = useState<SpriteState>(defaultSprite);
  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });
  // blockRef → BlockTip
  const [blockTips, setBlockTips] = useState<Map<string, BlockTip>>(new Map());
  // Student-editable sprite appearance (costume/size/direction/rotation/visible).
  const [spriteConfig, setSpriteConfig] = useState<SpriteConfig>(defaultSpriteConfig);
  // Speech bubble (say) + on-stage question prompt (ask and wait).
  const [sayText, setSayText] = useState<string | null>(null);
  const [askState, setAskState] = useState<{ question: string } | null>(null);
  const [askInput, setAskInput] = useState('');
  const askResolverRef = useRef<((answer: string) => void) | null>(null);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const spriteRef = useRef<SpriteState>(defaultSprite());
  const spriteConfigRef = useRef<SpriteConfig>(defaultSpriteConfig());
  spriteConfigRef.current = spriteConfig;
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef({ x: 0, y: 0 });
  const outputRef = useRef<string[]>([]);
  const blockRefsMap = useRef<Map<string, string>>(new Map()); // blockId → refId
  const highlightToken = useRef<object | null>(null); // cancels in-flight highlight loops
  const onBlockChangeRef = useRef(onBlockChange);
  onBlockChangeRef.current = onBlockChange;
  const onAskAboutBlockRef = useRef(onAskAboutBlock);
  onAskAboutBlockRef.current = onAskAboutBlock;
  const broadcastHandlers = useRef<Map<string, Array<() => Promise<void>>>>(new Map());
  const spriteClickHandlers = useRef<Array<() => Promise<void>>>([]);
  const triggerRunRef = useRef<() => void>(() => { /* initialized after handleStart */ });

  // ── Tip helpers ─────────────────────────────────────────────────

  const internalShowTip = useCallback((blockId: string, message: string): string => {
    const refId = `#tip${Date.now()}`;
    setBlockTips(prev => new Map(prev).set(refId, { blockId, message }));
    const timer = setTimeout(() => {
      setBlockTips(prev => { const next = new Map(prev); next.delete(refId); return next; });
    }, 12000);
    // Return cleanup so callers can cancel early
    void timer;
    return refId;
  }, []);

  // ── Canvas helpers ───────────────────────────────────────────────

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawSprite(ctx, spriteRef.current);
  }, []);

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  // While idle, reflect the student's sprite customization on the stage live
  // (during a run the program controls the sprite, so leave it alone).
  useEffect(() => {
    if (isRunning) return;
    const s = spriteRef.current;
    s.costume = spriteConfig.costume;
    s.size = spriteConfig.size;
    s.direction = spriteConfig.direction;
    s.rotationStyle = spriteConfig.rotationStyle;
    s.visible = spriteConfig.visible;
    setSprite({ ...s });
    renderCanvas();
  }, [spriteConfig, isRunning, renderCanvas]);

  // ── Block description helper ─────────────────────────────────────

  const describeBlockTree = useCallback((block: Blockly.Block, indent = 0): string => {
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

  const getBlockSnapshot = useCallback((): BlockData[] => {
    const ws = workspace.current;
    if (!ws) return [];
    return extractAllBlocks(ws.getTopBlocks(true));
  }, []);

  // ── Keyboard tracking ────────────────────────────────────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keysRef.current = new Set(keysRef.current).add(e.key); };
    const up = (e: KeyboardEvent) => { const s = new Set(keysRef.current); s.delete(e.key); keysRef.current = s; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── Locale switching ─────────────────────────────────────────────
  // This effect intentionally runs BEFORE the Blockly init effect so that
  // _blockLang is set correctly when the workspace is first created.
  useEffect(() => {
    _blockLang = lang === 'zh' ? 'zh' : 'en';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Blockly.setLocale(lang === 'zh' ? ZhHant as any : En as any);
    const ws = workspace.current;
    if (!ws) return; // First mount: Blockly init hasn't run yet; _blockLang is ready for init()
    // Update category labels in the toolbox panel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ws as any).updateToolbox(getToolbox());
    // Serialize → clear → deserialize forces every block init() to re-run with the new lang
    const state = Blockly.serialization.workspaces.save(ws);
    ws.clear();
    Blockly.serialization.workspaces.load(state, ws);
  }, [lang]);

  // ── Blockly init ─────────────────────────────────────────────────

  useEffect(() => {
    const container = workspaceRef.current;
    if (!container) return;

    const ws = Blockly.inject(container, {
      // Read-only mode (teacher viewer): hide toolbox/trash, disable editing.
      ...(readOnly ? { readOnly: true } : { toolbox: getToolbox(), trashcan: true }),
      grid: { spacing: 20, length: 3, colour: '#E8DDD0', snap: true },
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.85 },
    });
    workspace.current = ws;

    // Dev-only hook: lets screenshot/automation tooling inject a workspace
    // program (Blockly.serialization) into the live editor. Stripped from prod.
    if (import.meta.env.DEV && !readOnly) {
      (window as unknown as Record<string, unknown>).__loadScratchProgram = (json: object) => {
        Blockly.serialization.workspaces.load(json, ws);
      };
    }

    // Context menu: "Ask AI to explain"
    const menuId = 'ai_explain_block';
    if (!Blockly.ContextMenuRegistry.registry.getItem(menuId)) {
      Blockly.ContextMenuRegistry.registry.register({
        id: menuId,
        displayText: () => '🤖 Ask AI to explain',
        preconditionFn: () => 'enabled',
        callback: (scope: Blockly.ContextMenuRegistry.Scope) => {
          const block = scope.block;
          if (!block) return;
          const description = block.toString();
          const refId = blockRefsMap.current.get(block.id) ?? block.id;
          onAskAboutBlockRef.current?.(refId, description);
        },
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        weight: 100,
      });
    }

    const handleChange = () => {
      const blocks = extractAllBlocks(ws.getTopBlocks(true));
      onBlockChangeRef.current?.(blocks);
    };
    ws.addChangeListener(handleChange);
    handleChange();

    // Track the last-clicked block via native DOM events on the block SVG
    // elements. Blockly's internal selection is unreliable for this use case
    // because it fires selected→null immediately after clicking a block.
    const clickTracker = { id: null as string | null };
    const svgRoot = ws.getCanvas() as unknown as SVGElement;
    const onPointerDown = (e: PointerEvent) => {
      // Walk the DOM tree from the event target up to find a Blockly block
      // (elements with a data-id attribute that corresponds to a block).
      let target = e.target as Element | null;
      let blockId: string | null = null;
      while (target && target !== svgRoot) {
        const id = target.getAttribute?.('data-id');
        if (id && ws.getBlockById(id)) { blockId = id; break; }
        target = target.parentElement;
      }
      if (blockId) {
        clickTracker.id = blockId;
        console.log('[BlocklyPanel] DOM block click:', blockId);
      } else {
        clickTracker.id = null;
      }
    };
    svgRoot.addEventListener('pointerdown', onPointerDown);
    // Store the tracker on the workspace so getSelectedBlockId can read it.
    (ws as unknown as { _clickTracker: { id: string | null } })._clickTracker = clickTracker;

    return () => { svgRoot.removeEventListener('pointerdown', onPointerDown); ws.removeChangeListener(handleChange); ws.dispose(); workspace.current = null; };
  // Mount-only: readOnly is fixed per panel instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Imperative handle ────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    // ── Observation ────────────────────────────────────────────────
    getContext() {
      const ws = workspace.current;
      if (!ws) return 'Scratch pad: not initialized';
      const s = spriteRef.current;
      blockRefsMap.current.clear();
      const topBlocks = ws.getTopBlocks(true);
      let refCounter = 0;

      const assignRef = (block: Blockly.Block): string => {
        refCounter++;
        const refId = `#ref${refCounter}`;
        blockRefsMap.current.set(block.id, refId);
        return refId;
      };

      const describeTree = (block: Blockly.Block, indent: number): string => {
        const pad = '  '.repeat(indent);
        const ref = assignRef(block);
        let result = `${pad}${ref} [${block.type}] ${block.toString()}\n`;
        for (const input of block.inputList) {
          const target = input.connection?.targetBlock();
          if (target) result += describeTree(target, indent + 1);
        }
        const next = block.nextConnection?.targetBlock();
        if (next) result += describeTree(next, indent);
        return result;
      };

      let result = `Sprite: x=${Math.round(s.x)}, y=${Math.round(s.y)}, dir=${Math.round(s.direction)}, size=${s.size}%, visible=${s.visible}\n\nBlocks:\n`;
      for (const block of topBlocks) {
        result += describeTree(block, 0);
        result += '\n';
      }
      return result || 'Scratch pad: empty';
    },
    getBlockSnapshot,
    getGeneratedCode() {
      const ws = workspace.current;
      if (!ws) return '';
      return javascriptGenerator.workspaceToCode(ws);
    },
    getOutputLogs() { return [...outputRef.current]; },
    getWorkspaceState() {
      const ws = workspace.current;
      if (!ws) return {};
      return Blockly.serialization.workspaces.save(ws);
    },
    loadWorkspaceState(state: object) {
      const ws = workspace.current;
      if (!ws) return;
      try {
        ws.clear();
        Blockly.serialization.workspaces.load(state ?? {}, ws);
      } catch (e) {
        console.error('[loadWorkspaceState] failed:', e);
      }
    },
    hasBlock(refId: string) {
      const ws = workspace.current;
      if (!ws) return false;
      const blockId = resolveRef(refId, blockRefsMap.current);
      return !!(blockId && ws.getBlockById(blockId));
    },

    // ── Pointing ───────────────────────────────────────────────────
    highlightBlock(refId: string) {
      const ws = workspace.current;
      if (!ws) return;
      const blockId = resolveRef(refId, blockRefsMap.current);
      if (!blockId) return;
      const block = ws.getBlockById(blockId);
      if (!block) return;
      ws.getAllBlocks().forEach(b => b.setHighlighted(false));
      block.setHighlighted(true);
      ws.centerOnBlock(blockId);
    },
    zoomToBlock(refId: string) {
      const ws = workspace.current;
      if (!ws) return;
      const blockId = resolveRef(refId, blockRefsMap.current);
      if (!blockId) return;
      ws.centerOnBlock(blockId);
    },
    zoomToFit() { workspace.current?.zoomToFit(); },

    // ── Raw-blockId control (teacher→student live ops) ─────────────
    getSelectedBlockId() {
      let id: string | null = null;
      const sel = Blockly.getSelected();
      if (sel) id = (sel as { id?: string }).id ?? null;
      // Fallback: use the click tracker when Blockly.getSelected() isn't set.
      if (!id || !workspace.current?.getBlockById(id)) {
        const ws = workspace.current as unknown as { _clickTracker?: { id: string | null } };
        id = ws._clickTracker?.id ?? null;
        if (id && !workspace.current?.getBlockById(id)) id = null;
      }
      console.log('[BlocklyPanel] getSelectedBlockId =>', id);
      return id;
    },
    highlightBlockId(blockId: string | null) {
      const ws = workspace.current;
      if (!ws) return;
      ws.getAllBlocks().forEach((b) => b.setHighlighted(false));
      if (!blockId) return;
      const block = ws.getBlockById(blockId);
      if (!block) return;
      block.setHighlighted(true);
      ws.centerOnBlock(blockId);
    },
    showBlockTipById(blockId: string, message: string) {
      if (workspace.current?.getBlockById(blockId)) internalShowTip(blockId, message);
    },

    // ── Annotation ─────────────────────────────────────────────────
    showBlockTip(refId: string, message: string) {
      const blockId = resolveRef(refId, blockRefsMap.current);
      if (blockId) internalShowTip(blockId, message);
    },
    clearBlockTips() { setBlockTips(new Map()); },

    // ── Building ───────────────────────────────────────────────────
    suggestCategory(category: string) {
      const ws = workspace.current;
      if (!ws) { console.warn('[suggestCategory] no workspace'); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolbox = ws.getToolbox() as any;
      if (!toolbox) { console.warn('[suggestCategory] no toolbox'); return; }
      const items: any[] = toolbox.getToolboxItems?.() ?? [];
      const normalized = normalizeCategory(category);        // always English
      const displayName = catName(normalized);               // English or Chinese per current lang
      const item = items.find((it: any) => it.getName?.() === displayName);
      console.log('[suggestCategory]', category, '→', normalized, '→', displayName, '→ found:', !!item);
      if (item && toolbox.getSelectedItem?.() !== item) toolbox.setSelectedItem(item);
    },
    highlightToolboxBlock(category: string, blockType: string) {
      const ws = workspace.current;
      if (!ws) { console.warn('[highlightToolboxBlock] no workspace'); return; }

      // Cancel any previous in-flight highlight loop
      const token = {};
      highlightToken.current = token;

      const normalizedCategory = normalizeCategory(category);    // always English
      const displayCategory = catName(normalizedCategory);        // English or Chinese per lang
      const openCategory = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolbox = ws.getToolbox() as any;
        if (!toolbox) return;
        const items: any[] = toolbox.getToolboxItems?.() ?? [];
        const item = items.find((it: any) => it.getName?.() === displayCategory);
        if (item && toolbox.getSelectedItem?.() !== item) {
          console.log('[highlightToolboxBlock] opening category', category, '→', normalizedCategory, '→', displayCategory);
          toolbox.setSelectedItem(item);
        }
      };

      openCategory();

      let attempts = 0;
      const tryHighlight = () => {
        if (highlightToken.current !== token) return; // superseded by a newer call
        attempts++;
        const flyout = ws.getFlyout();
        const flyoutWs = flyout?.getWorkspace();
        const blocks = (flyoutWs?.getTopBlocks(false) ?? []) as Blockly.BlockSvg[];
        console.log('[highlightToolboxBlock]', blockType, 'attempt', attempts, '— blocks:', blocks.length);
        if (!flyoutWs || blocks.length === 0) {
          openCategory();
          if (attempts < 12) setTimeout(tryHighlight, 200);
          return;
        }
        blocks.forEach(b => {
          (b.getSvgRoot() as SVGGElement | null)?.classList.remove('blockly-ai-target');
        });
        const targetBlock = blocks.find(b => b.type === blockType);
        console.log('[highlightToolboxBlock] looking for', blockType, '→ found:', !!targetBlock);
        if (!targetBlock) {
          openCategory();
          if (attempts < 12) setTimeout(tryHighlight, 200);
          return;
        }
        const svgRoot = targetBlock.getSvgRoot() as SVGGElement | null;
        if (svgRoot) {
          svgRoot.classList.add('blockly-ai-target');
          setTimeout(() => svgRoot.classList.remove('blockly-ai-target'), 6000);
        }
        internalShowTip(targetBlock.id, msg({ en: '👉 Use this block', zh: '👉 使用這個積木' }));
        console.log('[highlightToolboxBlock] ✅', blockType);
      };
      setTimeout(tryHighlight, 200);
    },
    insertBlock(type: string): string {
      const ws = workspace.current;
      if (!ws) return '';
      try {
        const block = ws.newBlock(type) as Blockly.BlockSvg;
        block.initSvg();
        block.render();
        const metrics = ws.getMetrics();
        const stackCount = blockRefsMap.current.size;
        const x = metrics.viewLeft + metrics.viewWidth * 0.6;
        const y = metrics.viewTop + 40 + stackCount * 80;
        block.moveTo(new Blockly.utils.Coordinate(x, y));
        ws.centerOnBlock(block.id);
        const refId = `#ai${stackCount + 1}`;
        blockRefsMap.current.set(block.id, refId);
        return refId;
      } catch (e) {
        console.error('[insertBlock] failed:', type, e);
        return '';
      }
    },
    deleteBlock(refId: string) {
      const ws = workspace.current;
      if (!ws) return;
      const blockId = resolveRef(refId, blockRefsMap.current);
      if (!blockId) return;
      const block = ws.getBlockById(blockId);
      if (!block) return;
      block.dispose(true);
      blockRefsMap.current.delete(blockId);
    },
    setBlockField(refId: string, fieldName: string, value: string) {
      const ws = workspace.current;
      if (!ws) return;
      const blockId = resolveRef(refId, blockRefsMap.current);
      if (!blockId) return;
      ws.getBlockById(blockId)?.setFieldValue(value, fieldName);
    },
    connectBelow(topRef: string, bottomRef: string) {
      const ws = workspace.current;
      if (!ws) return;
      const topId = resolveRef(topRef, blockRefsMap.current);
      const botId = resolveRef(bottomRef, blockRefsMap.current);
      if (!topId || !botId) return;
      const top = ws.getBlockById(topId) as Blockly.BlockSvg | null;
      const bot = ws.getBlockById(botId) as Blockly.BlockSvg | null;
      if (!top?.nextConnection || !bot?.previousConnection) return;
      top.nextConnection.connect(bot.previousConnection);
    },
    wrapInLoop(refId: string, loopType = 'controls_whileUntil') {
      const ws = workspace.current;
      if (!ws) return;
      const blockId = resolveRef(refId, blockRefsMap.current);
      if (!blockId) return;
      const target = ws.getBlockById(blockId) as Blockly.BlockSvg | null;
      if (!target) return;

      // Find the topmost block in the chain
      let top: Blockly.BlockSvg = target;
      while (top.previousConnection?.targetBlock()) {
        top = top.previousConnection.targetBlock() as Blockly.BlockSvg;
      }

      const pos = top.getRelativeToSurfaceXY();
      const prevConn = top.previousConnection?.targetConnection ?? null;
      if (top.previousConnection?.isConnected()) top.previousConnection.disconnect();

      // Create loop block
      const loop = ws.newBlock(loopType) as Blockly.BlockSvg;
      loop.initSvg();
      loop.render();

      if (loopType === 'controls_whileUntil') {
        const cond = ws.newBlock('logic_boolean') as Blockly.BlockSvg;
        cond.initSvg(); cond.render();
        cond.setFieldValue('TRUE', 'BOOL');
        const boolInput = loop.getInput('BOOL');
        if (boolInput?.connection && cond.outputConnection) {
          boolInput.connection.connect(cond.outputConnection);
        }
        loop.setFieldValue('WHILE', 'MODE');
      } else if (loopType === 'controls_repeat_ext') {
        const num = ws.newBlock('math_number') as Blockly.BlockSvg;
        num.initSvg(); num.render();
        num.setFieldValue('10', 'NUM');
        const timesInput = loop.getInput('TIMES');
        if (timesInput?.connection && num.outputConnection) {
          timesInput.connection.connect(num.outputConnection);
        }
      }

      loop.moveTo(pos);

      const doInput = loop.getInput('DO');
      if (doInput?.connection && top.previousConnection) {
        doInput.connection.connect(top.previousConnection);
      }
      if (prevConn && loop.previousConnection) {
        prevConn.connect(loop.previousConnection);
      }

      const newRefId = `#ai${blockRefsMap.current.size + 1}`;
      blockRefsMap.current.set(loop.id, newRefId);
      ws.render();
      ws.centerOnBlock(loop.id);
      internalShowTip(loop.id, '🔁 Loop added — drag your blocks inside');
    },

    // ── Examples ───────────────────────────────────────────────────
    addExampleChain(conceptName: string) {
      const ws = workspace.current;
      if (!ws) return;
      const xmlString = EXAMPLE_CHAINS[conceptName];
      if (!xmlString) { console.warn('[addExampleChain] unknown concept:', conceptName); return; }
      try {
        const beforeIds = new Set(ws.getAllBlocks().map(b => b.id));
        const xml = Blockly.utils.xml.textToDom(xmlString);
        Blockly.Xml.domToWorkspace(xml, ws);
        const newBlocks = ws.getAllBlocks().filter(b => !beforeIds.has(b.id));
        if (newBlocks.length === 0) return;
        const first = newBlocks[0] as Blockly.BlockSvg;
        ws.centerOnBlock(first.id);
        const refId = `#ex${blockRefsMap.current.size + 1}`;
        blockRefsMap.current.set(first.id, refId);
        // Small delay lets Blockly finish rendering before we compute position
        setTimeout(() => { internalShowTip(first.id, `💡 AI Example: ${conceptName}`); }, 120);
      } catch (e) {
        console.error('[addExampleChain] failed:', conceptName, e);
      }
    },
    runProgram() { triggerRunRef.current(); },
  }), [getBlockSnapshot, internalShowTip]);

  // ── Main run loop ────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    console.log('[BlocklyPanel] handleStart called, isRunning:', isRunning);
    const ws = workspace.current;
    if (!ws || isRunning) {
      console.log('[BlocklyPanel] handleStart bail: workspace=', !!ws, 'isRunning=', isRunning);
      return;
    }

    const topBlocks = ws.getTopBlocks(true);
    if (topBlocks.length === 0) {
      console.log('[BlocklyPanel] no top blocks — nothing to run');
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;
    setIsRunning(true);
    setOutput([]);
    outputRef.current = [];
    setSayText(null);
    setAskState(null);
    askResolverRef.current = null;
    // Start from the student's configured appearance (position centered).
    const cfg = spriteConfigRef.current;
    const startSprite: SpriteState = {
      x: 0, y: 0, direction: cfg.direction, size: cfg.size,
      visible: cfg.visible, costume: cfg.costume, rotationStyle: cfg.rotationStyle,
    };
    spriteRef.current = startSprite;
    renderCanvas();
    setSprite({ ...startSprite });

    const s = spriteRef.current;
    const sig = abort.signal;
    window.__scratchAnswer = '';
    broadcastHandlers.current = new Map();
    spriteClickHandlers.current = [];

    window.__scratchPos = () => s;
    window.__scratchMousePos = () => mouseRef.current;
    window.__scratchKeyPressed = (k: string) => keysRef.current.has(k);

    const mkMovePromise = (fn: () => void) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(Error('STOPPED'));
      fn();
      renderCanvas();
      setSprite({ ...s });
      requestAnimationFrame(() => { if (sig.aborted) return reject(Error('STOPPED')); resolve(); });
    });

    window.__scratchMove = (steps) => mkMovePromise(() => {
      const rad = s.direction * Math.PI / 180;
      s.x += steps * Math.sin(rad); s.y += steps * Math.cos(rad);
    });
    window.__scratchTurn = (deg) => mkMovePromise(() => { s.direction = ((s.direction + deg) % 360 + 360) % 360; });
    window.__scratchGoTo = (x, y) => mkMovePromise(() => { s.x = x; s.y = y; });
    window.__scratchChangeX = (dx) => mkMovePromise(() => { s.x += dx; });
    window.__scratchSetX = (x) => mkMovePromise(() => { s.x = x; });
    window.__scratchChangeY = (dy) => mkMovePromise(() => { s.y += dy; });
    window.__scratchSetY = (y) => mkMovePromise(() => { s.y = y; });
    window.__scratchShow = () => mkMovePromise(() => { s.visible = true; });
    window.__scratchHide = () => mkMovePromise(() => { s.visible = false; });
    window.__scratchChangeSize = (d) => mkMovePromise(() => { s.size = Math.max(5, s.size + d); });
    window.__scratchSetSize = (sz) => mkMovePromise(() => { s.size = Math.max(5, sz); });

    window.__scratchBounce = () => mkMovePromise(() => {
      const margin = 25 * (s.size / 100), half = COORD_RANGE - margin;
      if (s.x > half) { s.x = half; s.direction = 180 - s.direction; }
      if (s.x < -half) { s.x = -half; s.direction = 180 - s.direction; }
      if (s.y > half) { s.y = half; s.direction = -s.direction; }
      if (s.y < -half) { s.y = -half; s.direction = -s.direction; }
      s.direction = ((s.direction % 360) + 360) % 360;
    });

    window.__scratchGlide = (secs, tx, ty) =>
      new Promise<void>((resolve, reject) => {
        if (sig.aborted) return reject(Error('STOPPED'));
        const sx = s.x, sy = s.y, start = performance.now();
        function tick(t: number) {
          if (sig.aborted) return reject(Error('STOPPED'));
          const p = Math.min((t - start) / (secs * 1000), 1);
          s.x = sx + (tx - sx) * p; s.y = sy + (ty - sy) * p;
          renderCanvas(); setSprite({ ...s });
          if (p < 1) requestAnimationFrame(tick); else resolve();
        }
        requestAnimationFrame(tick);
      });

    window.__scratchSay = (text) => {
      if (sig.aborted) throw Error('STOPPED');
      // Empty say() clears the bubble, matching Scratch.
      setSayText(text === '' || text == null ? null : String(text));
    };
    window.__scratchSaySeconds = (text, secs) =>
      new Promise<void>((resolve, reject) => {
        if (sig.aborted) return reject(Error('STOPPED'));
        setSayText(String(text));
        setTimeout(() => {
          if (sig.aborted) return reject(Error('STOPPED'));
          setSayText(null); resolve();
        }, secs * 1000);
      });
    window.__scratchWait = (seconds) =>
      new Promise<void>((resolve, reject) => {
        if (sig.aborted) return reject(Error('STOPPED'));
        const t = setTimeout(resolve, seconds * 1000);
        sig.addEventListener('abort', () => { clearTimeout(t); reject(Error('STOPPED')); });
      });
    // Ask and wait: show an on-stage input and pause until the student answers.
    window.__scratchAsk = (q) =>
      new Promise<void>((resolve, reject) => {
        if (sig.aborted) return reject(Error('STOPPED'));
        setAskState({ question: String(q ?? '') });
        setAskInput('');
        askResolverRef.current = (answer: string) => {
          window.__scratchAnswer = answer;
          askResolverRef.current = null;
          setAskState(null);
          resolve();
        };
        sig.addEventListener('abort', () => {
          if (askResolverRef.current) { askResolverRef.current = null; setAskState(null); reject(Error('STOPPED')); }
        });
      });
    window.__scratchPlaySound = (name) => {
      outputRef.current = [...outputRef.current, `🔊 ${name}`]; setOutput([...outputRef.current]);
    };
    window.__scratchSwitchCostume = (num) => { s.costume = Math.max(1, Math.round(num)); renderCanvas(); setSprite({ ...s }); };
    window.__scratchNextCostume = () => { s.costume = s.costume + 1; renderCanvas(); setSprite({ ...s }); };
    window.__scratchCostumeNumber = () => ((s.costume - 1) % COSTUMES.length + COSTUMES.length) % COSTUMES.length + 1;

    window.__scratchBroadcast = async (msg) => {
      const handlers = broadcastHandlers.current.get(msg) ?? [];
      await Promise.all(handlers.map(h => h().catch(err => { if ((err as Error)?.message !== 'STOPPED') console.error('Broadcast error:', err); })));
    };
    window.__scratchCreateClone = () => { /* stub */ };
    window.__scratchDeleteClone = () => { s.visible = false; renderCanvas(); setSprite({ ...s }); };
    window.__scratchTouchingMouse = () => {
      const m = mouseRef.current, dx = s.x - m.x, dy = s.y - m.y, r = 15 * (s.size / 100);
      return Math.sqrt(dx * dx + dy * dy) < r;
    };
    window.__scratchTouchingEdge = () => {
      const r = 15 * (s.size / 100);
      return s.x + r > COORD_RANGE || s.x - r < -COORD_RANGE || s.y + r > COORD_RANGE || s.y - r < -COORD_RANGE;
    };
    window.__scratchDistToMouse = () => {
      const m = mouseRef.current;
      return Math.sqrt((s.x - m.x) ** 2 + (s.y - m.y) ** 2);
    };

    // Blockly v12 requires init() before any blockToCode() call
    javascriptGenerator.init(ws);

    console.log('[BlocklyPanel] topBlocks count:', topBlocks.length, 'types:', topBlocks.map(b => b.type));
    const flagScripts: Array<() => Promise<void>> = [];
    const keyScripts = new Map<string, Array<() => Promise<void>>>();
    const anyKeyScripts: Array<() => Promise<void>> = [];

    for (const block of topBlocks) {
      const codeResult = javascriptGenerator.blockToCode(block);
      const bodyCode = typeof codeResult === 'string' ? codeResult : (codeResult[0] ?? '');
      if (!bodyCode.trim()) {
        console.log('[BlocklyPanel] block', block.type, 'produced empty code');
        continue;
      }
      const runner = new AsyncFunction(bodyCode);
      switch (block.type) {
        case 'event_whenflagclicked': flagScripts.push(runner); break;
        case 'event_whenkeypressed': {
          const key = block.getFieldValue('KEY') as string;
          if (key === 'any') anyKeyScripts.push(runner);
          else keyScripts.set(key, [...(keyScripts.get(key) ?? []), runner]);
          break;
        }
        case 'event_whenthisspriteclicked': spriteClickHandlers.current.push(runner); break;
        case 'scratch_whenireceive': {
          const msgBlock = block.getInputTargetBlock('MESSAGE');
          const msg = (msgBlock?.getFieldValue('TEXT') as string | null) ?? '';
          if (msg) broadcastHandlers.current.set(msg, [...(broadcastHandlers.current.get(msg) ?? []), runner]);
          break;
        }
        default: break;
      }
    }

    console.log('[BlocklyPanel] flagScripts:', flagScripts.length, 'keyScripts:', keyScripts.size, 'spriteClick:', spriteClickHandlers.current.length, 'broadcasts:', broadcastHandlers.current.size);

    const keysCurrentlyDown = new Set<string>();
    const handleKeyEdgeDown = (e: KeyboardEvent) => {
      if (sig.aborted || keysCurrentlyDown.has(e.key)) return;
      keysCurrentlyDown.add(e.key);
      const handlers = [...(keyScripts.get(e.key) ?? []), ...anyKeyScripts];
      for (const h of handlers) void h().catch(err => { if ((err as Error)?.message !== 'STOPPED') console.error('Key handler error:', err); });
    };
    const handleKeyEdgeUp = (e: KeyboardEvent) => { keysCurrentlyDown.delete(e.key); };

    const hasEventHandlers = keyScripts.size > 0 || anyKeyScripts.length > 0 || spriteClickHandlers.current.length > 0 || broadcastHandlers.current.size > 0;
    window.addEventListener('keydown', handleKeyEdgeDown);
    window.addEventListener('keyup', handleKeyEdgeUp);
    const keepAlive = hasEventHandlers
      ? new Promise<void>(resolve => { sig.addEventListener('abort', () => resolve()); })
      : Promise.resolve();
    const handleErr = (err: unknown) => { if ((err as Error)?.message !== 'STOPPED') console.error('Blockly error:', err); };

    try {
      await Promise.all([keepAlive, ...flagScripts.map(fn => fn().catch(handleErr))]);
    } finally {
      console.log('[BlocklyPanel] handleStart finally: setting isRunning=false');
      window.removeEventListener('keydown', handleKeyEdgeDown);
      window.removeEventListener('keyup', handleKeyEdgeUp);
      spriteClickHandlers.current = [];
      broadcastHandlers.current = new Map();
      // A say bubble persists after the program finishes naturally (Scratch-like);
      // it's only torn down on Stop (see handleStop) or by the next run/say.
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [isRunning, renderCanvas]);

  // Keep triggerRunRef current
  useEffect(() => { triggerRunRef.current = () => { void handleStart(); }; }, [handleStart]);

  const handleStop = useCallback(() => {
    console.log('[BlocklyPanel] handleStop called, abortRef:', !!abortRef.current);
    abortRef.current?.abort();
    console.log('[BlocklyPanel] handleStop: aborted, isRunning should become false in finally');
    // Clear the speech bubble on Stop (the ask prompt is cleared by its own
    // abort listener which also rejects the pending promise).
    setSayText(null);
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const [sx, sy] = canvasToScratch(e.clientX - rect.left, e.clientY - rect.top);
    mouseRef.current = { x: Math.round(sx), y: Math.round(sy) };
    setMouseCoords({ x: Math.round(sx), y: Math.round(sy) });
  }, []);

  const handleCanvasClick = useCallback(() => {
    if (!isRunning) return;
    for (const h of spriteClickHandlers.current) {
      void h().catch(err => { if ((err as Error)?.message !== 'STOPPED') console.error('Click handler error:', err); });
    }
  }, [isRunning]);

  // ── Tip overlay positioning ──────────────────────────────────────

  function computeTipStyle(tip: BlockTip): React.CSSProperties {
    const ws = workspace.current;
    if (!ws) return { display: 'none' };
    let block = ws.getBlockById(tip.blockId) as Blockly.BlockSvg | null;
    if (!block) {
      const flyout = ws.getFlyout();
      if (flyout) {
        const flyoutWs = flyout.getWorkspace();
        if (flyoutWs) block = flyoutWs.getBlockById(tip.blockId) as Blockly.BlockSvg | null;
      }
    }
    if (!block) return { display: 'none' };
    const svgEl = block.getSvgRoot();
    if (!svgEl) return { display: 'none' };
    const blockRect = svgEl.getBoundingClientRect();
    // Portal renders at document.body — position: fixed is always viewport-relative here,
    // no ancestor transform or overflow can interfere.
    return {
      position: 'fixed',
      left: blockRect.left + blockRect.width / 2,
      top: Math.max(4, blockRect.top - 52),
      transform: 'translateX(-50%)',
      zIndex: 9999,
    };
  }

  // ── Render ───────────────────────────────────────────────────────

  const partnerLabel = partnerStatus === 'analyzing' ? '🔍 Checking…' : partnerStatus === 'intervening' ? '💡 Helping!' : '🤖 AI';

  return (
    <div className="scratch-panel-inner">
      {!readOnly && <div className="scratch-toolbar">
        <button className="scratch-flag-btn" onClick={() => { void handleStart(); }} disabled={isRunning} title="Start">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4v16l14-8z" /></svg>
        </button>
        <button className="scratch-stop-btn" onClick={handleStop} disabled={!isRunning} title="Stop">
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
        </button>
        {objectives && objectives.length > 0 && (
          <span className="scratch-objectives">
            {objectives.map((obj, i) => (
              <button key={obj.id} className={`scratch-objective-btn ${selectedObjective === i ? 'active' : ''}`} onClick={() => onSelectObjective?.(i)}>
                {obj.label}
              </button>
            ))}
          </span>
        )}
        <span className="scratch-coords">x: {Math.round(sprite.x)} y: {Math.round(sprite.y)} dir: {Math.round(sprite.direction)}</span>
        <span className={`ai-partner-badge ai-partner-badge--${partnerStatus}`}>{partnerLabel}</span>
      </div>}

      {objectiveDescription && !readOnly && <div className="scratch-objective-desc">{objectiveDescription}</div>}

      <div className="scratch-body">
        {/* Blockly workspace */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div ref={workspaceRef} className="blockly-workspace" />
        </div>
        {/* Tip bubbles — rendered at document.body via portal so no ancestor
            overflow or Blockly SVG transform can clip or offset them. */}
        {createPortal(
          <>
            {Array.from(blockTips.entries()).map(([refId, tip]) => {
              const style = computeTipStyle(tip);
              if (style.display === 'none') return null;
              return (
                <div key={refId} className="block-tip-bubble" style={style}>
                  <div className="block-tip-text">{tip.message}</div>
                  <button className="block-tip-close" onClick={() => setBlockTips(prev => { const m = new Map(prev); m.delete(refId); return m; })}>×</button>
                  <div className="block-tip-arrow" />
                </div>
              );
            })}
          </>,
          document.body
        )}

        {!readOnly && <div className="scratch-stage-area">
          <div className="scratch-stage-label">
            <span>Stage</span>
            <span className="scratch-stage-mouse">x: {mouseCoords.x} y: {mouseCoords.y}</span>
          </div>

          <div className="scratch-stage-wrap">
            <canvas ref={canvasRef} width={300} height={300} className="scratch-canvas" onMouseMove={handleCanvasMouseMove} onClick={handleCanvasClick} />
            {/* Speech bubble (say / ask question), anchored to the sprite */}
            {sprite.visible && (askState?.question ?? sayText) && (
              <div
                className="scratch-say-bubble"
                style={{
                  left: `${((sprite.x + COORD_RANGE) / (COORD_RANGE * 2)) * 100}%`,
                  top: `${((COORD_RANGE - sprite.y) / (COORD_RANGE * 2)) * 100}%`,
                }}
              >
                {askState?.question ?? sayText}
              </div>
            )}
            {/* On-stage input for "ask and wait" */}
            {askState && (
              <form
                className="scratch-ask-bar"
                onSubmit={(e) => { e.preventDefault(); askResolverRef.current?.(askInput); }}
              >
                <input
                  className="scratch-ask-input"
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  placeholder="Type your answer…"
                  autoFocus
                />
                <button type="submit" className="scratch-ask-submit" title="Submit">✓</button>
              </form>
            )}
          </div>

          {/* Scratch-style sprite pane */}
          <div className="scratch-sprite-pane">
            <div className="ssp-top">
              <div className="ssp-thumb" title={costumeAt(sprite.costume).name}>{costumeAt(sprite.costume).emoji}</div>
              <div className="ssp-fields">
                <div className="ssp-field"><label>Sprite</label><span className="ssp-name">Sprite1</span></div>
                <div className="ssp-field"><label>x</label><span className="ssp-val">{Math.round(sprite.x)}</span></div>
                <div className="ssp-field"><label>y</label><span className="ssp-val">{Math.round(sprite.y)}</span></div>
              </div>
            </div>

            <div className="ssp-controls">
              <div className="ssp-field">
                <label>Show</label>
                <div className="ssp-show">
                  <button className={spriteConfig.visible ? 'active' : ''} title="Show"
                    onClick={() => setSpriteConfig({ ...spriteConfig, visible: true })}>👁</button>
                  <button className={!spriteConfig.visible ? 'active' : ''} title="Hide"
                    onClick={() => setSpriteConfig({ ...spriteConfig, visible: false })}>🚫</button>
                </div>
              </div>
              <div className="ssp-field">
                <label>Size</label>
                <input type="number" min={5} max={300} value={spriteConfig.size}
                  onChange={(e) => setSpriteConfig({ ...spriteConfig, size: Math.max(5, Math.min(300, Number(e.target.value) || 0)) })} />
              </div>
              <div className="ssp-field">
                <label>Direction</label>
                <div className="ssp-dir">
                  <svg viewBox="-12 -12 24 24" className="ssp-dial" width="26" height="26">
                    <circle cx="0" cy="0" r="11" />
                    <line x1="0" y1="0"
                      x2={(Math.sin(spriteConfig.direction * Math.PI / 180) * 9).toFixed(2)}
                      y2={(-Math.cos(spriteConfig.direction * Math.PI / 180) * 9).toFixed(2)} />
                  </svg>
                  <input type="number" value={spriteConfig.direction}
                    onChange={(e) => setSpriteConfig({ ...spriteConfig, direction: ((Number(e.target.value) || 0) % 360 + 360) % 360 })} />
                </div>
              </div>
            </div>

            <div className="ssp-rotrow">
              <label>Rotation</label>
              {([['all', '↻'], ['leftRight', '↔'], ['none', '•']] as [RotationStyle, string][]).map(([val, icon]) => (
                <button key={val} className={`ssp-rot ${spriteConfig.rotationStyle === val ? 'active' : ''}`}
                  onClick={() => setSpriteConfig({ ...spriteConfig, rotationStyle: val })} title={val}>{icon}</button>
              ))}
            </div>

            {/* Costume strip (mini costume tab) */}
            <div className="ssp-costumes">
              {COSTUMES.map((c, i) => (
                <button key={c.name}
                  className={`ssp-costume ${spriteConfig.costume === i + 1 ? 'active' : ''}`}
                  onClick={() => setSpriteConfig({ ...spriteConfig, costume: i + 1 })} title={c.name}>
                  <span className="ssp-costume-emoji">{c.emoji}</span>
                  <span className="ssp-costume-name">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>}
      </div>

      {!readOnly && <div className="scratch-output">
        {output.map((msg, i) => <div key={i} className="scratch-bubble">{msg}</div>)}
      </div>}
    </div>
  );
});
