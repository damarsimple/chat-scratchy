import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import type { JSX } from 'react';
import { useI18n } from './i18n';
import EN_SYSTEM_PROMPT from './en-sys-prompt.txt?raw';
import ZH_SYSTEM_PROMPT from './zh-sys-prompt.txt?raw';
import { BlocklyPanel } from './BlocklyPanel';
import type { BlocklyPanelHandle } from './BlocklyPanel';
import type { BlockData } from './scratchPatterns';
import { useActivityTracker } from './useActivityTracker';
import { useInterventionTracker } from './useInterventionTracker';
import { useProactiveAgent } from './useProactiveAgent';
import { ConfidenceButtons } from './ConfidenceButtons';
import { ChatTranscript, parseThinkingBlocks, renderMarkdown } from './ChatTranscript';
import { StudentJoin } from './StudentJoin';
import { checkObjective } from './objectives';
import {
  loadIdentity, saveBlockly, postEvent, postIntervention, ping,
  getStudentProfile, saveStudentProfile,
  type StudentIdentity,
} from './api';

interface ToolCallDef {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallDef[];
  tool_call_id?: string;
}

interface Settings {
  apiKey: string;
  endpoint: string;
  model: string;
  systemPrompt: string;
}

interface Session {
  id: string;
  title: string;
  updatedAt: string;
}

const DEFAULT_ENDPOINT = import.meta.env.VITE_API_ENDPOINT ?? '/api/chat/completions';
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_MODEL ?? 'gpt-3.5-turbo';
const ENV_API_KEY = import.meta.env.VITE_API_KEY ?? '';

const MODELS: string[] = [...new Set([DEFAULT_MODEL, 'gpt-4', 'gpt-4o'])];

// Token budget for completions. Reasoning models burn most of the budget on
// hidden reasoning before emitting the answer, so we keep this generous; the
// inference backend is provisioned to handle large outputs.
const MAX_TOKENS = 50000;

function loadSettings(): Settings {
  const defaultModel: string = DEFAULT_MODEL;
  const defaultPrompt = EN_SYSTEM_PROMPT;
  try {
    const stored = localStorage.getItem('chat-settings');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Settings>;
      return {
        apiKey: parsed.apiKey ?? ENV_API_KEY,
        endpoint: parsed.endpoint ?? DEFAULT_ENDPOINT,
        model: parsed.model ?? defaultModel,
        systemPrompt: parsed.systemPrompt ?? defaultPrompt,
      };
    }
  } catch { /* ignore */ }
  return { apiKey: ENV_API_KEY, endpoint: DEFAULT_ENDPOINT, model: defaultModel, systemPrompt: defaultPrompt };
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem('chat-settings', JSON.stringify(settings));
  } catch { /* ignore */ }
}

// Session list for the current student.
async function fetchSessions(studentId: string | null): Promise<Session[]> {
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  const res = await fetch(`${API_BASE}/sessions${qs}`, { credentials: 'include' });
  return res.json() as Promise<Session[]>;
}

async function createSession(identity: StudentIdentity | null, objectiveId: string | undefined, lang: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: identity?.studentId ?? null,
      classId: identity?.classId ?? null,
      objectiveId: objectiveId ?? null,
      lang,
    }),
  });
  return res.json() as Promise<Session>;
}

async function fetchSession(id: string): Promise<{ messages: Message[] }> {
  const res = await fetch(`${API_BASE}/sessions/${id}`, { credentials: 'include' });
  return res.json() as Promise<{ messages: Message[] }>;
}

