import { useState } from 'react';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'chat-scratchy-lang';

const translations: Record<Lang, Record<string, string>> = {
  zh: {
    Chats: '聊天',
    Settings: '设置',
    Split: '分屏',
    'Learning Mode': '学习模式',
    'Task Mode': '任务模式',
    Discuss: '讨论',
    Debug: '调试',
    Objectives: '目标',
    'Task Objectives': '任务目标',
    'Learning Objectives': '学习目标',
    'Block Execution Log': '积木执行日志',
    'No debug output yet. Run a Scratch script to see output here.': '暂无调试输出。运行 Scratch 脚本后，这里会显示运行日志。',
    Thinking: '思考中',
    'Thinking...': '思考中...',
    'Send a message...': '发送消息...',
    'How can I help you today?': '今天我能帮你什么？',
    You: '你',
    'API Key': 'API 密钥',
    'Endpoint URL': '接口地址',
    '+ New Chat': '+ 新对话',
    Error: '错误',
    'Unknown error': '未知错误',
    'No response body': '无响应内容',
    'API error': 'API 错误',
  },
  en: {
    Chats: 'Chats',
    Settings: 'Settings',
    Split: 'Split',
    'Learning Mode': 'Learning Mode',
    'Task Mode': 'Task Mode',
    Discuss: 'Discuss',
    Debug: 'Debug',
    Objectives: 'Objectives',
    'Task Objectives': 'Task Objectives',
    'Learning Objectives': 'Learning Objectives',
    'Block Execution Log': 'Block Execution Log',
    'No debug output yet. Run a Scratch script to see output here.': 'No debug output yet. Run a Scratch script to see output here.',
    Thinking: 'Thinking',
    'Thinking...': 'Thinking...',
    'Send a message...': 'Send a message...',
    'How can I help you today?': 'How can I help you today?',
    You: 'You',
    'API Key': 'API Key',
    'Endpoint URL': 'Endpoint URL',
    '+ New Chat': '+ New Chat',
    Error: 'Error',
    'Unknown error': 'Unknown error',
    'No response body': 'No response body',
    'API error': 'API error',
  },
};

function loadLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {}
  return 'zh';
}

function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

export function useI18n() {
  const [lang, setLang] = useState<Lang>(loadLang);
  const t = (key: string): string => translations[lang][key] ?? key;
  const toggleLang = () => setLang(l => {
    const next = l === 'zh' ? 'en' : 'zh';
    saveLang(next);
    return next;
  });
  return { t, lang, toggleLang };
}
