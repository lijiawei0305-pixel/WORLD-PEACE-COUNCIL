create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'ACTIVE',
  current_round int not null default 1,
  max_rounds int not null default 20,
  current_stage text not null default 'RANDOM_EVENT',
  global_tension int not null default 60,
  world_stability int not null default 65,
  ai_risk int not null default 35,
  economic_pressure int not null default 40,
  humanitarian_crisis int not null default 30,
  peace_agreement int not null default 20,
  history_summary text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz null,
  constraint game_sessions_status_check check (
    status in ('ACTIVE', 'WON', 'FAILED', 'COLD_PEACE', 'ABANDONED')
  ),
  constraint game_sessions_current_round_check check (current_round between 1 and 20),
  constraint game_sessions_max_rounds_check check (max_rounds = 20),
  constraint game_sessions_current_stage_check check (
    current_stage in (
      'RANDOM_EVENT',
      'SITUATION_OVERVIEW',
      'DIPLOMATIC_PROPOSAL',
      'AI_ADJUDICATION',
      'ROUND_SETTLEMENT'
    )
  ),
  constraint game_sessions_global_tension_check check (global_tension between 0 and 100),
  constraint game_sessions_world_stability_check check (world_stability between 0 and 100),
  constraint game_sessions_ai_risk_check check (ai_risk between 0 and 100),
  constraint game_sessions_economic_pressure_check check (economic_pressure between 0 and 100),
  constraint game_sessions_humanitarian_crisis_check check (humanitarian_crisis between 0 and 100),
  constraint game_sessions_peace_agreement_check check (peace_agreement between 0 and 100)
);

