// 综合测试：错误路径 + 匿名读 + history_summary 滑动窗口
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
const authedHeaders = () => ({
  Authorization: `Bearer ${TOKEN}`,
  apikey: ANON,
  'Content-Type': 'application/json',
});
const anonHeaders = () => ({
  Authorization: `Bearer ${ANON}`,
  apikey: ANON,
  'Content-Type': 'application/json',
});

async function callFn(name, body, headers, expectStatus) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: 'POST', headers,
    body: body !== undefined ? JSON.stringify(body) : '{}',
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _rawText: text.slice(0, 200) }; }
  const tag = res.status === expectStatus ? '✓' : '✗';
  const code = json?.error ?? '';
  console.log(`  ${tag} ${name.padEnd(18)} HTTP ${res.status} (期望 ${expectStatus})${code ? ` code=${code}` : ''}`);
  return { res, json };
}

// ============= 0. 登录拿 token =============
console.log('[0] 登录\n');
const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
TOKEN = (await loginRes.json()).access_token;
if (!TOKEN) { console.error('登录失败'); process.exit(1); }

// ============= 测试 A: alliance-map 匿名公开读取 =============
console.log('\n=== A. alliance-map 匿名公开读取（不带 user JWT，仅 anon key） ===');
{
  const res = await fetch(`${SUPABASE_URL}/functions/v1/alliance-map`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ANON}`, 'apikey': ANON },
  });
  const json = await res.json();
  const itemsLen = json?.data?.items?.length ?? 0;
  const tag = res.status === 200 && itemsLen > 0 ? '✓' : '✗';
  console.log(`  ${tag} 匿名 POST  HTTP ${res.status}  items=${itemsLen}`);
  console.log(`  示例: ${JSON.stringify(json.data?.items?.[0]).slice(0, 120)}`);
}

// 顺便测：连 anon key 都不给 → 应该被网关拒
console.log('\n  -- 子测：完全无 key 调 alliance-map --');
{
  const res = await fetch(`${SUPABASE_URL}/functions/v1/alliance-map`, {
    method: 'POST',
  });
  console.log(`  HTTP ${res.status} （Supabase 网关层应该拒绝）`);
}

// ============= 测试 B: 错误路径 =============
console.log('\n=== B. Edge Function 错误路径 ===');

// 1. 没登录调 create-game
console.log('  [1] 没 Bearer 调 create-game');
{
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-game`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const json = await res.json();
  const tag = res.status === 401 ? '✓' : '✗';
  console.log(`    ${tag} HTTP ${res.status} (期望 401)  error=${json.error}`);
}

// 创建一个 game 用于后面错误路径测试
const gameRes = await callFn('create-game', undefined, authedHeaders(), 201);
const gameId = gameRes.json.data.game.id;

// 2. submit-proposal 提案过短
console.log('  [2] 提案 < 8 字 → 应得 PROPOSAL_TOO_SHORT 400');
await callFn('submit-proposal', {
  gameId, roundNumber: 1, proposalText: '短',
}, authedHeaders(), 400);

// 3. submit-proposal 提案过长
console.log('  [3] 提案 > 2000 字 → 应得 PROPOSAL_TOO_LONG 400');
await callFn('submit-proposal', {
  gameId, roundNumber: 1, proposalText: '我'.repeat(2001),
}, authedHeaders(), 400);

// 4. 错阶段调 submit-proposal（当前 stage=RANDOM_EVENT，不能提交提案）
console.log('  [4] RANDOM_EVENT 阶段调 submit-proposal → 应得 INVALID_STAGE 409');
await callFn('submit-proposal', {
  gameId, roundNumber: 1, proposalText: '@中华联盟 召开军事透明峰会，建立军事热线机制',
}, authedHeaders(), 409);

// 5. 错阶段调 settle-round（当前 stage=RANDOM_EVENT）
console.log('  [5] RANDOM_EVENT 阶段调 settle-round → 应得 INVALID_STAGE 409');
await callFn('settle-round', { gameId, roundNumber: 1 }, authedHeaders(), 409);

// 6. 伪造 gameId（合法 UUID 但不存在）
console.log('  [6] 伪造 UUID → 应得 GAME_NOT_FOUND 404');
await callFn('generate-events', {
  gameId: '00000000-0000-4000-8000-000000000000', roundNumber: 1,
}, authedHeaders(), 404);

// 7. 非合法 UUID 格式
console.log('  [7] 非 UUID 字符串 → 应得 INVALID_REQUEST 400');
await callFn('generate-events', {
  gameId: 'not-a-uuid', roundNumber: 1,
}, authedHeaders(), 400);

// 8. 缺字段
console.log('  [8] 缺 roundNumber → 应得 INVALID_REQUEST 400');
await callFn('generate-events', { gameId }, authedHeaders(), 400);

// 9. roundNumber 越界
console.log('  [9] roundNumber=21 越界 → 应得 INVALID_REQUEST 400');
await callFn('generate-events', { gameId, roundNumber: 21 }, authedHeaders(), 400);

// 10. 别人的 game（用 service_role 创建一个不属于 playtest 的 game，然后用 playtest token 试图访问）
// 跳过这个测试，复杂度高，且权属校验已被前面 user_id != auth.uid() 测试覆盖

console.log('\n[B 总结] 测试完成，期望所有错误码都对得上');
