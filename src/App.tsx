import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import type { JSX } from 'react';
import { marked } from 'marked';
import { useI18n } from './i18n';
import { BlocklyPanel } from './BlocklyPanel';
import type { BlocklyPanelHandle } from './BlocklyPanel';

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

const DEFAULT_SYSTEM_PROMPT = `# 角色
你是一位友善的程式設計輔導助理，專門設計來幫助學生學習 Scratch 和積木式程式設計。你的名字是 [應用程式名稱]。

你唯一的任務是幫助學生學習如何思考並將想法拆解成程式邏輯——而不是替他們解決問題。

---

# 語言規則（最高優先級）
**你必須永遠使用繁體中文（正體中文）回覆，無一例外。**
- 無論學生用什麼語言發言（英文、日文、其他語言），你的回覆一律使用繁體中文。
- 如果學生用英文提問，用繁體中文回答，不需要解釋為什麼。
- 這條規則的優先級高於所有其他規則，任何情況下都不得切換成其他語言。

---

# 核心理念
你是思考夥伴，不是答案機器。

當學生遇到困難時，目標從來不是直接給他們答案，而是問出對的問題，讓他們自己發現解答。把自己想像成一位耐心地坐在他們旁邊的老師——你引導、你鼓勵、你提問。你永遠不會搶過他們的鍵盤。

---

# 如何回應問題

依照以下順序進行：

1. **先理解。** 在做任何事之前，確保你清楚學生想達成什麼。如果他們說得很模糊，就問：「你希望你的專案做到什麼？」不要自己假設。

2. **一起拆解。** 用日常平易的語言，幫助學生把大想法拆成較小的步驟。可以問：
   - 「第一步需要發生什麼？」
   - 「接下來角色應該做什麼？」
   - 「你怎麼知道什麼時候要停下來？」

3. **慢慢連接到邏輯。** 一旦學生能用普通話描述步驟，再輕輕地連結到程式概念：
   - 「這聽起來像是需要重複的事情——它會一直發生，還是只發生一次？」
   - 「你說『如果球碰到牆』——所以程式需要檢查某件事。它在檢查什麼？」

4. **讓他們自己試試看。** 每個步驟之後，鼓勵他們先嘗試，再繼續說更多。「去試試看，然後告訴我發生什麼事！」

5. **真的卡住了才升級幫助程度。** 如果學生真的嘗試過，但在同一個問題上經過 2–3 次對話後仍然不懂，才給更直接的提示——但仍然不是完整答案。

---

# 提示升級（視情況判斷）

- **第一級：** 提出引導性問題  
  *「你覺得在角色移動之前，需要先發生什麼？」*

- **第二級：** 給予概念性提示  
  *「想想看有什麼東西需要一直被檢查——什麼樣的積木可以處理這件事？」*

- **第三級：** 給予結構性提示但不說細節  
  *「你會需要一個迴圈積木，裡面放一個檢查條件的積木。」*

- **第四級：** 只有在真正努力過後完全卡住——才給直接答案，但立刻跟進：「你知道為什麼這樣可以運作嗎？告訴我，我們可以一起走過一遍。」

第一則訊息絕對不要直接跳到第四級。

---

# 語氣與用語

- 保持溫暖、鼓勵和耐心。學生來找你時通常已經感到挫折——用平靜的態度迎接他們。
- 使用簡單、日常的語言。除非你們已經一起介紹過某個概念，否則避免使用術語。
- 回覆要**簡短**。每次回覆最多 3–5 句話。學生不會閱讀長篇段落。
- 絕對不要讓學生覺得自己很笨。「這是個很好的開始」、「你的想法方向是對的」、「差一點了——你很接近了！」這些話大有幫助。
- 不要用空洞的讚美過度誇獎。每則訊息都說「好問題！」只會變成噪音。要真誠。
- 如果學生看起來很挫折（回覆很短、說「我不知道」、「這不可能」），先承認這件事再繼續：「我知道這部分感覺很難——我們放慢腳步，換個角度試試看。」

---

# 你不是什麼

- 你不是作業機器。不要替學生完成作業。
- 你不是萬用 AI。不要回答與學生程式專案或學習無關的問題。
- 你不是搜尋引擎。不要解釋無關主題、寫文章、生成故事，或幫忙做數學作業。

如果學生問了題外話，溫和地回應並引導回來：
「我只能幫你解決程式設計的問題！你現在在 Scratch 上做什麼專案呢？」

---

# 題外話與不當使用的處理

- 如果學生試圖用你完成非程式設計的任務（例如：「幫我寫作文」、「第三題的答案是什麼」），禮貌地拒絕並引導回來。
- 如果學生要求你「直接給我答案」或「直接幫我寫積木」，承認他們的挫折感但堅守立場：
  「我懂——直接拿到答案很誘人！但如果我們一起把它想清楚，你真的會記得更牢。我們一次走一小步吧。」
- 如果學生態度粗魯或使用不當語言，冷靜地指出來並引導：「我們保持友善的方式吧！現在，告訴我你的專案是什麼。」

---

# Scratch 專業知識

你熟悉 Scratch（scratch.mit.edu）及其積木式程式設計環境。你了解：
- 動作、外觀、音效、事件、控制、偵測、運算子、變數，以及自製積木等類別
- 角色、舞台、造型和背景的運作方式
- 常見的初學者專案：追逐遊戲、動畫、問答遊戲、故事
- 常見的初學者錯誤：忘記加「重複無限次」迴圈、沒有設定起始位置、混淆廣播與等待

利用這些知識給予符合情境的提示，但仍以引導為主，而非直接解題。

---

# 對話意識

- 對話開始時，如果學生還沒說他們在做什麼，就問：「你今天在做什麼專案？」
- 記住學生在對話中告訴你的事，並在適當時候提及。不要讓他們重複說過的話。
- 如果學生說「我修好了！」或「成功了！」，真誠地和他們一起慶祝——然後問「你現在明白為什麼這樣可以運作嗎？」來強化學習。`;

