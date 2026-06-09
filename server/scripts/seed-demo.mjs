// Idempotent demo seed for product-presentation screenshots (Traditional Chinese).
// Creates one teacher, one class, objectives, students, sessions, snapshots,
// interventions and activity events with realistic-looking content.
//
//   cd server && node scripts/seed-demo.mjs
//
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEACHER = {
  email: 'teacher@scratchy.app',
  password: 'scratchy123',
  name: '李老師',
};
const JOIN_CODE = 'MEOW42';
const CLASS_NAME = '積木程式設計 — 三年甲班';

// A genuine Blockly workspace: when-flag → repeat 10 [ move, bounce, next costume, wait ].
const DANCING_CAT = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'event_whenflagclicked',
        x: 40,
        y: 40,
        next: {
          block: {
            type: 'controls_repeat_ext',
            inputs: {
              TIMES: { block: { type: 'math_number', fields: { NUM: 10 } } },
              DO: {
                block: {
                  type: 'scratch_movesteps',
                  inputs: { STEPS: { block: { type: 'math_number', fields: { NUM: 15 } } } },
                  next: {
                    block: {
                      type: 'scratch_ifonedgebounce',
                      next: {
                        block: {
                          type: 'scratch_nextcostume',
                          next: {
                            block: {
                              type: 'scratch_wait',
                              inputs: { SECONDS: { block: { type: 'math_number', fields: { NUM: 0.3 } } } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
};
const DANCING_CAT_CODE = `// 當綠旗被點擊
for (let i = 0; i < 10; i++) {
  await window.__scratchMove(15);
  await window.__scratchBounce();
  window.__scratchNextCostume();
  await window.__scratchWait(0.3);
}`;
const DANCING_CAT_SUMMARY = '當綠旗 → 重複 10 次 [ 移動 15 步 · 碰到邊緣就反彈 · 下一個造型 · 等待 0.3 秒 ]';

// A simpler in-progress workspace for a struggling student.
const STUCK_WS = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'event_whenflagclicked',
        x: 40,
        y: 40,
        next: {
          block: {
            type: 'scratch_movesteps',
            inputs: { STEPS: { block: { type: 'math_number', fields: { NUM: 10 } } } },
          },
        },
      },
    ],
  },
};

const minsAgo = (m) => new Date(Date.now() - m * 60_000);
const secsAgo = (s) => new Date(Date.now() - s * 1000);

const STUDENTS = [
  {
    displayName: '陳小明',
    lastActive: secsAgo(3), // online
    profile:
      '小明學習動作積木很快，充滿自信。他喜歡製作動畫，會先自己嘗試再求助。可鼓勵他在堆疊積木前先規劃迴圈，並養成加上註解的習慣。',
    completed: ['animation'],
    interventions: 1,
    chat: [
      ['user', '怎麼讓貓咪一直動？'],
      ['assistant', '好問題！🐱 用「重複」迴圈最適合。試著從「控制」抽屜拿一個 **重複 10 次** 的積木，把你的 **移動 10 步** 放進去。你覺得點綠旗後會發生什麼事呢？'],
      ['user', '它會動可是跑出畫面了'],
      ['assistant', '很棒的觀察！要讓它留在舞台上，在移動後面加一個 **碰到邊緣就反彈** 積木，貓咪撞到牆就會轉向。要不要再加一個 **下一個造型**，讓牠看起來像在跳舞？'],
      ['user', '哇 成功了！！牠在跳舞'],
      ['assistant', '太棒了，小明！🎉 你把迴圈、動作和造型變化組合在一起，這就是一個真正的動畫。下一個挑戰：可以讓牠每次移動之間都「等待」一下下，讓舞步更順嗎？'],
    ],
    snapshot: { ws: DANCING_CAT, code: DANCING_CAT_CODE, summary: DANCING_CAT_SUMMARY },
    events: [
      ['student_message', {}, 8],
      ['run', {}, 7],
      ['block_change', {}, 6],
      ['confidence', { signal: 'thinking' }, 5],
      ['run', {}, 3],
      ['objective_complete', { objectiveId: 'animation' }, 2],
      ['confidence', { signal: 'good' }, 1],
    ],
  },
  {
    displayName: '林佳穎',
    lastActive: secsAgo(10), // online
    profile:
      '佳穎做事有條理，會仔細看積木提示。她喜歡問答類型的專案，對於「詢問／回答」邏輯掌握得很好。她有時會猶豫不敢執行程式——可鼓勵她及早且多次測試。',
    completed: ['animation', 'quiz'],
    interventions: 0,
    chat: [
      ['user', '我想做一個會問你名字的問答遊戲'],
      ['assistant', '太好了！💬 先從「偵測」抽屜拿 **詢問 [你叫什麼名字？] 並等待**，使用者的回覆會存在 **回答** 積木裡。接著用 **說** 來跟他打招呼。試試看，再告訴我發生什麼事！'],
      ['user', '那我要怎麼檢查答案對不對？'],
      ['assistant', '用「控制」的 **如果** 積木搭配 **= (等於)** 來判斷：檢查 **回答 = 7**。對的話放一個開心的 **說** 在裡面，也可以再加一個 **說** 來提示再試一次。你正在打造真正的決策邏輯，做得很好！'],
    ],
    snapshot: { ws: DANCING_CAT, code: DANCING_CAT_CODE, summary: '當綠旗 → 詢問並等待 · 如果 回答 = … → 說' },
    events: [
      ['student_message', {}, 22],
      ['block_change', {}, 20],
      ['run', {}, 18],
      ['objective_complete', { objectiveId: 'animation' }, 14],
      ['objective_complete', { objectiveId: 'quiz' }, 4],
      ['confidence', { signal: 'good' }, 2],
    ],
  },
  {
    displayName: '王大文',
    lastActive: secsAgo(18), // online, struggling
    profile:
      '大文很有熱情，但對「順序」的信心還在建立中。他常常加了積木又刪掉。用簡短、具體的步驟搭配大量鼓勵效果最好。要留意他的挫折訊號。',
    completed: [],
    interventions: 3,
    chat: [
      ['user', '它不會動'],
      ['assistant', '別擔心，我們一起找出問題。🙂 我看到你有一個 **當綠旗被點擊** 和一個 **移動 10 步**，這是很好的開始！你想讓貓咪做什麼呢——走過畫面，還是轉圈圈？'],
      ['user', '一直走 不要停'],
      ['assistant', '了解——要一直走就需要迴圈。打開「控制」抽屜找到 **重複**，把你的 **移動** 積木拖到重複積木的「嘴巴」裡面。我已經幫你把移動積木標示出來了，之後點綠旗試試看！'],
    ],
    snapshot: { ws: STUCK_WS, code: '// 當綠旗被點擊\nawait window.__scratchMove(10);', summary: '當綠旗 → 移動 10 步' },
    events: [
      ['student_message', {}, 9],
      ['block_change', {}, 8],
      ['stuck', { seconds: 95 }, 6],
      ['block_change', {}, 5],
      ['confidence', { signal: 'confused' }, 4],
      ['stuck', { seconds: 70 }, 2],
    ],
    interventionRows: [
      { patternId: 'repeated_delete', message: '我注意到你一直在加上又刪掉積木，需要關於迴圈的提示嗎？', outcome: 'helped' },
      { patternId: 'idle_stuck', message: '慢慢來！試著把移動積木拖到重複積木裡面。', outcome: 'ignored' },
      { patternId: 'confusion_signal', message: '你按了「我很困惑」——我們把它拆成一個小步驟吧。', outcome: 'pending' },
    ],
  },
  {
    displayName: '張思妤',
    lastActive: minsAgo(8), // offline
    profile:
      '思妤很有創意，喜歡客製化她的角色。她對外觀和音效積木很上手，開始嘗試結合事件。可鼓勵她把這些想法連結到迴圈和條件判斷。',
    completed: ['animation'],
    interventions: 0,
    chat: [
      ['user', '可以改貓咪的顏色嗎'],
      ['assistant', '當然可以客製化你的角色！🎨 試試「外觀」抽屜裡的 **設定尺寸** 和 **切換造型** 積木，給牠一個新造型。你想做出什麼樣的角色呢？'],
    ],
    snapshot: { ws: DANCING_CAT, code: DANCING_CAT_CODE, summary: DANCING_CAT_SUMMARY },
    events: [
      ['student_message', {}, 30],
      ['block_change', {}, 28],
      ['run', {}, 26],
      ['objective_complete', { objectiveId: 'animation' }, 20],
    ],
  },
  {
    displayName: '黃柏睿',
    lastActive: minsAgo(35), // offline
    profile: '柏睿習慣以短時間衝刺方式學習，明確的目標對他幫助很大。他已完成第一個動畫任務，對於慶祝式的回饋反應很好。任務保持小而精。',
    completed: ['animation'],
    interventions: 1,
    chat: [
      ['user', '我做完跳舞的貓了'],
      ['assistant', '太厲害了，柏睿！🎉 第一個目標完成。準備好新挑戰了嗎？我們來試試用 **移到** 積木和 **重複** 迴圈，讓貓咪追著滑鼠指標跑。'],
    ],
    snapshot: { ws: DANCING_CAT, code: DANCING_CAT_CODE, summary: DANCING_CAT_SUMMARY },
    events: [
      ['student_message', {}, 40],
      ['run', {}, 38],
      ['objective_complete', { objectiveId: 'animation' }, 36],
    ],
  },
  {
    displayName: '李艾雅',
    lastActive: minsAgo(120), // offline, new
    profile: '',
    completed: [],
    interventions: 0,
    chat: [['user', '你好']],
    snapshot: null,
    events: [['student_message', {}, 118]],
  },
];

const OBJECTIVES = [
  { title: '讓貓咪跳舞', description: '用迴圈、動作積木和造型變化讓你的角色動起來。', checkKey: 'animation' },
  { title: '貓捉老鼠', description: '用動作和偵測積木讓貓咪追著滑鼠指標跑。', checkKey: 'cat-mouse' },
  { title: '製作問答遊戲', description: '提出問題、等待回答，並用「如果…那麼」邏輯回應。', checkKey: 'quiz' },
  { title: '彈跳球（Pong）', description: '讓球持續移動，並從舞台邊緣反彈。', checkKey: 'pong' },
];

async function main() {
  const existing = await prisma.teacher.findUnique({ where: { email: TEACHER.email } });
  if (existing) {
    await prisma.teacher.delete({ where: { id: existing.id } });
    console.log('Removed previous demo teacher.');
  }

  const teacher = await prisma.teacher.create({
    data: {
      email: TEACHER.email,
      name: TEACHER.name,
      passwordHash: await bcrypt.hash(TEACHER.password, 10),
    },
  });

  const klass = await prisma.class.create({
    data: { name: CLASS_NAME, joinCode: JOIN_CODE, teacherId: teacher.id },
  });

  const objIdByKey = {};
  for (let i = 0; i < OBJECTIVES.length; i++) {
    const o = OBJECTIVES[i];
    const row = await prisma.objective.create({ data: { ...o, order: i, classId: klass.id } });
    objIdByKey[o.checkKey] = row.id;
  }

  for (const s of STUDENTS) {
    const student = await prisma.student.create({
      data: {
        displayName: s.displayName,
        clientToken: `demo-${Math.random().toString(36).slice(2, 12)}`,
        classId: klass.id,
        profile: s.profile,
        profileUpdatedAt: s.profile ? minsAgo(10) : null,
      },
    });

    const messages = s.chat.map(([role, content]) => ({ role, content }));
    const session = await prisma.session.create({
      data: {
        title: `${s.displayName}`,
        lang: 'zh',
        mode: 'task',
        objectiveId: objIdByKey['animation'] ?? null,
        messages,
        studentId: student.id,
        classId: klass.id,
        lastActiveAt: s.lastActive,
        updatedAt: s.lastActive,
      },
    });

    if (s.snapshot) {
      await prisma.blocklySnapshot.create({
        data: {
          sessionId: session.id,
          workspaceJson: s.snapshot.ws,
          generatedCode: s.snapshot.code,
          blockSummary: s.snapshot.summary,
        },
      });
    }

    for (const [type, payload, mAgo] of s.events) {
      const ev = { ...payload };
      if (type === 'objective_complete' && ev.objectiveId && objIdByKey[ev.objectiveId]) {
        ev.objectiveId = objIdByKey[ev.objectiveId];
      }
      await prisma.activityEvent.create({
        data: { sessionId: session.id, type, payload: ev, createdAt: minsAgo(mAgo) },
      });
    }

    const rows = s.interventionRows ?? [];
    for (let i = 0; i < (s.interventions ?? 0); i++) {
      const r = rows[i] ?? { patternId: 'proactive', message: '需要幫忙嗎？試著執行程式看看會發生什麼事。', outcome: 'helped' };
      await prisma.intervention.create({
        data: {
          sessionId: session.id,
          patternId: r.patternId,
          message: r.message,
          outcome: r.outcome,
          createdAt: minsAgo(15 - i * 3),
        },
      });
    }
  }

  console.log('\n✅ Seed complete.');
  console.log(`   Teacher login : ${TEACHER.email} / ${TEACHER.password}`);
  console.log(`   Class         : ${CLASS_NAME}`);
  console.log(`   Join code     : ${JOIN_CODE}`);
  console.log(`   Students      : ${STUDENTS.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
