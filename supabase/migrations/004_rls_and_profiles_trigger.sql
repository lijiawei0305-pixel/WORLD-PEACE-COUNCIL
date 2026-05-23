-- 004_rls_and_profiles_trigger.sql
--
-- 1) auth.users -> public.profiles 自动建行触发器
-- 2) 给 7 张游戏表加显式 deny INSERT/UPDATE policy（authenticated role）
--    Edge Functions 用 service role 写库（BYPASSRLS），不受影响。
-- 3) 幂等地确保 country_alliance_map / alliances 有 public SELECT policy。
--
-- 语法说明：
--   PostgreSQL 的 INSERT policy 只接受 WITH CHECK，不接受 USING；
--   UPDATE policy 用 USING (false) WITH CHECK (false) 双重声明拒绝写入。
--   对应你指令中的 "FOR INSERT ... USING (false)" 已修正为 WITH CHECK (false)。

-- ============================================================
-- Part 1: profiles 自动建行触发器
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Part 2: 显式 deny INSERT / UPDATE policy（authenticated role）
-- ============================================================
-- 7 张游戏表，每张加两条 policy：deny_direct_insert / deny_direct_update。
-- 用 drop-if-exists + create 实现幂等。
-- 注意：authenticated role 绑定的是带登录态的前端客户端；service_role 不在 authenticated
--       group 内，会绕过 RLS，仍可写入。anon role 同理。

-- game_sessions
drop policy if exists "game_sessions_deny_direct_insert" on public.game_sessions;
create policy "game_sessions_deny_direct_insert"
on public.game_sessions
for insert
to authenticated
with check (false);

drop policy if exists "game_sessions_deny_direct_update" on public.game_sessions;
create policy "game_sessions_deny_direct_update"
on public.game_sessions
for update
to authenticated
using (false)
with check (false);

-- rounds
drop policy if exists "rounds_deny_direct_insert" on public.rounds;
create policy "rounds_deny_direct_insert"
on public.rounds
for insert
to authenticated
with check (false);

drop policy if exists "rounds_deny_direct_update" on public.rounds;
create policy "rounds_deny_direct_update"
on public.rounds
for update
to authenticated
using (false)
with check (false);

-- round_events
drop policy if exists "round_events_deny_direct_insert" on public.round_events;
create policy "round_events_deny_direct_insert"
on public.round_events
for insert
to authenticated
with check (false);

drop policy if exists "round_events_deny_direct_update" on public.round_events;
create policy "round_events_deny_direct_update"
on public.round_events
for update
to authenticated
using (false)
with check (false);

-- proposals
drop policy if exists "proposals_deny_direct_insert" on public.proposals;
create policy "proposals_deny_direct_insert"
on public.proposals
for insert
to authenticated
with check (false);

drop policy if exists "proposals_deny_direct_update" on public.proposals;
create policy "proposals_deny_direct_update"
on public.proposals
for update
to authenticated
using (false)
with check (false);

-- ai_adjudications
drop policy if exists "ai_adjudications_deny_direct_insert" on public.ai_adjudications;
create policy "ai_adjudications_deny_direct_insert"
on public.ai_adjudications
for insert
to authenticated
with check (false);

drop policy if exists "ai_adjudications_deny_direct_update" on public.ai_adjudications;
create policy "ai_adjudications_deny_direct_update"
on public.ai_adjudications
for update
to authenticated
using (false)
with check (false);

-- settlements
drop policy if exists "settlements_deny_direct_insert" on public.settlements;
create policy "settlements_deny_direct_insert"
on public.settlements
for insert
to authenticated
with check (false);

drop policy if exists "settlements_deny_direct_update" on public.settlements;
create policy "settlements_deny_direct_update"
on public.settlements
for update
to authenticated
using (false)
with check (false);

-- game_alliance_states
drop policy if exists "game_alliance_states_deny_direct_insert" on public.game_alliance_states;
create policy "game_alliance_states_deny_direct_insert"
on public.game_alliance_states
for insert
to authenticated
with check (false);

drop policy if exists "game_alliance_states_deny_direct_update" on public.game_alliance_states;
create policy "game_alliance_states_deny_direct_update"
on public.game_alliance_states
for update
to authenticated
using (false)
with check (false);

-- ============================================================
-- Part 3: country_alliance_map / alliances public SELECT
-- ============================================================
-- 001 已经创建过 alliances_public_read / country_alliance_map_public_read，
-- 这里按你的 policy name 'public_read' 幂等重建，并清理旧名字。

-- country_alliance_map
drop policy if exists "country_alliance_map_public_read" on public.country_alliance_map;
drop policy if exists "public_read" on public.country_alliance_map;
create policy "public_read"
on public.country_alliance_map
for select
using (true);

-- alliances
drop policy if exists "alliances_public_read" on public.alliances;
drop policy if exists "public_read" on public.alliances;
create policy "public_read"
on public.alliances
for select
using (true);
