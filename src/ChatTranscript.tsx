import type { JSX } from 'react';
import { marked } from 'marked';
import type { ChatMessage } from './api';

// ── Thinking-block parsing (shared with the student app) ────────────

export interface ParsedContent { thinking: string; content: string; }

export function parseThinkingBlocks(text: string): ParsedContent {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/gi;
  let thinking = '';
  let content = text;
  let match;
  while ((match = thinkRegex.exec(text)) !== null) { if (match[1]) thinking += match[1].trim() + '\n'; }
  while ((match = thoughtRegex.exec(text)) !== null) { if (match[1]) thinking += match[1].trim() + '\n'; }
  if (thinking) content = text.replace(thinkRegex, '').replace(thoughtRegex, '').trim();
  return { thinking: thinking.trim(), content };
}

export function renderMarkdown(content: string): string {
  return marked.parse(content, { async: false }) as string;
}

// ── Tool-call → action chip mapping ─────────────────────────────────

type ToolChip = { icon: string; label: string | ((args: Record<string, string>) => string) } | null;

export const TOOL_CHIP_MAP: Record<string, ToolChip> = {
  get_scratch_context:      null,
  get_generated_code:       null,
  highlight_block:          { icon: '✨', label: (a) => `highlighted ${a.blockRef}` },
  show_block_tip:           { icon: '💬', label: (a) => `tip on ${a.blockRef}` },
  clear_tips:               { icon: '🧹', label: 'cleared tips' },
  zoom_to_block:            { icon: '🎯', label: (a) => `zoomed to ${a.blockRef}` },
  zoom_to_fit:              { icon: '🎯', label: 'zoomed to fit' },
  mark_block_correct:       { icon: '✅', label: (a) => `${a.blockRef} correct` },
  mark_block_issue:         { icon: '⚠️', label: (a) => `${a.blockRef}: ${a.message}` },
  highlight_toolbox_block:  { icon: '👉', label: (a) => `${a.category} → ${a.blockType}` },
  suggest_category:         { icon: '📂', label: (a) => `opened ${a.category}` },
  run_program:              { icon: '▶', label: 'ran program' },
};

// ── Transcript renderer ─────────────────────────────────────────────

interface ChatTranscriptProps {
  messages: ChatMessage[];
  t: (key: string) => string;
  expandedThinking: Set<number>;
  onToggleThinking: (idx: number) => void;
}

export function ChatTranscript({ messages, t, expandedThinking, onToggleThinking }: ChatTranscriptProps) {
  // Build tool_call_id → { name, args } index from all assistant messages.
  const toolCallIndex = new Map<string, { name: string; args: Record<string, string> }>();
  for (const m of messages) {
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        let args: Record<string, string> = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
        toolCallIndex.set(tc.id, { name: tc.function.name, args });
      }
    }
  }

  return (
    <>
      {messages.filter(m => m.role !== 'system').map((msg, idx): JSX.Element | null => {
        // Assistant messages that only carry tool_calls with no text are invisible.
        if (msg.role === 'assistant' && !msg.content && msg.tool_calls?.length) return null;

        // Tool result messages → compact action chips.
        if (msg.role === 'tool') {
          const call = msg.tool_call_id ? toolCallIndex.get(msg.tool_call_id) : undefined;
          if (!call) return null;
          const chipDef = TOOL_CHIP_MAP[call.name];
          if (!chipDef) return null;
          const label = typeof chipDef.label === 'function' ? chipDef.label(call.args) : chipDef.label;
          return (
            <div key={idx} className="tool-action-chip">
              <span className="tool-action-icon">{chipDef.icon}</span>
              <span className="tool-action-label">{label}</span>
            </div>
          );
        }

        const parsed = parseThinkingBlocks(msg.content ?? '');
        return (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="avatar">{msg.role === 'user' ? t('You') : 'AI'}</div>
            <div className="content">
              {parsed.thinking && (
                <div className="thinking">
                  <div className="thinking-header" onClick={() => onToggleThinking(idx)}>
                    {expandedThinking.has(idx) ? '▼' : '▶'} {t('Thinking')}
                  </div>
                  {expandedThinking.has(idx) && (
                    <pre className="thinking-content">{parsed.thinking}</pre>
                  )}
                </div>
              )}
              {parsed.content && (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(parsed.content) }} />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
