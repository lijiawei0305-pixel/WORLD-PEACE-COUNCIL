// 验证 history_summary 滑窗：玩 6 回合，确认每回合都加 1 条、最终只保留最近 5 条
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

const { execSync } = await import('node:child_process');
const SERVICE_KEY = execSync(`npx supabase projects api-keys --project-ref qjpmsqynwyxtdpvparrm`)
  .toString().split('\n').find(l => l.includes('service_role')).split(/\s+/)[3];

let TOKEN = '';
const headers = () => ({ Authorization: `Bearer ${TOKEN}`, apikey: ANON, 'Content-Type': 'application/json' });

async function api(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST', headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : '{}',
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`${name}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data;
}

async function getHistory(gameId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/game_sessions?id=eq.${gameId}&select=history_summary`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } },
  );
  const arr = await r.json();
  return arr[0]?.history_summary ?? '';
}

const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
TOKEN = (await r.json()).access_token;

console.log('[1] 创建新游戏');
const game = await api('create-game');
const gameId = game.game.id;
console.log(`    gameId = ${gameId}\n`);

const proposals = [
  '@中华联盟 @北美·西方联盟 召开军事透明峰会，建立军事热线和观察员名单。',
  '@俄罗斯联邦 @中东·和平联盟 谈判能源走廊安全和供应链中立担保机制。',
  '@非洲团结联盟 @拉美·南美联盟 设立粮食价格缓冲基金和人道援助通道。',
  '@东南亚联盟 @中华联盟 推动 AI 治理多边对话与算法透明审查。',
  '@俄罗斯联邦 @北美·西方联盟 建立网络空间行为规范联合调查机制。',
  '@中东·和平联盟 @非洲团结联盟 协调难民人道走廊与重建联合项目。',
];

let nextRoundNum = 1;
for (let i = 0; i < 6; i++) {
  const round = nextRoundNum;
  console.log(`--- Round ${round} ---`);

  await api('generate-events', { gameId, roundNumber: round });
  await api('advance-stage', { gameId });
  await api('advance-stage', { gameId });
  await api('submit-proposal', { gameId, roundNumber: round, proposalText: proposals[i] });
  await api('settle-round', { gameId, roundNumber: round });

  const hs = await getHistory(gameId);
  const lines = hs.split('\n').filter(Boolean);
  console.log(`    history_summary 行数: ${lines.length}`);
  console.log(`    每行预览:`);
  lines.forEach((line, idx) => console.log(`      [${idx}] ${line.slice(0, 70)}...`));

  const next = await api('next-round', { gameId }).catch(() => null);
  if (!next) {
    console.log(`    next-round 失败（可能游戏已结束或到达最大回合）`);
    break;
  }
  nextRoundNum = next.game.currentRound;
  console.log('');
}

console.log('\n=== 滑窗验证 ===');
const finalHistory = await getHistory(gameId);
const finalLines = finalHistory.split('\n').filter(Boolean);
console.log(`最终行数: ${finalLines.length} （期望 5，第 1 回合应被滑出）`);
console.log(`总字符数: ${finalHistory.length}`);
console.log();
console.log('完整内容:');
console.log(finalHistory);
console.log();
const firstLineRound = finalLines[0]?.match(/第(\d+)回合/)?.[1];
const lastLineRound = finalLines[finalLines.length - 1]?.match(/第(\d+)回合/)?.[1];
console.log(`第一行回合号: ${firstLineRound} （期望 2）`);
console.log(`最后一行回合号: ${lastLineRound} （期望 6）`);

if (finalLines.length === 5 && firstLineRound === '2' && lastLineRound === '6') {
  console.log('\n✅ 滑窗逻辑正确：保留最近 5 条，第 1 回合已滑出');
} else {
  console.log('\n❌ 滑窗逻辑异常，请检查');
}
