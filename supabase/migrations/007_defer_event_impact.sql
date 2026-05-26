-- 007_defer_event_impact.sql
--
-- 调整 generate_events_v1：事件生成阶段不再立即把"事件聚合影响"应用到 game_sessions 的世界指标。
-- 设计原因：
--   * 玩家在 RANDOM_EVENT / SITUATION_OVERVIEW / DIPLOMATIC_PROPOSAL 阶段看到的顶部
--     全球紧张度等数值，应保持本回合开始时的值（第 1 回合即初始 60），事件只是"潜在威胁"
--     的展示，等到结算阶段（提案 + 事件一并裁定）才统一更新到世界指标。
--   * rounds.after_events_world_state 仍然保留：作为"如果不处理事件，世界会变成什么样"的
--     展示与计算基准，settle-round 在结算时会读取它并叠加 AI 提案影响得到 newWorldState。
--   * 这样 settlements.metric_changes 由结算端基于 starting_world_state ↔ newWorldState 计算的
--     回合总 delta 也能完全覆盖事件 + 提案的合计变化（避免顶部数值与底部 delta 不一致）。
--
-- 兼容性：
--   * RPC 签名保持不变，调用方仍然传 p_after_events_world_state，只是 RPC 内部不再写入
--     game_sessions 的 metric 字段。
--   * 旧版本部署历史游戏：不会回填，但下一次 generate-events 调用按新逻辑执行。

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

  with src as (
    select *
    from jsonb_to_recordset(p_events) as r(
      title text,
      type text,
      severity text,
      description text,
      involved_alliances jsonb,
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

  -- 关键变化：仅更新 current_stage，**不再**把 p_after_events_world_state 的指标
  -- 写入 game_sessions。世界指标由 settle_round_v1 在结算阶段统一更新。
  update public.game_sessions
     set current_stage = p_stage
   where id = p_game_id;

  if not found then
    raise exception 'game % not found', p_game_id;
  end if;

  return jsonb_build_object('inserted_count', v_inserted_count);
end;
$$;