const MODELS: string[] = [DEFAULT_MODEL, 'gpt-4', 'gpt-4o'];

function loadSettings(): Settings {
  const defaultModel: string = DEFAULT_MODEL;
  return { apiKey: '', endpoint: DEFAULT_ENDPOINT, model: defaultModel, systemPrompt: DEFAULT_SYSTEM_PROMPT };
}

function saveSettings(_settings: Settings): void {
  // localStorage disabled
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
  const [chatTab, setChatTab] = useState<'discuss' | 'debug' | 'objectives'>('discuss');
  const [chatMinimized, setChatMinimized] = useState<boolean>(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingThinkingRef = useRef<HTMLPreElement>(null);
  const blocklyRef = useRef<BlocklyPanelHandle>(null);

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

  const startNewSession = async (): Promise<void> => {
    try {
      const session = await createSession();
      setCurrentSessionId(session.id);
      setMessages([{ role: 'system', content: settings.systemPrompt }]);
      setSessions([session, ...sessions]);
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  };

  const loadSession = async (id: string): Promise<void> => {
    try {
      const session = await fetchSession(id);
      const loadedMessages: Message[] = session.messages.length > 0 
        ? session.messages 
        : [{ role: 'system', content: settings.systemPrompt }];
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
      function: {
        name: 'get_scratch_context',
        description: 'Get the current Scratch pad blocks and sprite state',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'highlight_block',
        description: 'Highlight a specific block on the Scratch pad by its reference ID',
        parameters: {
          type: 'object',
          properties: {
            blockRef: { type: 'string', description: 'Block reference ID (e.g. #ref1, #ref2)' },
          },
          required: ['blockRef'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'suggest_block',
        description: 'Open a Scratch block category to suggest blocks to the user',
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Category name: Motion, Looks, Control, Sensing, Logic, Text, Math' },
          },
          required: ['category'],
        },
      },
    },
  ];

  const executeToolCall = async (tc: { id: string; function: { name: string; arguments: string } }): Promise<string> => {
    const args = JSON.parse(tc.function.arguments);
    switch (tc.function.name) {
      case 'get_scratch_context':
        return blocklyRef.current?.getContext() ?? 'Scratch pad: not available';
      case 'highlight_block':
        blocklyRef.current?.highlightBlock(args.blockRef);
        return 'Block highlighted on Scratch pad';
      case 'suggest_block':
        blocklyRef.current?.suggestCategory(args.category);
        return `Category "${args.category}" opened on Scratch pad`;
      default:
        return `Unknown tool: ${tc.function.name}`;
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

  const handleSend = async (): Promise<void> => {
    const trimmedInput = input.trim();
    if (trimmedInput === '' || isLoading) return;

    if (currentSessionId === null) {
      await startNewSession();
    }

    setInput('');
    setIsLoading(true);

    const userMessage: Message = { role: 'user', content: trimmedInput };
    const systemMessage: Message = { role: 'system', content: settings.systemPrompt };
    const existingMessagesWithoutSystem = messages.filter(m => m.role !== 'system');
    const tools = mode === 'task' ? SCRATCH_TOOLS : undefined;

    let currentMessages: Message[] = [systemMessage, ...existingMessagesWithoutSystem, userMessage];
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

      if (currentSessionId !== null) {
        await updateSession(currentSessionId, allMessages);
        void loadSessionsList();
      }
    }

    setIsLoading(false);
    setStreamingContent('');
    setStreamingThinking('');
  };

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

  const isEmpty = messages.length <= 1;

  const taskObjectives = [
    { label: 'Move sprite 5 steps', done: false },
    { label: 'Turn sprite 90 degrees', done: false },
    { label: 'Say "Hello!" for 2 seconds', done: false },
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
        {renderChatTab('debug', t('Debug'))}
        {renderChatTab('objectives', t('Objectives'))}
      </div>

      {chatTab === 'debug' && (
        <div className="chat-container" ref={chatContainerRef}>
          <div className="debug-panel">
            <div className="debug-header">{t('Block Execution Log')}</div>
            {blocklyRef.current?.getOutputLogs()?.length > 0 ? (
              blocklyRef.current.getOutputLogs().map((log, i) => (
                <div key={i} className="debug-line">{log}</div>
              ))
            ) : (
              <div className="debug-empty">{t('No debug output yet. Run a Scratch script to see output here.')}</div>
            )}
          </div>
        </div>
      )}

      {chatTab === 'objectives' && (
        <div className="chat-container" ref={chatContainerRef}>
          <div className="objectives-panel">
            <div className="objectives-header">
              {mode === 'task' ? t('Task Objectives') : t('Learning Objectives')}
            </div>
            {taskObjectives.map((obj, i) => (
              <label key={i} className="objective-item">
                <input type="checkbox" defaultChecked={obj.done} />
                <span>{obj.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

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
            {messages.filter(m => m.role !== 'system').map((msg, idx): JSX.Element => {
              const parsed = parseThinkingBlocks(msg.content);
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
            })}
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
            <button className="new-chat-btn" onClick={(): Promise<void> => startNewSession()}>
              {t('+ New Chat')}
            </button>
          </div>
        )}
      </header>

      {showSessions && (
        <div className="sessions-sidebar">
          <button className="new-chat-btn" onClick={(): Promise<void> => startNewSession()}>
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
          <BlocklyPanel ref={blocklyRef} />
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