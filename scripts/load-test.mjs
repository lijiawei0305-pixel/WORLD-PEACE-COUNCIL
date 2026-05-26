// 并发压测：N 个 game 同时调用云端 generate-events，测延迟分布、成功率、aiSource 命中率、输出质量。
// 完整链路：登录 → createGame×N（并发）→ generateEvents×N（并发）→ 汇总。
// 用完后请勿用于持续压测，每次会在 Supabase 留下 N 个 ACTIVE 游戏行。

import fs from 'node:fs';

const CONCURRENCY = Number(process.argv[2] ?? 5);

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

console.log(`[config] SUPABASE_URL=${SUPABASE_URL}`);
console.log(`[config] CONCURRENCY=${CONCURRENCY}`);
console.log('');

// ============= 1. 登录 =============
console.log('[step 1] 登录 playtest 账号');
const t0 = Date.now();
const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const loginJson = await loginRes.json();
if (!loginJson.access_token) {
  console.error('登录失败:', loginJson);
  process.exit(1);
}
const TOKEN = loginJson.access_token;
console.log(`✓ 登录成功 (${Date.now() - t0}ms)`);
console.log('');

const baseHeaders = {
  'Authorization': `Bearer ${TOKEN}`,
  'apikey': ANON,
  'Content-Type': 'application/json',
};

// ============= 2. 并发 createGame =============
console.log(`[step 2] 并发创建 ${CONCURRENCY} 个 game`);
const tCreateStart = Date.now();
const createPromises = Array.from({ length: CONCURRENCY }, async (_, i) => {
  const start = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-game`, {
      method: 'POST', headers: baseHeaders, body: '{}',
    });
    const json = await res.json();
    return { i, ok: json.ok === true, status: res.status, ms: Date.now() - start, gameId: json?.data?.game?.id, raw: json };
  } catch (e) {
    return { i, ok: false, error: String(e), ms: Date.now() - start };
  }
});
const created = await Promise.all(createPromises);
const tCreateTotal = Date.now() - tCreateStart;
const createSuccess = created.filter((x) => x.ok);
console.log(`完成: ${createSuccess.length}/${CONCURRENCY} 成功，wall=${tCreateTotal}ms`);
created.forEach((x) => {
  if (x.ok) console.log(`  [${x.i}] ✓ ${x.ms}ms  gameId=${x.gameId.slice(0, 8)}…`);
  else      console.log(`  [${x.i}] ✗ ${x.ms}ms  status=${x.status}  err=${JSON.stringify(x.raw ?? x.error).slice(0, 200)}`);
});
console.log('');

if (createSuccess.length === 0) {
  console.error('createGame 全部失败，终止压测');
  process.exit(1);
}

// ============= 3. 并发 generate-events =============
console.log(`[step 3] 并发生成 events × ${createSuccess.length}（这步真打 SiliconFlow）`);
const tGenStart = Date.now();
const genPromises = createSuccess.map(async ({ i, gameId }) => {
  const start = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-events`, {
      method: 'POST', headers: baseHeaders,
      body: JSON.stringify({ gameId, roundNumber: 1 }),
    });
    const json = await res.json();
    return { i, gameId, ok: json.ok === true, status: res.status, ms: Date.now() - start, data: json?.data, raw: json };
  } catch (e) {
    return { i, gameId, ok: false, error: String(e), ms: Date.now() - start };
  }
});
const generated = await Promise.all(genPromises);
const tGenTotal = Date.now() - tGenStart;
console.log('');

// ============= 4. 延迟统计 =============
const okCalls = generated.filter((x) => x.ok);
const failCalls = generated.filter((x) => !x.ok);
const latencies = okCalls.map((x) => x.ms).sort((a, b) => a - b);
const p = (q) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? null;

console.log('====================================');
console.log('[报告] 延迟与成功率');
console.log('====================================');
console.log(`并发数:           ${CONCURRENCY}`);
console.log(`生成成功:         ${okCalls.length}/${generated.length}`);
console.log(`总耗时（wall）:   ${tGenTotal}ms`);
console.log(`理想顺序耗时:     ≈ ${latencies.reduce((s, x) => s + x, 0)}ms`);
console.log(`并发节省:         ≈ ${latencies.reduce((s, x) => s + x, 0) - tGenTotal}ms`);
if (latencies.length > 0) {
  console.log(`min/p50/p90/max:  ${latencies[0]} / ${p(0.5)} / ${p(0.9)} / ${latencies[latencies.length - 1]} ms`);
}

const aiSourceCounts = {};
okCalls.forEach((c) => { aiSourceCounts[c.data?.aiSource] = (aiSourceCounts[c.data?.aiSource] ?? 0) + 1; });
console.log(`aiSource 分布:    ${JSON.stringify(aiSourceCounts)}`);
if (failCalls.length > 0) {
  console.log(`\n失败明细:`);
  failCalls.forEach((c) => {
    console.log(`  [${c.i}] status=${c.status} ms=${c.ms} err=${JSON.stringify(c.raw ?? c.error).slice(0, 300)}`);
  });
}

// ============= 5. 输出质量样本 =============
console.log('');
console.log('====================================');
console.log('[报告] 输出质量与多样性');
console.log('====================================');
const allEvents = [];
okCalls.forEach((c, idx) => {
  const evs = c.data?.events ?? [];
  console.log(`\n--- Game #${c.i} (gameId=${c.gameId.slice(0, 8)}…, ${c.ms}ms, aiSource=${c.data?.aiSource}) ---`);
  console.log(`  priorityIssue: ${c.data?.priorityIssue}`);
  console.log(`  briefing: ${c.data?.roundBriefing}`);
  evs.forEach((e, k) => {
    console.log(`  [${k}] ${e.title} | ${e.type}/${e.severity} | impact=${JSON.stringify(e.potentialImpact)}`);
    console.log(`        涉及: ${(e.involvedAlliances ?? []).join(',')}`);
    allEvents.push(e);
  });
});

console.log('');
console.log('====================================');
console.log('[报告] 跨 game 多样性指标');
console.log('====================================');
const titles = allEvents.map((e) => e.title);
const titleCounts = {};
titles.forEach((t) => { titleCounts[t] = (titleCounts[t] ?? 0) + 1; });
const dupTitles = Object.entries(titleCounts).filter(([_, n]) => n > 1);
console.log(`总事件数: ${allEvents.length}`);
console.log(`唯一标题数: ${new Set(titles).size}`);
console.log(`重复标题: ${dupTitles.length === 0 ? '无' : dupTitles.map(([t, n]) => `${t}×${n}`).join('; ')}`);

const typeDist = {};
allEvents.forEach((e) => { typeDist[e.type] = (typeDist[e.type] ?? 0) + 1; });
console.log(`事件 type 分布: ${JSON.stringify(typeDist)}`);

const sevDist = {};
allEvents.forEach((e) => { sevDist[e.severity] = (sevDist[e.severity] ?? 0) + 1; });
console.log(`severity 分布: ${JSON.stringify(sevDist)}`);

const allianceMentions = {};
allEvents.forEach((e) => {
  (e.involvedAlliances ?? []).forEach((a) => { allianceMentions[a] = (allianceMentions[a] ?? 0) + 1; });
});
console.log(`联盟出现频率: ${JSON.stringify(allianceMentions)}`);

console.log('');
console.log(`[完成] 留下 ${createSuccess.length} 个 ACTIVE game 在云端，可以保留作演示，也可以登录 dashboard 删除`);