async function updateSession(id: string, messages: Message[]): Promise<void> {
  await fetch(`${API_BASE}/sessions/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

async function deleteSession(id: string): Promise<void> {
  await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE', credentials: 'include' });
}

function App() {
  const [identity, setIdentity] = useState<StudentIdentity | null>(loadIdentity);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [streamingThinking, setStreamingThinking] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState<boolean>(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(new Set());
  const [streamingThinkingExpanded, setStreamingThinkingExpanded] = useState<boolean>(false);
  const [mode, setMode] = useState<'learning' | 'task'>('task');
  const [chatTab, setChatTab] = useState<'discuss'>('discuss');
  const [chatMinimized, setChatMinimized] = useState<boolean>(false);
  const [currentBlocks, setCurrentBlocks] = useState<BlockData[]>([]);
  const [confidenceSignal, setConfidenceSignal] = useState<string | null>(null);
  const [selectedObjective, setSelectedObjective] = useState(0);
  const [partnerStatus, setPartnerStatus] = useState<'idle' | 'analyzing' | 'intervening'>('idle');
  // Objective completion banner + once-per-session "completed" guard.
  const [objectiveComplete, setObjectiveComplete] = useState(false);
  const completedObjectivesRef = useRef<Set<string>>(new Set());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingThinkingRef = useRef<HTMLPreElement>(null);
  const blocklyRef = useRef<BlocklyPanelHandle>(null);
  // Synchronous mutex — flips before the first await so concurrent callers see it immediately.
  // isLoading (React state) lags by one render cycle; this ref does not.
  const llmBusyRef = useRef(false);
  // Debounce timer for blockly autosave.
  const blocklySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Aborts the in-flight chat LLM request when the student hits Stop.
  const chatAbortRef = useRef<AbortController | null>(null);
  // Current objective id + session id, kept in refs so the (stable) block-change
  // callback always reads fresh values without re-subscribing the Blockly listener.
  const objectiveIdRef = useRef<string | undefined>(undefined);
  const currentSessionIdRef = useRef<string | null>(null);
  currentSessionIdRef.current = currentSessionId;
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  // Rolling AI memory: the tutor's accumulated notes about this student, loaded on
  // mount and injected into the system prompt. Kept in a ref so buildSystemContent
  // (and the summary updater) always read the latest without re-binding.
  const studentProfileRef = useRef<string>('');
  // Guards/counters for the background profile summarizer.
  const profileUpdatingRef = useRef(false);
  const turnsSinceProfileRef = useRef(0);

  const tracker = useActivityTracker();
  const interventionTracker = useInterventionTracker();

  const { t, lang, toggleLang } = useI18n();

  const taskObjectives = [
    { id: 'animation', label: t('objective_animation_label'), description: t('objective_animation_desc') },
    { id: 'cat-mouse', label: t('objective_cat_mouse_label'), description: t('objective_cat_mouse_desc') },
    { id: 'quiz', label: t('objective_quiz_label'), description: t('objective_quiz_desc') },
    { id: 'pong', label: t('objective_pong_label'), description: t('objective_pong_desc') },
    { id: 'falling', label: t('objective_falling_label'), description: t('objective_falling_desc') },
  ];

  // Keep the objective-id ref in sync and re-check completion against the new
  // objective when the student switches tasks.
  const currentObjectiveId = taskObjectives[selectedObjective]?.id;
  useEffect(() => {
    objectiveIdRef.current = currentObjectiveId;
    const status = checkObjective(currentObjectiveId, currentBlocks);
    setObjectiveComplete(status?.complete ?? false);
  }, [currentObjectiveId, currentBlocks]);

  useEffect(() => {
    void loadSessionsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load this student's rolling AI memory once, so it can seed the system prompt.
  useEffect(() => {
    const sid = identity?.studentId;
    if (!sid) return;
    void getStudentProfile(sid).then((p) => { studentProfileRef.current = p.profile ?? ''; }).catch(() => {});
  }, [identity?.studentId]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading, streamingContent, streamingThinking]);

  useEffect(() => {
    if (streamingThinkingRef.current) {
      streamingThinkingRef.current.scrollTop = streamingThinkingRef.current.scrollHeight;
    }
  }, [streamingThinking]);

  // Presence heartbeat: ping the server while a session is active and the tab is visible.
  useEffect(() => {
    if (!currentSessionId) return;
    const id = currentSessionId;
    const beat = () => { if (document.visibilityState !== 'hidden') void ping(id).catch(() => {}); };
    beat();
    const interval = setInterval(beat, 30_000);
    return () => clearInterval(interval);
  }, [currentSessionId]);

  const loadSessionsList = async (): Promise<void> => {
    try {
      const list = await fetchSessions(identity?.studentId ?? null);
      setSessions(list);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

  const buildSystemContent = (): string => {
    // Pick the prompt by display language so the model replies in that language
    // directly — no separate translation round-trip. Tool-call args are structured
    // JSON and language-independent, so reliability is unaffected.
    const basePrompt = lang === 'zh' ? ZH_SYSTEM_PROMPT : EN_SYSTEM_PROMPT;
    const objDesc = taskObjectives[selectedObjective]?.description;
    let prompt = objDesc ? basePrompt + '\n\n' + t('objective_heading') + objDesc : basePrompt;
    // Inject the rolling AI memory so the tutor "remembers" the student across
    // sessions. It's the tutor's private notes — never recite it back verbatim.
    const memory = studentProfileRef.current.trim();
    if (memory) prompt += '\n\n' + t('memory_heading') + memory;
    return prompt;
  };

  const startNewSession = async (): Promise<string | null> => {
    try {
      const objId = taskObjectives[selectedObjective]?.id;
      const session = await createSession(identity, objId, lang);
      setCurrentSessionId(session.id);
      setMessages([{ role: 'system', content: buildSystemContent() }]);
      setSessions([{ id: session.id, title: 'New Chat', updatedAt: new Date().toISOString() }, ...sessions]);
      return session.id;
    } catch (e) {
      console.error('Failed to create session:', e);
      return null;
    }
  };

  const loadSession = async (id: string): Promise<void> => {
    try {
      const session = await fetchSession(id);
      const loadedMessages: Message[] = session.messages.length > 0
        ? session.messages
        : [{ role: 'system', content: buildSystemContent() }];
      setMessages(loadedMessages);
      setCurrentSessionId(id);
      setShowSessions(false);
    } catch (e) {
      console.error('Failed to load session:', e);
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    try {
      await deleteSession(id);
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([]);
      }
      void loadSessionsList();
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  const SCRATCH_TOOLS = [
    {
      type: 'function',
      function: { name: 'get_scratch_context', description: 'Get current blocks and sprite state. Returns block refs (#ref1, #ref2, ...) that are required for all other block-targeting tools. ALWAYS call this first.', parameters: { type: 'object', properties: {} } }
    },
    {
      type: 'function',
      function: { name: 'get_generated_code', description: 'Get the equivalent Javascript code for the current blocks', parameters: { type: 'object', properties: {} } }
    },
    {
      type: 'function',
      function: {
        name: 'highlight_block', description: 'Highlight a specific block in the workspace. blockRef must be a ref like #ref1 returned by get_scratch_context',
        parameters: { type: 'object', properties: { blockRef: { type: 'string' } }, required: ['blockRef'] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'show_block_tip', description: 'Show a message tip pointing to a block. blockRef must be a ref like #ref1 returned by get_scratch_context',
        parameters: { type: 'object', properties: { blockRef: { type: 'string' }, message: { type: 'string' } }, required: ['blockRef', 'message'] }
      }
    },
    {
      type: 'function',
      function: { name: 'clear_tips', description: 'Clear all block tips', parameters: { type: 'object', properties: {} } }
    },
    {
      type: 'function',
      function: {
        name: 'zoom_to_block', description: 'Center the workspace on a block. blockRef must be a ref like #ref1 returned by get_scratch_context',
        parameters: { type: 'object', properties: { blockRef: { type: 'string' } }, required: ['blockRef'] }
      }
    },
    {
      type: 'function',
      function: { name: 'zoom_to_fit', description: 'Zoom to fit all blocks in the workspace', parameters: { type: 'object', properties: {} } }
    },
    {
      type: 'function',
      function: {
        name: 'mark_block_correct', description: 'Mark a block as correct (shows a ✅ tip). blockRef must be a ref like #ref1 returned by get_scratch_context',
        parameters: { type: 'object', properties: { blockRef: { type: 'string' } }, required: ['blockRef'] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'mark_block_issue', description: 'Mark a block as having an issue (shows a ⚠️ tip). blockRef must be a ref like #ref1 returned by get_scratch_context',
        parameters: { type: 'object', properties: { blockRef: { type: 'string' }, message: { type: 'string' } }, required: ['blockRef', 'message'] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'highlight_toolbox_block', description: 'Open a toolbox category and highlight a specific block in the flyout. category is one of: Motion, Looks, Sound, Events, Control, Sensing, Logic, Text, Math, Variables. blockType is the programmatic type like scratch_movesteps, scratch_says, controls_if, etc.',
        parameters: { type: 'object', properties: { category: { type: 'string' }, blockType: { type: 'string' } }, required: ['category', 'blockType'] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'suggest_category', description: 'Open a toolbox category',
        parameters: { type: 'object', properties: { category: { type: 'string', description: 'Motion, Looks, Sound, Events, Control, Sensing, Logic, Text, Math, Variables' } }, required: ['category'] }
      }
    },
    {
      type: 'function',
      function: { name: 'run_program', description: 'Start the Scratch program', parameters: { type: 'object', properties: {} } }
    }
  ];

  const executeToolCall = async (tc: { id: string; function: { name: string; arguments: string } }): Promise<string> => {
    let args: any = {};
    try { args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { /* ignore */ }
    const ref = blocklyRef.current;
    if (!ref) return 'Scratch pad not available';
    // Tools that target a block must report honest success/failure: if the ref
    // doesn't resolve to a live block, tell the model so it doesn't believe it
    // acted on a block that doesn't exist (and can re-fetch fresh context).
    const requireBlock = (): string | null =>
      ref.hasBlock(args.blockRef)
        ? null
        : `Error: no block matches ref "${args.blockRef}". Call get_scratch_context to get current refs, then retry.`;
    switch (tc.function.name) {
      case 'get_scratch_context': return ref.getContext();
      case 'get_generated_code': return ref.getGeneratedCode();
      case 'highlight_block': return requireBlock() ?? (ref.highlightBlock(args.blockRef), `Highlighted ${args.blockRef}`);
      case 'show_block_tip': return requireBlock() ?? (ref.showBlockTip(args.blockRef, args.message), `Tip shown on ${args.blockRef}`);
      case 'clear_tips': ref.clearBlockTips(); return 'Tips cleared';
      case 'zoom_to_block': return requireBlock() ?? (ref.zoomToBlock(args.blockRef), `Zoomed to ${args.blockRef}`);
      case 'zoom_to_fit': ref.zoomToFit(); return 'Zoomed to fit';
      case 'mark_block_correct': return requireBlock() ?? (ref.showBlockTip(args.blockRef, '✅ Correct!'), `Marked ${args.blockRef} correct`);
      case 'mark_block_issue': return requireBlock() ?? (ref.showBlockTip(args.blockRef, `⚠️ ${args.message}`), `Marked ${args.blockRef} with an issue`);
      case 'highlight_toolbox_block': ref.highlightToolboxBlock(args.category, args.blockType); return `Highlighted ${args.blockType} in ${args.category} toolbox`;
      case 'suggest_category': ref.suggestCategory(args.category); return `Category ${args.category} suggested`;
      case 'run_program': ref.runProgram(); return 'Program running';
      default: return `Unknown tool: ${tc.function.name}`;
    }
  };

  const streamResponse = async (
    messages: Message[],
    tools: unknown,
    signal?: AbortSignal,
  ): Promise<{
    content: string;
    thinking: string;
    toolCalls: { id: string; function: { name: string; arguments: string } }[];
    error?: string;
    aborted?: boolean;
  }> => {
    let response: Response;
    try {
      response = await fetch(settings.endpoint, {
      method: 'POST',
      signal: signal ?? null,
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { 'Authorization': `Bearer ${settings.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        max_tokens: MAX_TOKENS,
        ...(tools ? { tools } : {}),
      }),
      });
    } catch (e) {
      // fetch itself rejects with AbortError when the student hits Stop.
      if ((e as Error)?.name === 'AbortError') return { content: '', thinking: '', toolCalls: [], aborted: true };
      return { content: '', thinking: '', toolCalls: [], error: (e as Error)?.message ?? 'Network error' };
    }

    if (!response.ok) {
      return { content: '', thinking: '', toolCalls: [], error: `API error: ${response.status}` };
    }

    if (!response.body) {
      return { content: '', thinking: '', toolCalls: [], error: 'No response body' };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    let accumulatedThinking = '';
    const toolCallAccum: Record<number, { id: string; function: { name: string; arguments: string } }> = {};

    let streamAborted = false;
    const readChunk = (): Promise<boolean> => {
      return new Promise(resolve => {
        reader.read().then(({ done, value }) => {
          if (done) { resolve(true); return; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              const reasoning = choice.delta?.reasoning_content ?? '';
              if (reasoning) {
                accumulatedThinking += reasoning;
                setStreamingThinking(accumulatedThinking);
              }

              const content = choice.delta?.content ?? '';
              if (content) {
                accumulatedContent += content;
                setStreamingContent(accumulatedContent);
              }

              const tcs = choice.delta?.tool_calls;
              if (tcs) {
                for (const tc of tcs) {
                  const idx = tc.index;
                  if (!toolCallAccum[idx]) {
                    toolCallAccum[idx] = { id: '', function: { name: '', arguments: '' } };
                  }
                  if (tc.id) toolCallAccum[idx].id = tc.id;
                  if (tc.function?.name) toolCallAccum[idx].function.name += tc.function.name;
                  if (tc.function?.arguments) toolCallAccum[idx].function.arguments += tc.function.arguments;
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }

          resolve(false);
        }).catch((e) => {
          // Reader rejects with AbortError mid-stream when the student hits Stop.
          if ((e as Error)?.name === 'AbortError') streamAborted = true;
          resolve(true);
        });
      });
    };

    while (true) {
      const done = await readChunk();
      if (done) break;
    }

    const toolCalls = Object.values(toolCallAccum).filter(tc => tc.id);
    return { content: accumulatedContent, thinking: accumulatedThinking, toolCalls, aborted: streamAborted };
  };

  const handleSend = async (text?: string): Promise<void> => {
    const trimmedInput = (text ?? input).trim();
    if (trimmedInput === '' || llmBusyRef.current) return;
    llmBusyRef.current = true;
    const abortController = new AbortController();
    chatAbortRef.current = abortController;
    try {

    let activeSessionId = currentSessionId;
    if (activeSessionId === null) {
      activeSessionId = await startNewSession();
    }

    if (!text) setInput('');
    setIsLoading(true);
    tracker.recordStudentMessage(trimmedInput);

    const userMessage: Message = { role: 'user', content: trimmedInput };
    const sysContent = buildSystemContent();
    const systemMessage: Message = { role: 'system', content: sysContent };
    const existingMessagesWithoutSystem = messages.filter(m => m.role !== 'system');

    // Remove trailing orphaned tool exchanges (from proactive interventions)
    while (existingMessagesWithoutSystem.length > 0) {
      const last = existingMessagesWithoutSystem[existingMessagesWithoutSystem.length - 1];
      if (last?.role === 'tool' || (last?.role === 'assistant' && last.tool_calls && !last.content)) {
        existingMessagesWithoutSystem.pop();
      } else {
        break;
      }
    }

    const tools = mode === 'task' ? SCRATCH_TOOLS : undefined;

    // Auto-inject a get_scratch_context exchange when the workspace has changed
    // since the last time context appeared in the conversation.
    const messagesForLLM = [...existingMessagesWithoutSystem];
    if (mode === 'task' && blocklyRef.current) {
      const currentCtx = blocklyRef.current.getContext();
      const lastCtxMsg = [...messagesForLLM]
        .reverse()
        .find(m => m.role === 'tool' && (m.content?.startsWith('Sprite:') ?? false));
      if (currentCtx !== (lastCtxMsg?.content ?? '')) {
        const autoId = `auto_ctx_${Date.now()}`;
        messagesForLLM.push(
          { role: 'assistant', content: null, tool_calls: [{ id: autoId, type: 'function', function: { name: 'get_scratch_context', arguments: '{}' } }] },
          { role: 'tool', tool_call_id: autoId, content: currentCtx },
        );
      }
    }

    let currentMessages: Message[] = [systemMessage, ...messagesForLLM, userMessage];
    setMessages(currentMessages);

    let finalContent = '';
    let finalThinking = '';
    // Content/thinking saved from a response that also carried tool_calls.
    // Used as the final response so we don't need an extra LLM round-trip.
    let savedContent = '';
    let savedThinking = '';
    let error: string | undefined;
    let aborted = false;
    // Each pass that returns tool_calls is one "round": the model acts on the
    // workspace, we run the tools, then loop so it can react. Cap the rounds so a
    // misbehaving model can't loop forever.
    const MAX_TOOL_ROUNDS = 5;
    let toolRounds = 0;

    while (true) {
      setStreamingContent('');
      setStreamingThinking('');

      // Once the round cap is hit, make a final call with NO tools so the model is
      // forced to produce a text answer instead of requesting yet more tool calls
      // (otherwise we'd exit with whatever partial text we happened to have).
      const roundTools = toolRounds >= MAX_TOOL_ROUNDS ? undefined : tools;
      const result = await streamResponse(currentMessages, roundTools, abortController.signal);

      if (result.aborted) { aborted = true; finalContent = result.content; finalThinking = result.thinking; break; }
      if (result.error) { error = result.error; break; }

      if (result.toolCalls.length > 0) {
        toolRounds++;
        // Save any text that came alongside the tool calls — it's the real response.
        const trimmedContent = result.content.trim();
        if (trimmedContent.length > 3) { savedContent = trimmedContent; savedThinking = result.thinking; }
        const assistantMsg: Message = {
          role: 'assistant',
          content: null,
          tool_calls: result.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
        currentMessages = [...currentMessages, assistantMsg];

        for (const tc of result.toolCalls) {
          const toolResult = await executeToolCall(tc);
          currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
        }
        // If the model already gave us the response text, skip the follow-up LLM call.
        if (savedContent) {
          finalContent = savedContent;
          finalThinking = savedThinking;
          break;
        }
        continue;
      }

      finalContent = result.content || savedContent;
      finalThinking = result.thinking || savedThinking;
      break;
    }

    if (aborted) {
      // Student stopped generation: keep whatever text streamed in, mark it, and
      // persist so the partial turn isn't lost.
      setIsLoading(false);
      setStreamingContent('');
      setStreamingThinking('');
      const partial = (finalContent || savedContent).trim();
      const stoppedNote = lang === 'zh' ? '（已停止）' : '(stopped)';
      const assistantMessage: Message = {
        role: 'assistant',
        content: partial ? `${partial}\n\n_${stoppedNote}_` : `_${stoppedNote}_`,
      };
      const allMessages = [...currentMessages, assistantMessage];
      setMessages(allMessages);
      if (activeSessionId !== null) { await updateSession(activeSessionId, allMessages); void loadSessionsList(); }
    } else if (error) {
      setIsLoading(false);
      setStreamingContent('');
      setStreamingThinking('');
      setMessages([...currentMessages, { role: 'assistant', content: `${t('Error')}: ${error}` }]);
    } else if (finalContent || finalThinking) {
      // The model already replies in the display language (zh/en prompt), so no
      // translation step is needed.
      const displayContent = finalContent;

      // Clear loading state BEFORE setting messages — prevents double-render
      setIsLoading(false);
      setStreamingContent('');
      setStreamingThinking('');

      const finalAssistantContent = displayContent + (finalThinking ? `\n<think>\n${finalThinking}\n</think>` : '');
      const assistantMessage: Message = { role: 'assistant', content: finalAssistantContent };
      const allMessages = [...currentMessages, assistantMessage];
      setMessages(allMessages);

      if (activeSessionId !== null) {
        await updateSession(activeSessionId, allMessages);
        void loadSessionsList();
      }

      // Periodically refresh the rolling AI memory (every few exchanges), so it
      // stays current without an LLM call on every single turn.
      turnsSinceProfileRef.current += 1;
      if (turnsSinceProfileRef.current >= 3) {
        turnsSinceProfileRef.current = 0;
        void updateStudentProfile('chat_progress');
      }
    } else {
      // Model returned nothing (tool-only loop with no text)
      setIsLoading(false);
      setStreamingContent('');
      setStreamingThinking('');
      setMessages(currentMessages);
    }

    } finally {
      llmBusyRef.current = false;
      chatAbortRef.current = null;
    }
  };

  const stopGeneration = (): void => {
    chatAbortRef.current?.abort();
  };

  // Rolling AI memory updater. Asks the model to fold recent activity into a
  // compact tutoring profile (prev profile + recent chat + current blocks +
  // objective status), then persists it. Runs in the background, best-effort —
  // failures never disrupt the lesson. Guarded so only one runs at a time.
  const updateStudentProfile = async (reason: string): Promise<void> => {
    const studentId = identity?.studentId;
    if (!studentId || profileUpdatingRef.current) return;
    profileUpdatingRef.current = true;
    try {
      const recent = messagesRef.current
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-12)
        .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${(m.content as string).replace(/<think>[\s\S]*?<\/think>/g, '').trim()}`)
        .join('\n');
      if (!recent) return;

      const objId = objectiveIdRef.current;
      const blocksCtx = blocklyRef.current?.getContext() ?? '';
      const status = checkObjective(objId, currentBlocks);
      const objLine = objId
        ? `Objective "${objId}": ${status ? Math.round(status.progress * 100) + '% done' + (status.complete ? ' (COMPLETE)' : '') : 'in progress'}.`
        : 'No objective selected.';

      const sys = 'You maintain a concise tutoring memory about a young Scratch student across sessions. '
        + 'Given the previous notes and recent activity, output an UPDATED profile in English: 2–4 short sentences '
        + 'covering what the student understands, what they struggle with, their interests, and their working style. '
        + 'Keep only durable, useful facts; merge rather than repeat; stay under 100 words. Output ONLY the profile text, no preamble.';
      const userMsg = `Previous notes:\n${studentProfileRef.current || '(none yet)'}\n\n`
        + `Recent activity (trigger: ${reason}):\n${objLine}\n\nCurrent blocks:\n${blocksCtx || '(none)'}\n\nRecent conversation:\n${recent}`;

      const res = await fetch(settings.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
          stream: false,
          // Reasoning models spend most of the budget on hidden reasoning; too small
          // a cap starves the final answer (empty content). Give it real headroom.
          max_tokens: MAX_TOKENS,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const raw: string = data?.choices?.[0]?.message?.content ?? '';
      const profile = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 1500);
      if (!profile) return;

      studentProfileRef.current = profile;
      turnsSinceProfileRef.current = 0;
      await saveStudentProfile(studentId, profile).catch(() => {});
    } catch {
      /* best-effort: never let memory upkeep break the lesson */
    } finally {
      profileUpdatingRef.current = false;
    }
  };
  // Always-fresh handle so the memoized block-change callback invokes the latest
  // closure (with current identity/settings) instead of a stale captured one.
  const updateProfileRef = useRef(updateStudentProfile);
  updateProfileRef.current = updateStudentProfile;

  const handleBlockChange = useCallback((blocks: BlockData[]) => {
    setCurrentBlocks(blocks);
    tracker.recordBlockChange(blocks);
    interventionTracker.resolveWithBlockChange(blocks);

    // Objective completion: re-evaluate against the current objective. Fire once
    // per (session, objective) so we don't spam events as blocks keep changing.
    const objId = objectiveIdRef.current;
    const status = checkObjective(objId, blocks);
    if (status) {
      setObjectiveComplete(status.complete);
      const sid = currentSessionIdRef.current;
      const key = `${sid ?? 'nosession'}:${objId}`;
      if (status.complete && sid && !completedObjectivesRef.current.has(key)) {
        completedObjectivesRef.current.add(key);
        void postEvent(sid, 'objective_complete', { objectiveId: objId }).catch(() => {});
        // Completing an objective is a strong signal — fold it into the AI memory.
        void updateProfileRef.current('objective_complete');
      }
    } else {
      setObjectiveComplete(false);
    }

    // Debounced autosave of the full workspace state to the server.
    if (blocklySaveTimer.current) clearTimeout(blocklySaveTimer.current);
    blocklySaveTimer.current = setTimeout(() => {
      const ref = blocklyRef.current;
      const sid = currentSessionIdRef.current;
      if (!ref || !sid) return;
      void saveBlockly(sid, {
        workspaceJson: ref.getWorkspaceState(),
        generatedCode: ref.getGeneratedCode(),
        blockSummary: ref.getContext(),
      }).catch(() => {});
    }, 2000);
  }, [tracker, interventionTracker]);

  const handleProactiveIntervention = useCallback(async (decision: {
    action: string;
    reason: string;
    message: string;
    patternId: string | null;
    suggestBreak: boolean;
    toolCalls: unknown[];
  }) => {
    // Open the floating chat so the student sees the intervention
    setChatMinimized(false);

    const injectedMessage: Message = {
      role: 'assistant',
      content: decision.message,
    };

    // Persist the intervention server-side (fire and forget).
    if (currentSessionId) {
      void postIntervention(currentSessionId, {
        patternId: decision.patternId,
        message: decision.message,
        outcome: 'pending',
      }).catch(() => {});
    }

    const tcs = (decision.toolCalls || []) as { id?: string; name: string; arguments: any }[];
    if (tcs.length > 0) {
      setPartnerStatus('intervening');

      const tcId = `call_${Date.now()}`;
      const toolCallDefs = tcs.map((tc, i) => ({
        id: tc.id || `${tcId}_${i}`,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
      }));

      injectedMessage.tool_calls = toolCallDefs;
      setMessages(prev => [...prev, injectedMessage]);

      for (const tcDef of toolCallDefs) {
        const result = await executeToolCall(tcDef);
        const toolMsg: Message = { role: 'tool', tool_call_id: tcDef.id, content: result };
        setMessages(prev => [...prev, toolMsg]);
      }

      setTimeout(() => setPartnerStatus('idle'), 3000);
    } else {
      setMessages(prev => [...prev, injectedMessage]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  const handleAskAboutBlock = useCallback((blockRef: string, description: string) => {
    void handleSend(`Can you explain what this block does? Block: ${description} (ref: ${blockRef})`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleThinking = (idx: number): void => {
    setExpandedThinking(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
  };


  const { triggerWatchdog } = useProactiveAgent(
    { tracker, interventionTracker, onIntervene: handleProactiveIntervention, blocklyRef, llmBusyRef },
    {
      chatHistory: messages,
      currentBlocks,
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      model: settings.model,
      lang,
    },
  );

  const isEmpty = messages.length <= 1;

  const renderChatTab = (tab: string, label: string) => (
    <button
      key={tab}
      className={`chat-tab ${chatTab === tab ? 'active' : ''}`}
      onClick={() => setChatTab(tab as typeof chatTab)}
    >
      {label}
    </button>
  );

  const chatUI = (
    <>
      <div className="chat-tabs">
        {renderChatTab('discuss', t('Discuss'))}
      </div>

      {chatTab === 'discuss' && (
        <>
          {objectiveComplete && (
            <div className="objective-complete-banner">{t('objective_complete')}</div>
          )}
          <div className="chat-container" ref={chatContainerRef}>
            {isEmpty && (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                  <path d="M8 12h8M12 8v8" />
                </svg>
                <p>{t('How can I help you today?')}</p>
              </div>
            )}
            <ChatTranscript
              messages={messages}
              t={t}
              expandedThinking={expandedThinking}
              onToggleThinking={toggleThinking}
            />
            {(isLoading || streamingContent) && (
              <div className="message bot">
                <div className="avatar">AI</div>
                <div className="content">
                  {streamingThinking && (
                    <div className="thinking">
                      <div className="thinking-header" onClick={() => setStreamingThinkingExpanded(!streamingThinkingExpanded)}>
                        {streamingThinkingExpanded ? '▼' : '▶'} {t('Thinking...')}
                      </div>
                      {streamingThinkingExpanded && (
                        <pre ref={streamingThinkingRef} className="thinking-content">{streamingThinking}</pre>
                      )}
                    </div>
                  )}
                  {streamingContent ? (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(parseThinkingBlocks(streamingContent).content) }} />
                  ) : (
                    <div className="loading">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <ConfidenceButtons
            t={t}
            onSignal={(signal) => {
              setConfidenceSignal(signal);
              tracker.recordConfidenceSignal(signal);
              if (currentSessionId) void postEvent(currentSessionId, 'confidence', { signal }).catch(() => {});
              if (signal === 'confused') {
                void handleSend(t('confused_auto_message'));
              }
            }}
            currentSignal={confidenceSignal}
          />

          <div className="input-container">
            <div className="input-wrapper">
              <textarea
                ref={textareaRef}
                placeholder={t('Send a message...')}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              {isLoading ? (
                <button
                  className="send-btn stop-btn"
                  onClick={stopGeneration}
                  title={lang === 'zh' ? '停止' : 'Stop'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  className="send-btn"
                  onClick={(): void => { void handleSend(); }}
                  disabled={input.trim() === ''}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );

  // Gate: student must join a class before using the app.
  if (!identity) {
    return <StudentJoin onJoined={setIdentity} />;
  }

  return (
    <div className="app">
      <header className="header">
        <button
          className="sessions-toggle"
          onClick={(): void => setShowSessions(!showSessions)}
        >
          {showSessions ? '✕' : '☰'} {t('Chats')}
        </button>
        <button
          className="settings-toggle"
          onClick={(): void => setShowSettings(!showSettings)}
        >
          ⚙ {t('Settings')}
        </button>
        <button
          className="settings-toggle"
          onClick={(): void => setMode(mode === 'learning' ? 'task' : 'learning')}
        >
          {mode === 'task' ? '📘' : '🧩'} {mode === 'learning' ? t('Task Mode') : t('Learning Mode')}
        </button>
        <button className="settings-toggle" onClick={toggleLang}>
          {lang === 'zh' ? 'EN' : '中'}
        </button>
        <button className="settings-toggle" onClick={() => { triggerWatchdog?.(); }} title="Trigger watchdog">
          🐕
        </button>
        <select
          value={settings.model}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => updateSetting('model', e.target.value)}
        >
          {MODELS.map((model): JSX.Element => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
        {showSettings && (
          <div className="settings-panel">
            <input
              type="password"
              placeholder={t('API Key')}
              value={settings.apiKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void => updateSetting('apiKey', e.target.value)}
            />
            <input
              type="text"
              placeholder={t('Endpoint URL')}
              value={settings.endpoint}
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void => updateSetting('endpoint', e.target.value)}
            />
            <button className="new-chat-btn" onClick={(): void => { void startNewSession(); }}>
              {t('+ New Chat')}
            </button>
          </div>
        )}
      </header>

      {showSessions && (
        <div className="sessions-sidebar">
          <button className="new-chat-btn" onClick={(): void => { void startNewSession(); }}>
            {t('+ New Chat')}
          </button>
          <div className="sessions-list">
            {sessions.map((session): JSX.Element => (
              <div
                key={session.id}
                className={`session-item ${currentSessionId === session.id ? 'active' : ''}`}
                onClick={(): Promise<void> => loadSession(session.id)}
              >
                <span className="session-title">{session.title}</span>
                <button
                  className="session-delete"
                  onClick={(e: React.MouseEvent): Promise<void> => handleDeleteSession(session.id, e)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'task' ? (
        <div className="scratch-full">
          <BlocklyPanel ref={blocklyRef} lang={lang} objectiveDescription={taskObjectives[selectedObjective]?.description ?? ''} objectives={taskObjectives} selectedObjective={selectedObjective} onSelectObjective={setSelectedObjective} onBlockChange={handleBlockChange} onAskAboutBlock={handleAskAboutBlock} partnerStatus={partnerStatus} />
          <div className={`floating-chat ${chatMinimized ? 'minimized' : ''}`}>
            <div className="floating-chat-header" onClick={() => setChatMinimized(!chatMinimized)}>
              <span>{t('Chats')}</span>
              <button className="floating-chat-toggle" onClick={(e) => { e.stopPropagation(); setChatMinimized(!chatMinimized); }}>
                {chatMinimized ? '+' : '−'}
              </button>
            </div>
            {!chatMinimized && (
              <div className="floating-chat-body">{chatUI}</div>
            )}
          </div>
        </div>
      ) : chatUI}
    </div>
  );
}

export default App;
