# 世界和平理事会 World Peace Council

一个基于 `Vite + React + TypeScript + globe.gl + Three.js` 的全球外交策略游戏原型。

玩家扮演“首席秩序架构师”，不是世界统治者，也不能直接命令任何联盟。每回合，世界会生成新的危机事件；玩家需要提交一项外交提案，协调七大联盟的利益、诉求和底线。AI 负责模拟联盟反应，后端规则引擎负责结算世界指标、联盟满意度和胜负状态。

当前项目不是 Next.js 项目，不使用 `app/api`。前端是 Vite，后端使用 Supabase Postgres + Supabase Edge Functions。

## 核心玩法

一局游戏最多 20 回合。

每回合按以下阶段推进：

1. `RANDOM_EVENT`：生成 3-5 个随机世界事件。
2. `SITUATION_OVERVIEW`：查看本回合风险、联盟诉求和世界指标变化。
3. `DIPLOMATIC_PROPOSAL`：玩家提交外交提案，例如协调军事热线、能源安全会谈、AI 风险核查。
4. `AI_ADJUDICATION`：AI 判断各联盟对提案的态度。
5. `ROUND_SETTLEMENT`：后端规则引擎结算世界指标、事件状态和联盟满意度。

胜负条件：

- `globalTension >= 100`：游戏失败，世界秩序崩溃。
- 第 20 回合后 `peaceAgreement >= 60`：达成和平框架，游戏胜利。
- 第 20 回合后未失败但 `peaceAgreement < 60`：进入冷和平结局。

## 世界指标

后端持久化并结算以下世界状态，所有数值限制在 `0-100`：

- `globalTension`：全球紧张度
- `worldStability`：世界稳定度
- `aiRisk`：AI 风险指数
- `economicPressure`：经济压力
- `humanitarianCrisis`：人道危机
- `peaceAgreement`：和平协议进度

初始值：

```text
globalTension = 60
worldStability = 65
aiRisk = 35
economicPressure = 40
humanitarianCrisis = 30
peaceAgreement = 20
```

## 七大联盟

游戏中的七大联盟：

- 北美·西方联盟
- 中华联盟
- 俄罗斯联邦
- 中东·和平联盟
- 非洲团结联盟
- 拉美·南美联盟
- 东南亚联盟

每个联盟有独立性格、核心诉求、红线、当前立场、满意度和压力标签。AI 可以让联盟接受、有条件接受、观望、担忧或拒绝玩家提案；AI 不能直接写数据库。

## 当前实现状态

已完成：

- Vite + React + TypeScript 前端视觉原型
- `globe.gl` 3D 地球、阵营区域、外交弧线、城市节点和 HUD
- Supabase Postgres 数据库 schema
- Supabase Edge Functions 后端 API
- Zod API Contract 和 AI 输出校验
- 真实 AI API 调用与 fallback
- 后端规则引擎
- 创建游戏、生成事件、推进阶段、提交提案、AI 裁定、回合结算、进入下一回合
- 国家/城市到联盟映射 API
- 前端 API Client：`src/lib/apiClient.ts`

仍待接入：

- 当前浏览器 UI 主要还是视觉和交互壳，尚未把 HUD 按钮完整接入 `apiClient`。
- 后端 MVP 闭环已经可以通过 API 跑通；要在浏览器里点按钮完整玩一局，需要继续接入前端状态流。

## 技术栈

前端：

- Vite
- React 19
- TypeScript
- globe.gl
- Three.js
- lil-gui

后端：

- Supabase Postgres
- Supabase Edge Functions
- Supabase Auth
- Zod
- OpenAI-compatible Chat Completions API

## 项目结构

```text
src/
  App.tsx
  contracts/
    game.ts
  lib/
    apiClient.ts
    gameSchemas.ts
  components/
    globe/
      DiplomacyGlobe.tsx
      earthRim.ts
      globeArcStyle.ts
      globeCountryStyle.ts
      globeEffects.ts
    hud/
      TopBar.tsx
      LeftPanels.tsx
      RightPanels.tsx
      BottomCommandPanel.tsx
      AllianceList.tsx
      EventList.tsx
      MetricBar.tsx
      StageStepper.tsx
  data/
    worldPeaceCouncil.ts
    demoCountryState.ts
    demoDiplomacyArcs.ts
    factions.ts
  styles/
    app.css
    globe.css
    hud.css
    wpc.css

supabase/
  config.toml
  migrations/
    001_world_peace_council_schema.sql
  functions/
    create-game/
    get-game-state/
    generate-events/
    advance-stage/
    submit-proposal/
    settle-round/
    next-round/
    alliance-map/
    _shared/
      aiClient.ts
      aiPrompts.ts
      aiSchemas.ts
      cors.ts
      gameConstants.ts
      response.ts
      ruleEngine.ts
      supabaseClient.ts
      types.ts
```

## 环境变量

前端 `.env.local`：

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key>
```

连接云端 Supabase 时，前端 `.env.local` 改为云端项目地址和 anon key：

```bash
VITE_SUPABASE_URL=https://qjpmsqynwyxtdpvparrm.supabase.co
VITE_SUPABASE_ANON_KEY=<cloud-anon-key>
VITE_PLAYTEST_EMAIL=<dev-playtest-email>
VITE_PLAYTEST_PASSWORD=<dev-only-password>
```

Edge Functions `supabase/.env.local`：

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>

AI_MOCK_MODE=false
AI_BASE_URL=<openai-compatible-base-url>
AI_API_KEY=<server-side-ai-api-key>
AI_MODEL=gpt-5.4-mini
AI_REASONING_EFFORT=minimal
AI_REQUEST_TIMEOUT_MS=15000
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173
```

