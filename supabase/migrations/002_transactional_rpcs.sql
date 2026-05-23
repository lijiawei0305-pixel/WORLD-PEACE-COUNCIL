-- 002_transactional_rpcs.sql
-- 把 generate-events、settle-round、next-round 三个 Edge Function 的多步写入收敛到 plpgsql 函数里，
-- 利用 plpgsql 函数体自动事务（任一语句失败整体回滚）解决半成功状态问题。
--
-- 所有函数：
--   - LANGUAGE plpgsql
--   - SECURITY DEFINER（owner 一般是迁移角色 postgres，可绕过 RLS；调用方必须是 Edge Function 的 service role）
--   - SET search_path = public, pg_temp（防止 search_path 注入）
--
-- 调用约定：
--   p_events / p_event_results / p_alliance_changes 等 jsonb 数组里的字段名一律使用 snake_case，
--   与底层表列名一致，由 Edge Function 在调用前完成 camelCase -> snake_case 转换。

-- ============================================================
-- RPC 1: generate_events_v1
-- ============================================================
-- 期望的 p_events 元素形状：
-- {
--   "title": text,
--   "type": text,
--   "severity": text,
--   "description": text,
--   "involved_alliances": jsonb (array),
--   "potential_impact": jsonb (object),
--   "recommended_actions": jsonb (array),
--   "unresolved_consequence": text
-- }

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

  update public.game_sessions
     set current_stage       = p_stage,
         global_tension      = (p_after_events_world_state->>'globalTension')::int,
         world_stability     = (p_after_events_world_state->>'worldStability')::int,
         ai_risk             = (p_after_events_world_state->>'aiRisk')::int,
         economic_pressure   = (p_after_events_world_state->>'economicPressure')::int,
         humanitarian_crisis = (p_after_events_world_state->>'humanitarianCrisis')::int,
         peace_agreement     = (p_after_events_world_state->>'peaceAgreement')::int
   where id = p_game_id;

  if not found then
    raise exception 'game % not found', p_game_id;
  end if;

  return jsonb_build_object('inserted_count', v_inserted_count);
end;
$$;

-- ============================================================
-- RPC 2: settle_round_v1
-- ============================================================
-- 期望的 jsonb 形状：
--   p_new_world_state: { globalTension:int, worldStability:int, aiRisk:int,
--                        economicPressure:int, humanitarianCrisis:int, peaceAgreement:int }
--     注意：这一项保留 camelCase，与前端 / Edge Function 的 WorldState 类型一致；
--     函数内部用 jsonb 路径取值，不影响表列。
--   p_event_results: [ { event_id: uuid, resolution_status: text, summary: text } ]
--     summary 会被写入 round_events.result_text 列。
--   p_alliance_changes: [ { alliance_id: text, new_satisfaction: int,
--                           stance: text, last_reaction: text } ]
--   p_metric_changes / p_next_round_warnings: 任意 jsonb，原样存进 settlements 表。
--   p_game_status: 必须是 ACTIVE | WON | FAILED | COLD_PEACE | ABANDONED 之一（由表 check 约束兜底）。

