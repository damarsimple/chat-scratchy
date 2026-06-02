import React, { useEffect, useRef } from 'react';
import type { BlockData } from './scratchPatterns';
import { analyzeBlockDiff } from './useBlockDiff';
import { runPatternMatcher } from './scratchPatterns';
import type { ActivityState } from './useActivityTracker';

export interface ProactiveAgentCallbacks {
  tracker: {
    state: { current: ActivityState };
    getStuckSeconds: () => number | null;
    getEditVelocityDropped: () => boolean;
  };
  interventionTracker: {
    recordIntervention: (decision: { patternId?: string | null; message?: string }, blockSnapshotAtTime: BlockData[]) => void;
    resolveWithBlockChange: (newSnapshot: BlockData[]) => void;
    expirePending: () => void;
    getRecentInterventions: (windowMs?: number) => { id: number; at: number; patternId: string | null; outcome: string | null }[];
    getEffectivenessRate: () => number | null;
  };
  onIntervene: (decision: {
    action: string;
    reason: string;
    message: string;
    patternId: string | null;
    suggestBreak: boolean;
    toolCalls: unknown[];
  }) => void;
  blocklyRef: React.RefObject<{ getContext(): string } | null>;
  llmBusyRef: React.RefObject<boolean>;
}

const INTERVAL_MS = 30_000;
const COOLDOWN_MS = 180_000;
const MAX_BACKOFF = 5;

const getWatchdogSystemPrompt = (lang: string) => `
You are a background monitor for a Scratch tutoring app for students.
You receive a JSON snapshot of the student's current state.
Decide whether to intervene RIGHT NOW.

Respond ONLY in JSON. No extra text. No markdown fences.

## Block Context
The snapshot includes a "blockContext" field containing all blocks currently in the workspace.
Each top-level block chain is labeled with a ref like #ref1, #ref2, etc.
Example:
  #ref1:
  → when flag clicked
  → move 10 steps
  #ref2:
  → when space key pressed
  → say Hello!

Use these exact refs (e.g. "#ref1") when making tool calls. Do NOT invent refs.
If blockContext is "No blocks", the workspace is empty — do not use block-targeting tools.

## Intervention Rules
Intervene when:
- stuckSeconds > 60 AND confidenceSignal is "confused"
- stuckSeconds > 90 AND blockDiff is "no_change" or "reverted"
- stuckSeconds > 180 (regardless of other signals)
- stuckSeconds > 300 → suggest a break
- matchedPatterns has items → gentle debug nudge using the pattern hint
- consecutiveShortMessages >= 3 (student is giving up)
- editVelocityDropped is true (was working fast, suddenly stopped)

Skip when:
- stuckSeconds < 15 (probably thinking)
- confidenceSignal is "good" and stuckSeconds < 120
- blockDiff is "progressing"
- you already gave a hint on the same patternId recently (check recentInterventions)

## Message Guidelines
Your message must be:
- In ${lang === 'en' ? 'English' : '繁體中文'}, concise, and specific to the student's current struggle
- Warm and encouraging, never condescending
- Maximum 2 sentences
- A question or gentle nudge, not the answer

## Tool Calls (optional — only use when it would genuinely help)

Workspace tools (require valid refs from blockContext — skip if blockContext is "No blocks"):
- {"name": "highlight_block", "arguments": {"blockRef": "#ref1"}} → Highlight a block in the workspace
- {"name": "show_block_tip", "arguments": {"blockRef": "#ref1", "message": "tip text"}} → Show a tip on a block
- {"name": "zoom_to_block", "arguments": {"blockRef": "#ref1"}} → Center view on a block

Toolbox tools (do NOT need refs — use freely even when workspace is empty):
- {"name": "suggest_category", "arguments": {"category": "Motion"}} → Open a toolbox category
- {"name": "highlight_toolbox_block", "arguments": {"category": "Motion", "blockType": "scratch_movesteps"}} → Open a category AND highlight the exact block the student should drag in next

For highlight_toolbox_block, blockType must be one of:
Motion: scratch_movesteps, scratch_turnright, scratch_turnleft, scratch_goto, scratch_glide, scratch_changex, scratch_setx, scratch_changey, scratch_sety, scratch_ifonedgebounce
Looks: scratch_says, scratch_sayseconds, scratch_show, scratch_hide, scratch_changesize, scratch_setsize, scratch_switchcostume, scratch_nextcostume
Sound: scratch_playsound
Events: event_whenflagclicked, event_whenkeypressed, event_whenthisspriteclicked, scratch_broadcast
Control: controls_if, controls_repeat_ext, controls_whileUntil, scratch_wait
Sensing: scratch_touchingmouse, scratch_touchingedge, scratch_keypressed, scratch_askandwait

Prefer highlight_toolbox_block over suggest_category alone when you know which specific block the student needs.
Omit toolCalls or use an empty array if not needed.

## Response Format
{
  "action": "skip" | "intervene",
  "reason": "brief internal note",
  "message": "message to student in ${lang === 'en' ? 'English' : '繁體中文'}",
  "patternId": "matched pattern id or null",
  "suggestBreak": true | false,
  "toolCalls": [{"name": "tool_name", "arguments": {}}]
}
`;

