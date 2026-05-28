import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import type { JSX } from 'react';
import { marked } from 'marked';
import { useI18n } from './i18n';
import ZH_SYSTEM_PROMPT from './zh-sys-prompt.txt?raw';
import EN_SYSTEM_PROMPT from './en-sys-prompt.txt?raw';
import { BlocklyPanel } from './BlocklyPanel';
import type { BlocklyPanelHandle } from './BlocklyPanel';
import type { BlockData } from './scratchPatterns';
import { useActivityTracker } from './useActivityTracker';
import { useInterventionTracker } from './useInterventionTracker';
import { useProactiveAgent } from './useProactiveAgent';
import { ConfidenceButtons } from './ConfidenceButtons';

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

function loadLang(): string {
  try {
    const stored = localStorage.getItem('chat-scratchy-lang');
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {}
  return 'zh';
}

function loadSettings(): Settings {
  const defaultModel: string = DEFAULT_MODEL;
  const defaultPrompt = loadLang() === 'en' ? EN_SYSTEM_PROMPT : ZH_SYSTEM_PROMPT;
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

async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  return res.json() as Promise<Session[]>;
}

async function createSession(): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions`, { method: 'POST' });
  return res.json() as Promise<Session>;
}

async function fetchSession(id: string): Promise<{ messages: Message[] }> {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  return res.json() as Promise<{ messages: Message[] }>;
}

async function updateSession(id: string, messages: Message[]): Promise<void> {
  await fetch(`${API_BASE}/sessions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

async function deleteSession(id: string): Promise<void> {
  await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
}

interface ParsedContent {
  thinking: string;
  content: string;
}

type ToolChip = { icon: string; label: string | ((args: Record<string, string>) => string) } | null;

const TOOL_CHIP_MAP: Record<string, ToolChip> = {
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

function parseThinkingBlocks(text: string): ParsedContent {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/gi;
  
  let thinking = '';
  let content = text;
  
  let match;
  while ((match = thinkRegex.exec(text)) !== null) {
    if (match[1]) {
      thinking += match[1].trim() + '\n';
    }
  }
  while ((match = thoughtRegex.exec(text)) !== null) {
    if (match[1]) {
      thinking += match[1].trim() + '\n';
    }
  }
  
  if (thinking) {
    content = text.replace(thinkRegex, '').replace(thoughtRegex, '').trim();
  }
  
  return { thinking: thinking.trim(), content };
}

function App() {
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
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingThinkingRef = useRef<HTMLPreElement>(null);
  const blocklyRef = useRef<BlocklyPanelHandle>(null);

  const tracker = useActivityTracker();
  const interventionTracker = useInterventionTracker();

  useEffect(() => {
    void loadSessionsList();
  }, []);

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

  const loadSessionsList = async (): Promise<void> => {
    try {
      const list = await fetchSessions();
      setSessions(list);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

  const startNewSession = async (): Promise<string | null> => {
    try {
      const session = await createSession();
      setCurrentSessionId(session.id);
      const objDesc = taskObjectives[selectedObjective]?.description;
      const sysContent = objDesc ? settings.systemPrompt + '\n\n' + t('objective_heading') + objDesc : settings.systemPrompt;
      setMessages([{ role: 'system', content: sysContent }]);
      setSessions([session, ...sessions]);
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
        : [{ role: 'system', content: (() => {
            const objDesc = taskObjectives[selectedObjective]?.description;
            return objDesc ? settings.systemPrompt + '\n\n' + t('objective_heading') + objDesc : settings.systemPrompt;
          })() }];
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
    switch (tc.function.name) {
      case 'get_scratch_context': return ref.getContext();
      case 'get_generated_code': return ref.getGeneratedCode();
      case 'highlight_block': ref.highlightBlock(args.blockRef); return 'Block highlighted';
      case 'show_block_tip': ref.showBlockTip(args.blockRef, args.message); return 'Tip shown';
      case 'clear_tips': ref.clearBlockTips(); return 'Tips cleared';
      case 'zoom_to_block': ref.zoomToBlock(args.blockRef); return 'Zoomed to block';
      case 'zoom_to_fit': ref.zoomToFit(); return 'Zoomed to fit';
      case 'mark_block_correct': ref.showBlockTip(args.blockRef, '✅ Correct!'); return 'Marked correct';
      case 'mark_block_issue': ref.showBlockTip(args.blockRef, `⚠️ ${args.message}`); return 'Marked issue';
      case 'highlight_toolbox_block': console.log('[tool] highlight_toolbox_block args:', args); ref.highlightToolboxBlock(args.category, args.blockType); return `Highlighted ${args.blockType} in ${args.category} toolbox`;
      case 'suggest_category': console.log('[tool] suggest_category args:', args); ref.suggestCategory(args.category); return `Category ${args.category} suggested`;
      case 'run_program': ref.runProgram(); return 'Program running';
      default: return `Unknown tool: ${tc.function.name}`;
    }
  };

  const streamResponse = async (
    messages: Message[],
    tools: unknown,
  ): Promise<{
    content: string;
    thinking: string;
    toolCalls: { id: string; function: { name: string; arguments: string } }[];
    error?: string;
  }> => {
    const response = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { 'Authorization': `Bearer ${settings.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        ...(tools ? { tools } : {}),
      }),
    });

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
        });
      });
    };

    while (true) {
      const done = await readChunk();
      if (done) break;
    }

    const toolCalls = Object.values(toolCallAccum).filter(tc => tc.id);
    return { content: accumulatedContent, thinking: accumulatedThinking, toolCalls };
  };

  const handleSend = async (text?: string): Promise<void> => {
    const trimmedInput = (text ?? input).trim();
    if (trimmedInput === '' || isLoading) return;

    let activeSessionId = currentSessionId;
    if (activeSessionId === null) {
      activeSessionId = await startNewSession();
    }

    if (!text) setInput('');
    setIsLoading(true);
    tracker.recordStudentMessage(trimmedInput);

    const userMessage: Message = { role: 'user', content: trimmedInput };
    const objDesc = taskObjectives[selectedObjective]?.description;
    const sysContent = objDesc ? settings.systemPrompt + '\n\n' + t('objective_heading') + objDesc : settings.systemPrompt;
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
    let error: string | undefined;
    let retries = 0;

    while (retries < 5) {
      retries++;
      setStreamingContent('');
      setStreamingThinking('');

      const result = await streamResponse(currentMessages, tools);

      if (result.error) {
        error = result.error;
        break;
      }

      if (result.toolCalls.length > 0) {
        const assistantMsg: Message = {
          role: 'assistant',
          content: result.content || null,
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
        continue;
      }

      finalContent = result.content;
      finalThinking = result.thinking;
      break;
    }

    if (error) {
      setMessages([...currentMessages, { role: 'assistant', content: `${t('Error')}: ${error}` }]);
    } else {
      const finalAssistantContent = finalContent + (finalThinking ? `\n<think>\n${finalThinking}\n</think>` : '');
      const assistantMessage: Message = { role: 'assistant', content: finalAssistantContent };
      const allMessages = [...currentMessages, assistantMessage];
      setMessages(allMessages);

      if (activeSessionId !== null) {
        await updateSession(activeSessionId, allMessages);
        void loadSessionsList();
      }
    }

    setIsLoading(false);
    setStreamingContent('');
    setStreamingThinking('');
  };

  const handleBlockChange = useCallback((blocks: BlockData[]) => {
    setCurrentBlocks(blocks);
    tracker.recordBlockChange(blocks);
    interventionTracker.resolveWithBlockChange(blocks);
  }, [tracker, interventionTracker]);

  const handleProactiveIntervention = useCallback(async (decision: {
    action: string;
    reason: string;
    message: string;
    patternId: string | null;
    suggestBreak: boolean;
    toolCalls: unknown[];
  }) => {
    const injectedMessage: Message = {
      role: 'assistant',
      content: decision.message,
    };
    
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
  }, []);

  const handleAskAboutBlock = useCallback((blockRef: string, description: string) => {
    void handleSend(`Can you explain what this block does? Block: ${description} (ref: ${blockRef})`);
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

  const renderContent = (content: string): string => {
    return marked.parse(content, { async: false }) as string;
  };

  const { t, lang, toggleLang } = useI18n();

  // Use a ref so the effect only re-runs when lang changes, not when updateSetting changes
  const updateSettingRef = useRef(updateSetting);
  updateSettingRef.current = updateSetting;
  useEffect(() => {
    const newPrompt = lang === 'en' ? EN_SYSTEM_PROMPT : ZH_SYSTEM_PROMPT;
    if (settings.systemPrompt !== newPrompt) {
      updateSettingRef.current('systemPrompt', newPrompt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const { triggerWatchdog } = useProactiveAgent(
    { tracker, interventionTracker, onIntervene: handleProactiveIntervention, blocklyRef },
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

  const taskObjectives = [
    {
      id: 'animation',
      label: t('objective_animation_label'),
      description: t('objective_animation_desc'),
    },
    {
      id: 'cat-mouse',
      label: t('objective_cat_mouse_label'),
      description: t('objective_cat_mouse_desc'),
    },
    {
      id: 'quiz',
      label: t('objective_quiz_label'),
      description: t('objective_quiz_desc'),
    },
    {
      id: 'pong',
      label: t('objective_pong_label'),
      description: t('objective_pong_desc'),
    },
    {
      id: 'falling',
      label: t('objective_falling_label'),
      description: t('objective_falling_desc'),
    },
  ];

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
            {(() => {
              // Build tool_call_id → { name, args } index from all assistant messages
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
              return messages.filter(m => m.role !== 'system').map((msg, idx): JSX.Element | null => {
              // Assistant messages that only carry tool_calls with no text are invisible in the chat
              if (msg.role === 'assistant' && !msg.content && msg.tool_calls?.length) return null;

              // Tool result messages → compact action chips via TOOL_CHIP_MAP
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
                        <div className="thinking-header" onClick={() => toggleThinking(idx)}>
                          {expandedThinking.has(idx) ? '▼' : '▶'} {t('Thinking')}
                        </div>
                        {expandedThinking.has(idx) && (
                          <pre className="thinking-content">{parsed.thinking}</pre>
                        )}
                      </div>
                    )}
                    {parsed.content && (
                      <div dangerouslySetInnerHTML={{ __html: renderContent(parsed.content) }} />
                    )}
                  </div>
                </div>
              );
            });
            })()}
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
                    <div dangerouslySetInnerHTML={{ __html: renderContent(streamingContent) }} />
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
              <button
                className="send-btn"
                onClick={(): void => { void handleSend(); }}
                disabled={isLoading || input.trim() === ''}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );

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
          <BlocklyPanel ref={blocklyRef} objectiveDescription={taskObjectives[selectedObjective]?.description ?? ''} objectives={taskObjectives} selectedObjective={selectedObjective} onSelectObjective={setSelectedObjective} onBlockChange={handleBlockChange} onAskAboutBlock={handleAskAboutBlock} partnerStatus={partnerStatus} />
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