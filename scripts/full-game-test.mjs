// 20 回合完整实战：模拟"和平建造者"策略，目标推动 peaceAgreement >= 60。
// 每回合提案覆盖 4-5 个联盟（轮流避免遗忘），动作多样（谈判 / 调查 / 联合项目 / 援助 / 紧急峰会），
// 让 AI 跨回合记忆能积累正面历史。
//
// 全程预计 8-15 分钟（每回合 2 次 AI live + 数据库往返）。
// 终止条件：game.status 转出 ACTIVE，或推满 20 回合。

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
const headers = () => ({ Authorization: `Bearer ${TOKEN}`, apikey: ANON, 'Content-Type': 'application/json' });

async function api(name, body) {
  // 每个 API 60s 超时；偶发网络抖动重试 1 次。
  const attempt = async () => {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), 60_000);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST', headers: headers(), signal: ctrl.signal,
        body: body !== undefined ? JSON.stringify(body) : '{}',
      });
      const j = await res.json();
      const ms = Date.now() - t0;
      if (!j.ok) throw new Error(`${name} (${ms}ms): ${JSON.stringify(j).slice(0, 300)}`);
      return { data: j.data, ms };
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    return await attempt();
  } catch (err) {
    console.log(`  ⚠ ${name} 第 1 次失败：${err.message}，重试`);
    return await attempt();
  }
}

// 七大联盟轮转 + 紧急议题响应
const ALLIANCES = ['北美·西方联盟', '中华联盟', '俄罗斯联邦', '中东·和平联盟', '非洲团结联盟', '拉美·南美联盟', '东南亚联盟'];

// 每回合的"主推"组合：保证 5 回合内每个联盟至少被点名 3 次
function buildProposalForRound(round, currentEvents, allianceLastReactions) {
  const eventAlliances = [...new Set(currentEvents.flatMap(e => e.involvedAlliances))];
  // 把 eventAlliances ID 映射到中文名
  const idToName = {
    north_west: '北美·西方联盟', china: '中华联盟', russia: '俄罗斯联邦',
    middle_east: '中东·和平联盟', africa: '非洲团结联盟',
    latin_america: '拉美·南美联盟', southeast_asia: '东南亚联盟',
  };
  const eventAllianceNames = eventAlliances.map(id => idToName[id]).filter(Boolean);

  // 找最近反应最差的联盟（满意度低 / 上回合 CONCERNED/REJECT），优先抚慰
  const neglected = allianceLastReactions
    .filter(a => /拒绝|担忧|警惕/.test(a.stance) || a.satisfaction < 50)
    .map(a => idToName[a.allianceId])
    .filter(Boolean);

  const target = [...new Set([...eventAllianceNames, ...neglected])].slice(0, 5);
  // 确保至少 4 个联盟被点名
  while (target.length < 4) {
    const candidate = ALLIANCES[(round + target.length) % ALLIANCES.length];
    if (!target.includes(candidate)) target.push(candidate);
  }

  const tags = target.map(n => `@${n}`).join(' ');

  const themes = [
    '召开军事透明峰会，建立军事热线、交换观察员名单',
    '举行能源走廊安全会谈，制定中立担保和应急修复机制',
    '设立粮食价格缓冲基金和人道援助快速通道',
    '推动 AI 治理多边对话与算法透明审查框架',
    '建立网络空间行为规范联合调查机制',
    '协调难民人道走廊与重建联合项目',
    '召开紧急峰会调解资源争端，引入第三方观察员',
    '推动多边贸易缓冲安排，缓解经济压力',
  ];
  const action = themes[round % themes.length];

  return `${tags} ${action}，并由各方共同推进核查机制与阶段性援助。`;
}

console.log('============================================');
console.log('20 回合完整实战 — 和平建造者策略');
console.log('============================================\n');

const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
TOKEN = (await r.json()).access_token;
console.log('✓ 登录\n');

const game0 = await api('create-game');
const gameId = game0.data.game.id;
console.log(`gameId = ${gameId}`);
console.log(`初始 worldState =`, game0.data.worldState);
console.log();

const trajectory = [];
const totalStart = Date.now();

let round = 1;
let lastSettlement = null;

