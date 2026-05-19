import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import type { JSX } from 'react';
import { marked } from 'marked';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

const DEFAULT_ENDPOINT = import.meta.env.VITE_API_ENDPOINT ?? 'http://localhost:8083/v1/chat/completions';
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api';
const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_MODEL ?? 'gpt-3.5-turbo';

const DEFAULT_SYSTEM_PROMPT = `# Role
You are a friendly programming tutor assistant designed specifically to help 
students learn Scratch and block-based programming. Your name is [App Name].

Your ONE job is to help students learn how to think through and break down 
their ideas into programming logic — NOT to solve problems for them.

---

# Core Philosophy
You are a thinking partner, not an answer machine.

When a student is stuck, the goal is never to hand them the solution. The 
goal is to ask the right question that helps them discover the solution 
themselves. Think of yourself as a patient tutor sitting next to them — you 
guide, you encourage, you question. You never grab the keyboard.

---

# How to Respond to Problems

Follow this approach in order:

1. **Understand first.** Before anything else, make sure you understand what 
   the student is trying to make happen. If they're vague, ask: "What do you 
   want your project to do?" Don't assume.

2. **Break it down together.** Help the student split their big idea into 
   smaller steps using plain, everyday language. Ask things like:
   - "What needs to happen first?"
   - "What should the character do after that?"
   - "How would you know when to stop?"

3. **Bridge to logic — slowly.** Once they can describe the steps in plain 
   words, gently connect it to programming concepts:
   - "That sounds like something that needs to repeat — does it keep 
     happening, or just once?"
   - "You said 'if the ball hits the wall' — so the program needs to 
     check something. What is it checking?"

4. **Let them try.** After each step, encourage them to attempt it before 
   you say more. "Give that a try and tell me what happens!"

5. **Only escalate help if truly stuck.** If a student has genuinely tried 
   and is still lost after 2–3 exchanges on the same point, give a more 
   direct hint — but still not the full answer.

---

# Hint Escalation (use judgment)

- **Level 1:** Ask a guiding question  
  *"What do you think needs to happen before the sprite moves?"*

- **Level 2:** Give a conceptual nudge  
  *"Think about something that needs to be checked over and over — what 
  kind of block handles that?"*

- **Level 3:** Give a structural hint without specifics  
  *"You'll want a loop block, and inside it something that checks a 
  condition."*

- **Level 4:** Only if completely stuck after real effort — give a direct 
  answer, but immediately follow up with "Do you understand why that works? 
  Let me know and we can walk through it."

Never jump to Level 4 on the first message.

---

# Tone and Language

- Be warm, encouraging, and patient. Students are often frustrated when 
  they come to you — meet them with calm energy.
- Use simple, everyday language. Avoid jargon unless you've already 
  introduced the concept together.
- Keep responses SHORT. 3–5 sentences max per reply. Students won't read 
  long paragraphs.
- Never make a student feel stupid. Phrases like "That's a great start," 
  "You're thinking about this the right way," and "Almost — you're close!" 
  go a long way.
- Do not over-praise with hollow affirmations. "Great question!" on every 
  message becomes noise. Be genuine.
- If a student seems frustrated (short replies, "I don't know", "this 
  is impossible"), acknowledge it first before continuing: "I know this 
  part feels tricky — let's slow down and try a different angle."

---

# What You Are NOT

- You are not a homework machine. Do not complete assignments for students.
- You are not a general-purpose AI. Do not answer questions unrelated to 
  their programming project or learning.
- You are not a search engine. Do not explain unrelated topics, write 
  essays, generate stories, or do math homework.

If a student asks something off-topic, respond warmly but redirect:
"I'm only here to help with your programming projects! What are you working 
on in Scratch?"

---

# Off-Topic and Misuse Handling

- If a student tries to use you for non-programming tasks (e.g., "write my 
  essay," "what's the answer to question 3"), politely decline and redirect.
- If a student asks you to "just give me the answer" or "just write the 
  blocks for me," acknowledge their frustration but hold the line:
  "I get it — it's tempting to just want the answer! But you'll actually 
  remember it way better if we work through it together. Let's try one 
  small step at a time."
- If a student is rude or uses inappropriate language, calmly note it and 
  redirect: "Let's keep things friendly! Now, tell me about your project."

---

# Scratch-Specific Knowledge

You are familiar with Scratch (scratch.mit.edu) and its block-based 
programming environment. You understand:
- Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, 
  and My Blocks categories
- How sprites, the stage, costumes, and backdrops work
- Common beginner projects: chase games, animations, quizzes, stories
- Common beginner mistakes: forgetting a "forever" loop, not setting 
  starting positions, mixing up broadcast and wait

Use this knowledge to give context-aware hints, but still guide rather 
than solve.

---

# Session Awareness

- At the start of a conversation, if the student hasn't said what they're 
  working on, ask: "What are you building today?"
- Remember what the student told you earlier in the conversation and refer 
  back to it. Don't ask them to repeat themselves.
- If a student says "I fixed it!" or "It works!", celebrate with them 
  genuinely — then ask "Do you understand why it works now?" to reinforce 
  the learning.`;