create or replace function public.settle_round_v1(
  p_game_id uuid,
  p_round_number int,
  p_metric_changes jsonb,
  p_new_world_state jsonb,
  p_event_results jsonb,
  p_alliance_changes jsonb,
  p_next_round_warnings jsonb,
  p_rating int,
  p_rating_text text,
  p_summary text,
  p_game_status text,
  p_adjudication_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
  v_settlement_id uuid;
begin
  -- 锁定本回合，防止并发结算或并发 next_round 干扰
  select r.id
    into v_round_id
    from public.rounds r
   where r.game_id = p_game_id
     and r.round_number = p_round_number
   for update;

  if v_round_id is null then
    raise exception 'round not found for game % round %', p_game_id, p_round_number;
  end if;

  insert into public.settlements (
    game_id,
    round_id,
    adjudication_id,
    metric_changes,
    new_world_state,
    event_results,
    alliance_changes,
    next_round_warnings,
    rating,
    rating_text,
    summary,
    game_status_after
  ) values (
    p_game_id,
    v_round_id,
    p_adjudication_id,
    p_metric_changes,
    p_new_world_state,
    coalesce(p_event_results, '[]'::jsonb),
    coalesce(p_alliance_changes, '[]'::jsonb),
    coalesce(p_next_round_warnings, '[]'::jsonb),
    p_rating::text,
    p_rating_text,
    p_summary,
    p_game_status
  )
  returning id into v_settlement_id;

  -- 更新世界指标 + 状态 + 阶段；ACTIVE 保留 completed_at 为 null，结束态写 now()
  update public.game_sessions
     set global_tension      = (p_new_world_state->>'globalTension')::int,
         world_stability     = (p_new_world_state->>'worldStability')::int,
         ai_risk             = (p_new_world_state->>'aiRisk')::int,
         economic_pressure   = (p_new_world_state->>'economicPressure')::int,
         humanitarian_crisis = (p_new_world_state->>'humanitarianCrisis')::int,
         peace_agreement     = (p_new_world_state->>'peaceAgreement')::int,
         status              = p_game_status,
         current_stage       = 'ROUND_SETTLEMENT',
         completed_at        = case when p_game_status = 'ACTIVE' then null else now() end
   where id = p_game_id;

  if not found then
    raise exception 'game % not found', p_game_id;
  end if;

  -- 批量更新联盟状态
  if jsonb_typeof(p_alliance_changes) = 'array' then
    update public.game_alliance_states gas
       set satisfaction  = c.new_satisfaction,
           stance        = c.stance,
           last_reaction = c.last_reaction
      from jsonb_to_recordset(p_alliance_changes) as c(
        alliance_id text,
        new_satisfaction int,
        stance text,
        last_reaction text
      )
     where gas.game_id = p_game_id
       and gas.alliance_id = c.alliance_id;
  end if;

  -- 批量更新事件结算（summary 落到 round_events.result_text）
  if jsonb_typeof(p_event_results) = 'array' then
    update public.round_events re
       set resolution_status = e.resolution_status,
           result_text       = e.summary
      from jsonb_to_recordset(p_event_results) as e(
        event_id uuid,
        resolution_status text,
        summary text
      )
     where re.id = e.event_id;
  end if;

  -- 推进回合阶段并写入结束世界状态
  update public.rounds
     set stage              = 'ROUND_SETTLEMENT',
         ending_world_state = p_new_world_state,
         settled_at         = now()
   where id = v_round_id;

  return jsonb_build_object('settlement_id', v_settlement_id);
end;
$$;

-- ============================================================
-- RPC 3: next_round_v1
-- ============================================================

create or replace function public.next_round_v1(
  p_game_id uuid,
  p_new_round_number int,
  p_starting_world_state jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
begin
  insert into public.rounds (
    game_id,
    round_number,
    stage,
    starting_world_state
  ) values (
    p_game_id,
    p_new_round_number,
    'RANDOM_EVENT',
    p_starting_world_state
  )
  returning id into v_round_id;

  update public.game_sessions
     set current_round = p_new_round_number,
         current_stage = 'RANDOM_EVENT'
   where id = p_game_id;

  if not found then
    raise exception 'game % not found', p_game_id;
  end if;

  return jsonb_build_object(
    'round_id', v_round_id,
    'round_number', p_new_round_number
  );
end;
$$;

-- ============================================================
-- 权限收紧
-- ============================================================
-- SECURITY DEFINER 会绕过 RLS，所以默认收回 PUBLIC / anon / authenticated 的执行权，
-- 只允许 service_role（Edge Functions 用的角色）调用。
revoke execute on function public.generate_events_v1(uuid, uuid, jsonb, text, text, text, jsonb) from public;
revoke execute on function public.settle_round_v1(
  uuid, int, jsonb, jsonb, jsonb, jsonb, jsonb, int, text, text, text, uuid
) from public;
revoke execute on function public.next_round_v1(uuid, int, jsonb) from public;

grant execute on function public.generate_events_v1(uuid, uuid, jsonb, text, text, text, jsonb) to service_role;
grant execute on function public.settle_round_v1(
  uuid, int, jsonb, jsonb, jsonb, jsonb, jsonb, int, text, text, text, uuid
) to service_role;
grant execute on function public.next_round_v1(uuid, int, jsonb) to service_role;