async function callWatchdogAgent(
  context: unknown,
  endpoint: string,
  apiKey: string,
  model: string,
  lang: string,
): Promise<{
  action: string;
  reason: string;
  message: string;
  patternId: string | null;
  suggestBreak: boolean;
  toolCalls: unknown[];
} | null> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: getWatchdogSystemPrompt(lang) },
          { role: 'user', content: JSON.stringify(context) },
        ],
        stream: false,
        // Reasoning models spend max_tokens on reasoning_content before the JSON
        // decision; too low a cap starves the output and the watchdog silently
        // no-ops (parse fails → null). The backend can handle large budgets.
        max_tokens: 50000,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content;
    if (!text) return null;
    // Strip markdown code fences that some LLMs wrap around JSON
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function useProactiveAgent(
  callbacks: ProactiveAgentCallbacks,
  deps: {
    chatHistory: { role: string; content: string | null }[];
    currentBlocks: BlockData[];
    endpoint: string;
    apiKey: string;
    model: string;
    lang: string;
  },
) {
  const lastInterveneAt = useRef<number | null>(null);
  const failCount = useRef(0);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  // Provide a no-op initial value so the ref is never undefined
  const runWatchdog = useRef<() => Promise<void>>(() => Promise.resolve());

  runWatchdog.current = async () => {
    if (document.visibilityState === 'hidden') { console.log('[watchdog] hidden, skip'); return; }
    if (cbRef.current.llmBusyRef.current) { console.log('[watchdog] LLM busy, skip'); return; }
    // Reset backoff when tab becomes visible
    if (failCount.current > 0) {
      console.log('[watchdog] tab visible, resetting backoff from', failCount.current);
      failCount.current = 0;
    }
    if (failCount.current >= MAX_BACKOFF) { console.log('[watchdog] max backoff reached'); return; }
    if (lastInterveneAt.current && Date.now() - lastInterveneAt.current < COOLDOWN_MS) { console.log('[watchdog] cooldown'); return; }

    const { tracker, interventionTracker, onIntervene } = cbRef.current;
    const { currentBlocks, chatHistory, endpoint, apiKey, model, lang } = depsRef.current;

    interventionTracker.expirePending();

    const stuckSeconds = tracker.getStuckSeconds();
    if (!stuckSeconds || stuckSeconds < 5) { console.log('[watchdog] not stuck enough', stuckSeconds); return; }

    const matchedPatterns = runPatternMatcher(currentBlocks);

    const diffResult = analyzeBlockDiff(tracker.state.current.blockHistory);

    const blockContext = cbRef.current.blocklyRef.current?.getContext() ?? 'No blocks';

    const context = {
      stuckSeconds,
      blockDiff: diffResult.status,
      blockContext,
      matchedPatterns: matchedPatterns.map(p => ({
        id: p.id,
        hint: p.hint,
        severity: p.severity,
      })),
      consecutiveShortMessages: tracker.state.current.consecutiveShortMessages,
      editVelocityDropped: tracker.getEditVelocityDropped(),
      confidenceSignal: tracker.state.current.confidenceSignal,
      confidenceSignaledAt: tracker.state.current.confidenceSignaledAt,
      recentMessages: chatHistory.slice(-6).map(m => ({
        role: m.role,
        text: (m.content ?? '').slice(0, 120),
      })),
      recentInterventions: interventionTracker.getRecentInterventions(),
    };

    console.log('[watchdog] calling LLM with context', context);
    const decision = await callWatchdogAgent(context, endpoint, apiKey, model, lang);

    if (!decision) {
      console.log('[watchdog] LLM returned null, failCount++');
      failCount.current++;
      return;
    }

    console.log('[watchdog] decision', decision);
    failCount.current = 0;

    if (decision.action === 'intervene') {
      lastInterveneAt.current = Date.now();
      interventionTracker.recordIntervention(decision, currentBlocks);
      onIntervene(decision);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => { void runWatchdog.current(); }, INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const trigger = () => { void runWatchdog.current(); };
  return { triggerWatchdog: trigger };
}