注意：

- `AI_API_KEY` 只能放在 `supabase/.env.local`，不能放进前端 `.env.local`。
- 前端只使用 Supabase anon key 和用户登录 session token。
- `SUPABASE_SERVICE_ROLE_KEY` 只能给 Edge Functions 使用，不能放进任何 `VITE_` 前端环境变量。
- `AI_MOCK_MODE` 默认值：**true（mock 模式）**。不配置时所有 AI 调用返回 fallback 数据。
- 设置 `AI_MOCK_MODE=false` 并配置 `AI_API_KEY` 才会调用真实 LLM。
- 响应中的 `aiSource` 字段标注每次调用是 `mock` / `live` / `fallback`。
- `ALLOWED_ORIGINS` 是 Edge Functions 的浏览器 CORS 白名单，必须精确匹配浏览器地址栏里的 origin；`http://localhost:5173` 和 `http://127.0.0.1:5173` 是两个不同 origin。
- 本地 Vite dev server 在 `localhost` / `127.0.0.1` 下会把前端请求代理到 `/supabase`，但 Vite preview、生产构建或直接访问云端 Edge Functions 时仍依赖 `ALLOWED_ORIGINS`。

## 本地运行

安装依赖：

```bash
npm install
```

启动 Docker Desktop 后，启动 Supabase：

```bash
npx supabase start
npx supabase db reset
```

查看本地 Supabase key：

```bash
npx supabase status -o env
```

启动 Edge Functions：

```bash
npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local
```

启动前端：

```bash
npm run dev
```

默认访问：

```text
http://127.0.0.1:5173/
```

Supabase Studio：

```text
http://127.0.0.1:54323
```

## Supabase 连接排查

如果浏览器里出现“无法连接云端 Supabase（xxx.supabase.co）。请检查网络或代理设置”，先区分三类问题：

- 本地前端服务没启动：`http://127.0.0.1:5173/` 无法打开时，重新运行 `npm run dev`。
- 云端项目不可达：用 `curl -I https://qjpmsqynwyxtdpvparrm.supabase.co/auth/v1/settings` 检查 DNS、TLS 和 Supabase 网关是否可达；返回 401 也说明域名是通的。
- CORS 被浏览器拦截：Edge Function 的 OPTIONS 响应如果没有 `Access-Control-Allow-Origin`，浏览器会把请求报成 `Failed to fetch`。此时需要在 Supabase Dashboard 的 Edge Function secrets 里配置 `ALLOWED_ORIGINS`，包含当前前端 origin，例如 `http://127.0.0.1:5173`、`http://localhost:5173`、preview 域名和生产域名。

云端部署时，配置完成后需要重新部署或重启 Edge Functions，让新的环境变量生效。

## 本地测试用户

可以在 Supabase Studio 的 `Authentication -> Users` 中创建测试用户，也可以通过 Auth API 注册。

示例：

```text
playtest@example.com
playtest123
```

## 后端 API

Edge Functions：

- `create-game`：创建新游戏。
- `get-game-state`：读取当前游戏快照。
- `generate-events`：生成或读取当前回合事件。
- `advance-stage`：推进允许的阶段。
- `submit-proposal`：保存玩家外交提案并调用 AI 裁定。
- `settle-round`：规则引擎结算回合。
- `next-round`：进入下一回合。
- `alliance-map`：公开读取国家/城市到联盟映射。

前端统一通过：

```text
src/lib/apiClient.ts
```

调用这些函数。

## 数据库表

核心表：

- `profiles`
- `game_sessions`
- `alliances`
- `game_alliance_states`
- `rounds`
- `round_events`
- `proposals`
- `ai_adjudications`
- `settlements`
- `country_alliance_map`

RLS 规则：

- `alliances` 和 `country_alliance_map` 可公开读。
- 游戏相关表只允许用户读取自己的游戏。
- 业务写入由 Edge Functions 使用 service role 执行。

## 构建

```bash
npm run build
```

当前 `build` 会先执行 TypeScript 项目检查，再执行 Vite 生产构建。

## 生产部署清单

上线前请逐项确认：

- [ ] 设置 `VITE_PLAYTEST_PASSWORD` 为空或删除，使用真实 Auth UI
- [ ] `AI_MOCK_MODE` 设为 `false`
- [ ] `AI_API_KEY` 通过密钥管理服务（如 Vault）注入，不在环境变量文件里明文存储
- [ ] CORS 白名单：在 Edge Functions 的 `ALLOWED_ORIGINS` 环境变量里配置生产域名、preview 域名以及需要保留的本地调试 origin（逗号分隔）；origin 不在白名单时 Edge Function 不返回 `Access-Control-Allow-Origin` header，浏览器会严格拒绝
- [ ] Supabase Auth 开启邮箱验证
- [ ] 执行所有 migration（001 到 006）

## 开发原则

- 不迁移 Next.js。
- 不创建 `app/api`。
- 不替换 `globe.gl`。
- 不在前端暴露 AI key。
- AI 只能给出结构化裁定，不能直接修改数据库。
- 世界指标变化必须经过后端规则引擎 clamp。
- 复杂功能优先让位于 MVP 回合闭环。

## 下一步

最关键的下一步是把当前 HUD 接入 `src/lib/apiClient.ts`：

```text
createGame
generateEvents
advanceStage
submitProposal
settleRound
nextRound
getGameState
```

完成后，玩家就可以直接在浏览器中创建游戏、阅读事件、提交外交提案、查看 AI 裁定和进入下一回合。