create table public.alliances (
  id text primary key,
  name text not null,
  short_name text,
  icon_key text,
  color text,
  personality text,
  core_demand text,
  red_lines jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table public.game_alliance_states (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.game_sessions(id) on delete cascade,
  alliance_id text references public.alliances(id),
  stance text not null,
  satisfaction int not null,
  current_demand text,
  pressure_tags jsonb default '[]'::jsonb,
  last_reaction text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint game_alliance_states_game_alliance_unique unique (game_id, alliance_id),
  constraint game_alliance_states_satisfaction_check check (satisfaction between 0 and 100)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.game_sessions(id) on delete cascade,
  round_number int not null,
  stage text not null default 'RANDOM_EVENT',
  starting_world_state jsonb not null,
  after_events_world_state jsonb,
  ending_world_state jsonb,
  briefing text,
  priority_issue text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  settled_at timestamptz null,
  constraint rounds_game_round_unique unique (game_id, round_number),
  constraint rounds_round_number_check check (round_number between 1 and 20),
  constraint rounds_stage_check check (
    stage in (
      'RANDOM_EVENT',
      'SITUATION_OVERVIEW',
      'DIPLOMATIC_PROPOSAL',
      'AI_ADJUDICATION',
      'ROUND_SETTLEMENT'
    )
  )
);

create table public.round_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.game_sessions(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete cascade,
  title text not null,
  type text not null,
  severity text not null,
  description text not null,
  involved_alliances jsonb not null default '[]'::jsonb,
  potential_impact jsonb not null default '{}'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  unresolved_consequence text,
  resolution_status text not null default 'UNCHANGED',
  result_text text,
  created_at timestamptz default now(),
  constraint round_events_type_check check (
    type in (
      'MILITARY',
      'ENERGY',
      'CYBER',
      'AI',
      'FOOD',
      'REFUGEE',
      'ECONOMY',
      'DIPLOMACY',
      'SUPPLY_CHAIN'
    )
  ),
  constraint round_events_severity_check check (severity in ('HIGH', 'MEDIUM', 'LOW', 'OPPORTUNITY')),
  constraint round_events_resolution_status_check check (
    resolution_status in ('RESOLVED', 'PARTIALLY_RESOLVED', 'UNCHANGED', 'WORSENED')
  )
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.game_sessions(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  proposal_text text not null,
  mentioned_alliances jsonb default '[]'::jsonb,
  action_types jsonb default '[]'::jsonb,
  preview_result jsonb,
  submitted_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint proposals_round_unique unique (round_id),
  constraint proposals_text_length_check check (char_length(trim(proposal_text)) > 0)
);

create table public.ai_adjudications (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.game_sessions(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete cascade,
  proposal_id uuid references public.proposals(id) on delete cascade,
  model text,
  raw_output jsonb not null,
  parsed_output jsonb not null,
  success_probability int,
  expected_impact jsonb,
  alliance_reactions jsonb,
  event_resolution_forecast jsonb,
  next_round_risks jsonb,
  created_at timestamptz default now(),
  constraint ai_adjudications_success_probability_check check (
    success_probability is null or success_probability between 0 and 100
  )
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.game_sessions(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete cascade,
  adjudication_id uuid references public.ai_adjudications(id),
  metric_changes jsonb not null,
  new_world_state jsonb not null,
  event_results jsonb default '[]'::jsonb,
  alliance_changes jsonb default '[]'::jsonb,
  next_round_warnings jsonb default '[]'::jsonb,
  rating text,
  rating_text text,
  summary text,
  game_status_after text,
  created_at timestamptz default now(),
  constraint settlements_game_status_after_check check (
    game_status_after is null or game_status_after in ('ACTIVE', 'WON', 'FAILED', 'COLD_PEACE', 'ABANDONED')
  )
);

create table public.country_alliance_map (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  country_name text not null,
  alliance_id text references public.alliances(id),
  city_name text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_game_sessions_updated_at
before update on public.game_sessions
for each row execute function public.set_updated_at();

create trigger set_game_alliance_states_updated_at
before update on public.game_alliance_states
for each row execute function public.set_updated_at();

create trigger set_rounds_updated_at
before update on public.rounds
for each row execute function public.set_updated_at();

create index game_sessions_user_id_idx on public.game_sessions(user_id);
create index game_sessions_user_status_idx on public.game_sessions(user_id, status);
create index game_alliance_states_game_id_idx on public.game_alliance_states(game_id);
create index game_alliance_states_alliance_id_idx on public.game_alliance_states(alliance_id);
create index rounds_game_id_idx on public.rounds(game_id);
create index round_events_game_id_idx on public.round_events(game_id);
create index round_events_round_id_idx on public.round_events(round_id);
create index proposals_game_id_idx on public.proposals(game_id);
create index proposals_round_id_idx on public.proposals(round_id);
create index proposals_user_id_idx on public.proposals(user_id);
create index ai_adjudications_game_id_idx on public.ai_adjudications(game_id);
create index ai_adjudications_round_id_idx on public.ai_adjudications(round_id);
create index ai_adjudications_proposal_id_idx on public.ai_adjudications(proposal_id);
create index settlements_game_id_idx on public.settlements(game_id);
create index settlements_round_id_idx on public.settlements(round_id);
create index settlements_adjudication_id_idx on public.settlements(adjudication_id);
create index country_alliance_map_country_code_idx on public.country_alliance_map(country_code);
create index country_alliance_map_alliance_id_idx on public.country_alliance_map(alliance_id);

insert into public.alliances (
  id,
  name,
  short_name,
  icon_key,
  color,
  personality,
  core_demand,
  red_lines
) values
  (
    'north_west',
    '北美·西方联盟',
    'NAW',
    'alliance-western',
    '#4aa8ff',
    '制度化、重视透明与联盟承诺，对军事误判高度敏感。',
    '建立军事透明机制',
    '["不得削弱盟友安全承诺", "不得承认强制改变边界", "不得放松关键技术扩散限制"]'::jsonb
  ),
  (
    'china',
    '中华联盟',
    'ZHN',
    'alliance-zhonghua',
    '#21d4ff',
    '务实、强调主权与发展空间，偏好长期框架和多边治理。',
    '推动国际AI治理框架落地',
    '["不得侵犯核心主权议题", "不得阻断关键供应链", "不得排除发展中国家参与治理"]'::jsonb
  ),
  (
    'russia',
    '俄罗斯联邦',
    'RUS',
    'alliance-russian',
    '#ff7a3d',
    '安全焦虑强、谈判强硬，重视战略缓冲和对等让步。',
    '保障边境安全与战略缓冲',
    '["不得扩大边境军事部署", "不得削弱战略威慑", "不得单方面施加强制制裁"]'::jsonb
  ),
  (
    'middle_east',
    '中东·和平联盟',
    'MEP',
    'alliance-middle-east',
    '#f7c948',
    '关注能源通道、宗教与地区安全平衡，愿意接受中立担保。',
    '举行能源走廊协调会议',
    '["不得破坏能源出口安全", "不得扩大代理人冲突", "不得忽视圣地与民生安全"]'::jsonb
  ),
  (
    'africa',
    '非洲团结联盟',
    'AFR',
    'alliance-africa',
    '#ff9f43',
    '重视发展、公平融资和人道救援，对外部阵营化保持警惕。',
    '设立人道援助与发展基金',
    '["不得牺牲粮食与医疗援助", "不得附加掠夺性债务条件", "不得忽视难民保护"]'::jsonb
  ),
  (
    'latin_america',
    '拉美·南美联盟',
    'LAT',
    'alliance-latin',
    '#42e27f',
    '重视资源主权、粮食价格和社会稳定，偏好多边经济缓冲。',
    '稳定全球粮食市场价格',
    '["不得冲击粮食出口收入", "不得干涉国内政治路线", "不得加剧债务与通胀压力"]'::jsonb
  ),
  (
    'southeast_asia',
    '东南亚联盟',
    'SEA',
    'alliance-southeast-asia',
    '#28f0c4',
    '平衡大国关系、优先供应链稳定和海上通道安全。',
    '保障供应链安全与畅通',
    '["不得迫使选边站队", "不得中断关键海运航线", "不得升级区域军事摩擦"]'::jsonb
  );

insert into public.country_alliance_map (
  country_code,
  country_name,
  alliance_id,
  city_name,
  latitude,
  longitude
) values
  ('US', 'United States', 'north_west', 'Washington', 38.9072, -77.0369),
  ('DE', 'Germany', 'north_west', 'Berlin', 52.52, 13.405),
  ('CN', 'China', 'china', 'Beijing', 39.9042, 116.4074),
  ('RU', 'Russia', 'russia', 'Moscow', 55.7558, 37.6173),
  ('SA', 'Saudi Arabia', 'middle_east', 'Riyadh', 24.7136, 46.6753),
  ('IR', 'Iran', 'middle_east', 'Tehran', 35.6892, 51.389),
  ('NG', 'Nigeria', 'africa', 'Lagos', 6.5244, 3.3792),
  ('ZA', 'South Africa', 'africa', 'Cape Town', -33.9249, 18.4241),
  ('BR', 'Brazil', 'latin_america', 'Brasilia', -15.7939, -47.8828),
  ('AR', 'Argentina', 'latin_america', 'Buenos Aires', -34.6037, -58.3816),
  ('SG', 'Singapore', 'southeast_asia', 'Singapore', 1.3521, 103.8198),
  ('ID', 'Indonesia', 'southeast_asia', 'Jakarta', -6.2088, 106.8456),
  ('VN', 'Vietnam', 'southeast_asia', 'Hanoi', 21.0278, 105.8342);

alter table public.profiles enable row level security;
alter table public.game_sessions enable row level security;
alter table public.alliances enable row level security;
alter table public.game_alliance_states enable row level security;
alter table public.rounds enable row level security;
alter table public.round_events enable row level security;
alter table public.proposals enable row level security;
alter table public.ai_adjudications enable row level security;
alter table public.settlements enable row level security;
alter table public.country_alliance_map enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "alliances_public_read"
on public.alliances
for select
to anon, authenticated
using (true);

create policy "country_alliance_map_public_read"
on public.country_alliance_map
for select
to anon, authenticated
using (true);

create policy "game_sessions_select_own"
on public.game_sessions
for select
to authenticated
using (user_id = auth.uid());

create policy "game_alliance_states_select_own_game"
on public.game_alliance_states
for select
to authenticated
using (
  exists (
    select 1
    from public.game_sessions
    where game_sessions.id = game_alliance_states.game_id
      and game_sessions.user_id = auth.uid()
  )
);

create policy "rounds_select_own_game"
on public.rounds
for select
to authenticated
using (
  exists (
    select 1
    from public.game_sessions
    where game_sessions.id = rounds.game_id
      and game_sessions.user_id = auth.uid()
  )
);

create policy "round_events_select_own_game"
on public.round_events
for select
to authenticated
using (
  exists (
    select 1
    from public.game_sessions
    where game_sessions.id = round_events.game_id
      and game_sessions.user_id = auth.uid()
  )
);

create policy "proposals_select_own_game"
on public.proposals
for select
to authenticated
using (
  exists (
    select 1
    from public.game_sessions
    where game_sessions.id = proposals.game_id
      and game_sessions.user_id = auth.uid()
  )
);

create policy "ai_adjudications_select_own_game"
on public.ai_adjudications
for select
to authenticated
using (
  exists (
    select 1
    from public.game_sessions
    where game_sessions.id = ai_adjudications.game_id
      and game_sessions.user_id = auth.uid()
  )
);

create policy "settlements_select_own_game"
on public.settlements
for select
to authenticated
using (
  exists (
    select 1
    from public.game_sessions
    where game_sessions.id = settlements.game_id
      and game_sessions.user_id = auth.uid()
  )
);
