-- 006_ai_observability.sql
-- 给 ai_adjudications 表加观测字段：
--   duration_ms     int   该次 AI 调用耗时（包含网络 + 等待解析）；mock/fallback 仍写实际耗时
--   prompt_version  text  prompt 模板版本（来自 aiPrompts.ts 的 PROMPT_VERSION 常量），便于事后追溯
-- 用 add column if not exists 保证幂等。
-- 不加 NOT NULL，因为已有历史行（reset 后无）+ 兜底安全。

alter table public.ai_adjudications
  add column if not exists duration_ms int;

alter table public.ai_adjudications
  add column if not exists prompt_version text;

-- 可选索引：如果未来要按 prompt_version 切片观测调用统计，可以打开下面这条。
-- 暂不创建，避免无意义索引膨胀。
-- create index if not exists ai_adjudications_prompt_version_idx
--   on public.ai_adjudications (prompt_version);