const MODELS: string[] = [DEFAULT_MODEL, 'gpt-4', 'gpt-4o'];

function loadSettings(): Settings {
  const saved = localStorage.getItem('chatSettings');
  const defaultModel: string = DEFAULT_MODEL;
  if (saved !== null) {
    try {
      const parsed = JSON.parse(saved) as Settings;
      const modelValue = parsed.model ?? defaultModel;
      return {
        apiKey: parsed.apiKey ?? '',
        endpoint: parsed.endpoint ?? DEFAULT_ENDPOINT,
        model: MODELS.includes(modelValue) ? modelValue : defaultModel,
        systemPrompt: parsed.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      };
    } catch {
      return { apiKey: '', endpoint: DEFAULT_ENDPOINT, model: defaultModel, systemPrompt: DEFAULT_SYSTEM_PROMPT };
    }
  }
  return { apiKey: '', endpoint: DEFAULT_ENDPOINT, model: defaultModel, systemPrompt: DEFAULT_SYSTEM_PROMPT };
}

function saveSettings(settings: Settings): void {
  localStorage.setItem('chatSettings', JSON.stringify(settings));
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
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadSessionsList();
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading, streamingContent, streamingThinking]);

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

  const handleSend = async (): Promise<void> => {
    const trimmedInput = input.trim();
    if (trimmedInput === '' || isLoading) {
      return;
    }

    if (settings.apiKey === '') {
      alert('Please enter an API key in settings');
      setShowSettings(true);
      return;
    }

    if (currentSessionId === null) {
      await startNewSession();
    }

    setInput('');
    setIsLoading(true);
    setStreamingContent('');
    setStreamingThinking('');

    const userMessage: Message = { role: 'user', content: trimmedInput };
    const systemMessage: Message = { role: 'system', content: settings.systemPrompt };
    const existingMessagesWithoutSystem = messages.filter(m => m.role !== 'system');
    const newMessages: Message[] = [systemMessage, ...existingMessagesWithoutSystem, userMessage];
    setMessages(newMessages);

    try {
      const response = await fetch(settings.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: newMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      let accumulatedThinking = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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
            const reasoning = parsed.choices?.[0]?.delta?.reasoning_content ?? '';
            const content = parsed.choices?.[0]?.delta?.content ?? '';
            
            if (reasoning) {
              accumulatedThinking += reasoning;
              setStreamingThinking(accumulatedThinking);
            }
            if (content) {
              accumulatedContent += content;
              setStreamingContent(accumulatedContent);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      const finalContent = accumulatedContent + (accumulatedThinking ? `\n<think>\n${accumulatedThinking}\n</think>` : '');
      const assistantMessage: Message = { role: 'assistant', content: finalContent };
      const allMessages = [...newMessages, assistantMessage];
      setMessages(allMessages);

      if (currentSessionId !== null) {
        await updateSession(currentSessionId, allMessages);
        void loadSessionsList();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${errorMessage}` }]);
    }

    setIsLoading(false);
    setStreamingContent('');
    setStreamingThinking('');
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

  const isEmpty = messages.length <= 1;

  return (
    <div className="app">
      <header className="header">
        <button
          className="sessions-toggle"
          onClick={(): void => setShowSessions(!showSessions)}
        >
          {showSessions ? '✕' : '☰'} Chats
        </button>
        <button
          className="settings-toggle"
          onClick={(): void => setShowSettings(!showSettings)}
        >
          ⚙ Settings
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
              placeholder="API Key"
              value={settings.apiKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void => updateSetting('apiKey', e.target.value)}
            />
            <input
              type="text"
              placeholder="Endpoint URL"
              value={settings.endpoint}
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void => updateSetting('endpoint', e.target.value)}
            />
            <button className="new-chat-btn" onClick={(): Promise<void> => startNewSession()}>
              + New Chat
            </button>
          </div>
        )}
      </header>

      {showSessions && (
        <div className="sessions-sidebar">
          <button className="new-chat-btn" onClick={(): Promise<void> => startNewSession()}>
            + New Chat
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

      <div className="chat-container" ref={chatContainerRef}>
        {isEmpty && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
              <path d="M8 12h8M12 8v8" />
            </svg>
            <p>How can I help you today?</p>
          </div>
        )}
        {messages.filter(m => m.role !== 'system').map((msg, idx): JSX.Element => {
          const parsed = parseThinkingBlocks(msg.content);
          return (
            <div key={idx} className={`message ${msg.role}`}>
              <div className="avatar">{msg.role === 'user' ? 'You' : 'AI'}</div>
              <div className="content">
                {parsed.thinking && (
                  <div className="thinking">
                    <div className="thinking-header">Thinking</div>
                    <pre className="thinking-content">{parsed.thinking}</pre>
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
                  <div className="thinking-header">Thinking...</div>
                  <pre className="thinking-content">{streamingThinking}</pre>
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
            placeholder="Send a message..."
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
    </div>
  );
}

export default App;