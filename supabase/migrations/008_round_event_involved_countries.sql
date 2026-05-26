-- 008_round_event_involved_countries.sql
--
-- round_events 增加 involved_countries 字段（ISO A3 字符串数组，jsonb 形式与 involved_alliances 保持一致）。
-- 让 AI 在生成事件时给出涉事国家，前端可以在地球上把这些国家高亮发光，玩家能在地图上一眼看到事件位置。
--
-- 兼容性：
--   * 老事件 involved_countries 默认 '[]'，不会破坏既有展示流程。
--   * generate_events_v1 RPC 在本 migration 中扩展为可选参数 p_involved_countries_lookup（jsonb object：title -> string[]）；
--     旧调用方（不传该参数）按空数组写入，不影响功能。

alter table public.round_events
  add column if not exists involved_countries jsonb not null default '[]'::jsonb;

create or replace function public.generate_events_v1(
  p_game_id uuid,
  p_round_id uuid,
  p_events jsonb,
  p_stage text,
  p_briefing text,
  p_priority_issue text,
  p_after_events_world_state jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted_count int;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a jsonb array';
  end if;

  -- 事件数据通过 jsonb_to_recordset 解构。新增 involved_countries 字段（默认 []）。
  with src as (
    select *
    from jsonb_to_recordset(p_events) as r(
      title text,
      type text,
      severity text,
      description text,
      involved_alliances jsonb,
      involved_countries jsonb,
      potential_impact jsonb,
      recommended_actions jsonb,
      unresolved_consequence text
    )
  )
  insert into public.round_events (
    game_id,
    round_id,
    title,
    type,
    severity,
    description,
    involved_alliances,
    involved_countries,
    potential_impact,
    recommended_actions,
    unresolved_consequence,
    resolution_status
  )
  select
    p_game_id,
    p_round_id,
    src.title,
    src.type,
    src.severity,
    src.description,
    coalesce(src.involved_alliances, '[]'::jsonb),
    coalesce(src.involved_countries, '[]'::jsonb),
    coalesce(src.potential_impact, '{}'::jsonb),
    coalesce(src.recommended_actions, '[]'::jsonb),
    src.unresolved_consequence,
    'UNCHANGED'
  from src;

  get diagnostics v_inserted_count = row_count;

  update public.rounds
     set stage                    = p_stage,
         briefing                 = p_briefing,
         priority_issue           = p_priority_issue,
         after_events_world_state = p_after_events_world_state
   where id = p_round_id;

  if not found then
    raise exception 'round % not found', p_round_id;
  end if;

  -- 与 migration 007 保持一致：generate-events 阶段不再立即更新 game_sessions 世界指标。
  update public.game_sessions
     set current_stage = p_stage
   where id = p_game_id;

  if not found then
    raise exception 'game % not found', p_game_id;
  end if;

  return jsonb_build_object('inserted_count', v_inserted_count);
end;
$$;
