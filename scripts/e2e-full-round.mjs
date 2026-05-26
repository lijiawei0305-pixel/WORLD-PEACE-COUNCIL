// E2E：模拟前端按钮完整玩 2 个回合，验证 5 个阶段流转 + 跨回合切换。
// 完全照搬 gameOrchestrator.ts 的状态机调用顺序：
//   RANDOM_EVENT      → generate-events → advance-stage
//   SITUATION_OVERVIEW → advance-stage
//   DIPLOMATIC_PROPOSAL → submit-proposal
//   AI_ADJUDICATION   → settle-round
//   ROUND_SETTLEMENT  → next-round

import fs from 'node:fs';

function loadEnv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv('.env.local');
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const EMAIL = env.VITE_PLAYTEST_EMAIL;
const PASSWORD = env.VITE_PLAYTEST_PASSWORD;

let TOKEN = '';
const headers = () => ({
  'Authorization': `Bearer ${TOKEN}`,
  'apikey': ANON,
  'Content-Type': 'application/json',
});

async function api(name, body, expectStatus = 200) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST', headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : '{}',
  });
  const ms = Date.now() - start;
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _rawText: text }; }
  const ok = json?.ok === true;
  const tag = ok ? '✓' : '✗';
  const aiSrc = json?.data?.aiSource ?? '';
  console.log(`  ${tag} ${name.padEnd(18)} ${ms}ms  HTTP ${res.status}${aiSrc ? `  aiSource=${aiSrc}` : ''}${!ok ? `  err=${JSON.stringify(json).slice(0, 200)}` : ''}`);
  if (!ok) throw new Error(`${name} failed`);
  return json.data;
}

async function login() {
  console.log('[1] 登录');
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('login failed: ' + JSON.stringify(j));
  TOKEN = j.access_token;
  console.log('  ✓ 登录成功');
}

async function playOneRound(gameId, roundNumber) {
  console.log(`\n[Round ${roundNumber}]`);

  // Step 1: 生成事件 (RANDOM_EVENT)
  const ev = await api('generate-events', { gameId, roundNumber });
  console.log(`    事件: ${ev.events.map(e => `${e.title}/${e.type}/${e.severity}`).join(', ')}`);
  console.log(`    worldState 变化: globalTension ${ev.worldState.globalTension}`);

  // Step 2: advance RANDOM_EVENT → SITUATION_OVERVIEW
  await api('advance-stage', { gameId });

  // Step 3: advance SITUATION_OVERVIEW → DIPLOMATIC_PROPOSAL
  await api('advance-stage', { gameId });

  // Step 4: 提交提案（包含 @ 联盟 + 动作关键词）
  const proposal = `@中华联盟 @北美·西方联盟 紧急召开军事透明峰会，建立军事热线、交换观察员名单。同时由 @中东·和平联盟 主持能源走廊安全会谈，制定临时担保机制。`;
  const sub = await api('submit-proposal', { gameId, roundNumber, proposalText: proposal });
  console.log(`    AI 裁定: 成功率 ${sub.adjudication.aiAssessment.successProbability}, ${sub.adjudication.aiAssessment.summary}`);
  console.log(`    点名联盟: ${sub.proposal.mentionedAlliances.join(',')}, 动作: ${sub.proposal.actionTypes.join(',')}`);
  console.log(`    联盟反应: ${sub.adjudication.allianceReactions.map(r => `${r.alliance}=${r.attitude}`).join(', ')}`);

  // Step 5: 结算 AI_ADJUDICATION → ROUND_SETTLEMENT
  const settleData = await api('settle-round', { gameId, roundNumber });
  const settle = settleData.settlement;
  const ws = settle.newWorldState;
  console.log(`    结算后: tension=${ws.globalTension}, stability=${ws.worldStability}, peace=${ws.peaceAgreement}`);
  console.log(`    rating: ${settle.rating} ${settle.ratingText}, gameStatus: ${settle.gameStatus}`);

  // Step 6: 进入下一回合
  if (settle.gameStatus !== 'ACTIVE') {
    console.log(`    游戏结束: ${settle.gameStatus}`);
    return null;
  }
  if (roundNumber >= 20) {
    console.log(`    达到最大回合数`);
    return null;
  }
  const next = await api('next-round', { gameId });
  return next.game.currentRound;
}

async function main() {
  console.log('=== E2E：模拟前端按钮完整玩 2 个回合 ===\n');
  await login();

  console.log('\n[2] 创建新游戏');
  const game = await api('create-game', undefined, 201);
  const gameId = game.game.id;
  console.log(`    gameId = ${gameId}`);
  console.log(`    initial worldState = ${JSON.stringify(game.worldState)}`);

  let nextRoundNum = 1;
  for (let i = 0; i < 3; i++) {
    nextRoundNum = await playOneRound(gameId, nextRoundNum);
    if (!nextRoundNum) break;
  }

  console.log('\n[3] 拉取最终 game state 验证持久化');
  const final = await api('get-game-state', { gameId });
  console.log(`    最终回合: ${final.game.currentRound} / ${final.game.maxRounds}`);
  console.log(`    最终 stage: ${final.game.stage}`);
  console.log(`    最终 worldState: ${JSON.stringify(final.worldState)}`);
  console.log(`    最终 status: ${final.game.status}`);

  console.log('\n[完成] 全链路 5 阶段流转 ✓');
  console.log(`留下游戏 ${gameId}（playtest 账号），可以登录浏览器继续推进或删除。`);
}

main().catch((e) => {
  console.error('\n[失败]', e);
  process.exit(1);
});
