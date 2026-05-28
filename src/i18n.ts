import { useState } from 'react';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'chat-scratchy-lang';

const translations: Record<Lang, Record<string, string>> = {
  zh: {
    Chats: '聊天',
    Settings: '設定',
    Split: '分割',
    'Learning Mode': '學習模式',
    'Task Mode': '任務模式',
    Discuss: '討論',
    Debug: '除錯',
    Objectives: '目標',
    'Task Objectives': '任務目標',
    'Learning Objectives': '學習目標',
    'Block Execution Log': '積木執行紀錄',
    'No debug output yet. Run a Scratch script to see output here.': '暫無除錯輸出。執行 Scratch 程式後，這裡會顯示執行紀錄。',
    Thinking: '思考中',
    'Thinking...': '思考中...',
    'Send a message...': '傳送訊息...',
    'How can I help you today?': '今天我能幫你什麼？',
    You: '你',
    'API Key': 'API 金鑰',
    'Endpoint URL': '端點網址',
    '+ New Chat': '+ 新對話',
    Error: '錯誤',
    'Unknown error': '未知錯誤',
    'No response body': '無回應內容',
    'API error': 'API 錯誤',
    'I feel confused': '我很困惑',
    'I am thinking': '我在想',
    'I got it': '我懂了',
    confused_auto_message: '我現在有點不知道怎麼做，可以給我一些提示嗎？',
    objective_heading: '# 目前目標\n',
    objective_animation_label: '簡單動畫',
    objective_animation_desc: '讓一個角色在舞台上移動（例如左右來回或任意方向），至少移動 10 步。你可以改變造型來產生動畫效果，或使用迴圈讓角色不斷移動。',
    objective_cat_mouse_label: '貓追老鼠',
    objective_cat_mouse_desc: '製作貓追老鼠的追逐遊戲。貓會跟著滑鼠游標或老鼠角色移動，老鼠可以隨機逃跑或用鍵盤控制。需要判斷什麼時候「抓到」以及是否要重新開始。',
    objective_quiz_label: '問答遊戲',
    objective_quiz_desc: '建立一個問答遊戲。用「詢問並等待」積木問使用者問題，判斷答案是否正確，用「如果…那麼」積木給予不同回應，並累積分數或計數。',
    objective_pong_label: '乒乓彈跳',
    objective_pong_desc: '實現一個乒乓球遊戲。一個球在舞台上反彈，用鍵盤控制左右或上下移動的擋板來接球，球碰到邊緣或擋板時反彈。需要追蹤分數或生命值。',
    objective_falling_label: '接住掉落物',
    objective_falling_desc: '讓物體從舞台頂端掉落，玩家用鍵盤或滑鼠移動角色來接住它們。接住得分，沒接到則扣分或遊戲結束。分數會逐漸增加難度（掉落速度變快）。',
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
    'I feel confused': "I'm confused",
    'I am thinking': 'I am thinking',
    'I got it': 'I got it',
    confused_auto_message: "I'm not sure what to do next, can you give me a hint?",
    objective_heading: '# Current Objective\n',
    objective_animation_label: 'Simple Animation',
    objective_animation_desc: 'Make a sprite move across the stage (e.g. left and right, or any direction), at least 10 steps. You can switch costumes to create an animation effect, or use a loop to make the sprite keep moving.',
    objective_cat_mouse_label: 'Cat Chasing Mouse',
    objective_cat_mouse_desc: 'Create a cat chasing mouse game. The cat follows the mouse pointer or a mouse sprite, while the mouse can run away randomly or be controlled by the keyboard. Decide when "caught" happens and whether to restart.',
    objective_quiz_label: 'Quiz Game',
    objective_quiz_desc: 'Build a quiz game. Use the "ask and wait" block to ask questions, check if the answer is correct, use "if then" blocks to give different responses, and keep score or count.',
    objective_pong_label: 'Pong / Bounce Game',
    objective_pong_desc: 'Implement a pong game. A ball bounces around the stage, and you control a paddle with the keyboard to catch it. The ball bounces when hitting edges or the paddle. Track score or lives.',
    objective_falling_label: 'Falling Objects',
    objective_falling_desc: 'Objects fall from the top of the stage. The player moves a character with keyboard or mouse to catch them. Catching scores points, missing deducts or ends the game. Difficulty increases as the score rises.',
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