for (round = 1; round <= 20; round++) {
  const roundStart = Date.now();
  console.log(`━━━━━━━━━━━━━━━ Round ${round} / 20 ━━━━━━━━━━━━━━━`);

  // 1. 生成事件
  const ev = await api('generate-events', { gameId, roundNumber: round });
  const eventTitles = ev.data.events.map(e => `${e.title}(${e.type}/${e.severity})`).join(', ');
  console.log(`  events: ${eventTitles}`);

  // 2. advance × 2 → DIPLOMATIC_PROPOSAL
  await api('advance-stage', { gameId });
  await api('advance-stage', { gameId });

  // 3. 提交提案（基于当前事件 + 联盟状态构造）
  const stateRes = await api('get-game-state', { gameId });
  const proposal = buildProposalForRound(round, ev.data.events, stateRes.data.alliances);
  console.log(`  提案: ${proposal.slice(0, 80)}...`);
  const sub = await api('submit-proposal', { gameId, roundNumber: round, proposalText: proposal });
  const reactions = sub.data.adjudication.allianceReactions
    .map(r => `${r.alliance}=${r.attitude}`).join(' ');
  console.log(`  反应: ${reactions}`);
  console.log(`  AI 评估: ${sub.data.adjudication.aiAssessment.summary.slice(0, 80)}...`);

  // 4. 结算
  const set = await api('settle-round', { gameId, roundNumber: round });
  const settlement = set.data.settlement;
  lastSettlement = settlement;
  const ws = settlement.newWorldState;
  console.log(`  结算: tension=${ws.globalTension} stability=${ws.worldStability} peace=${ws.peaceAgreement} aiRisk=${ws.aiRisk} ` +
              `economic=${ws.economicPressure} humanitarian=${ws.humanitarianCrisis}`);
  console.log(`  rating=${settlement.rating} (${settlement.ratingText})  status=${settlement.gameStatus}`);
  trajectory.push({
    round,
    worldState: { ...ws },
    rating: settlement.rating,
    ratingText: settlement.ratingText,
    status: settlement.gameStatus,
    roundMs: Date.now() - roundStart,
  });

  // 5. 检查终止
  if (settlement.gameStatus !== 'ACTIVE') {
    console.log(`\n🎯 游戏在第 ${round} 回合结束: ${settlement.gameStatus}`);
    break;
  }

  if (round >= 20) {
    console.log(`\n已达最大回合数 20`);
    break;
  }

  // 6. next-round
  await api('next-round', { gameId });
  console.log();
}

const totalMs = Date.now() - totalStart;
console.log('\n============================================');
console.log(`实战完成  总耗时: ${(totalMs / 1000).toFixed(1)}s`);
console.log('============================================\n');

// 拉取最终 game 状态
const finalState = await api('get-game-state', { gameId });
console.log(`最终游戏 status: ${finalState.data.game.status}`);
console.log(`最终回合: ${finalState.data.game.currentRound}`);
console.log(`最终 worldState:`, finalState.data.worldState);
console.log();

// 轨迹简报
console.log('worldState 轨迹（每回合）:');
console.log('Round | tension | stability | peace | aiRisk | economic | humanitarian | rating | status');
console.log('------|---------|-----------|-------|--------|----------|--------------|--------|--------');
trajectory.forEach(t => {
  const w = t.worldState;
  console.log(`  ${String(t.round).padStart(2)}  | ${String(w.globalTension).padStart(7)} | ${String(w.worldStability).padStart(9)} | ${String(w.peaceAgreement).padStart(5)} | ${String(w.aiRisk).padStart(6)} | ${String(w.economicPressure).padStart(8)} | ${String(w.humanitarianCrisis).padStart(12)} | ${String(t.rating).padStart(6)} | ${t.status}`);
});

console.log();
const finalStatus = finalState.data.game.status;
if (finalStatus === 'WON') {
  console.log('🏆 WON: 和平协议达成，peaceAgreement >=', finalState.data.worldState.peaceAgreement);
} else if (finalStatus === 'FAILED') {
  console.log('💀 FAILED: 全球紧张度突破红线');
} else if (finalStatus === 'COLD_PEACE') {
  console.log('🌫 COLD_PEACE: 20 回合后未达和平阈值');
} else {
  console.log(`⏸ 终止状态 = ${finalStatus}`);
}

// 落盘轨迹便于复盘
const out = {
  gameId, totalMs, finalStatus,
  finalWorldState: finalState.data.worldState,
  trajectory,
};
fs.writeFileSync('.runtime/full-game-trajectory.json', JSON.stringify(out, null, 2));
console.log('轨迹已存到 .runtime/full-game-trajectory.json');
