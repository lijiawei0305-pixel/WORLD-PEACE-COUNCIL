-- 005_unique_constraints.sql
--
-- 给 ai_adjudications / settlements / rounds 加唯一约束，并为 ai_adjudications 加
-- 复合索引加速 get-game-state 里"按 round_id 取最新一条"的查询。
--
-- 幂等策略：
--   PostgreSQL 15 没有 ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS。
--   所以全部用 DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint ...) THEN ALTER TABLE ... END IF; END $$
--   这种探测块。conname 用本 migration 指定的名字探测；rounds 那条额外按"列组合是否已有 unique"
--   做检查，避免与 001 的 rounds_game_round_unique 重复。

-- ============================================================
-- 防止同一 round 有多条裁定记录
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_adjudication_round'
  ) then
    alter table public.ai_adjudications
      add constraint uq_adjudication_round unique (round_id);
  end if;
end$$;

-- ============================================================
-- 防止同一 round 重复结算
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_settlement_round'
  ) then
    alter table public.settlements
      add constraint uq_settlement_round unique (round_id);
  end if;
end$$;

-- ============================================================
-- 防止同一 game 同一 round 重复的 round 行
-- 注意：001 已经在 public.rounds 上创建了名为 rounds_game_round_unique
-- 的同列组合 unique 约束。这里同时按 conname 和按列组合双重探测，
-- 避免在已有约束的库上加冗余 unique。
-- ============================================================
do $$
declare
  v_rounds_oid oid := 'public.rounds'::regclass::oid;
  v_game_id_attnum smallint;
  v_round_number_attnum smallint;
  v_already_unique boolean;
begin
  if exists (select 1 from pg_constraint where conname = 'uq_round_per_game') then
    return;
  end if;

  select attnum into v_game_id_attnum
    from pg_attribute where attrelid = v_rounds_oid and attname = 'game_id';
  select attnum into v_round_number_attnum
    from pg_attribute where attrelid = v_rounds_oid and attname = 'round_number';

  select exists (
    select 1
      from pg_constraint c
     where c.conrelid = v_rounds_oid
       and c.contype = 'u'
       and c.conkey @> array[v_game_id_attnum, v_round_number_attnum]::int2[]
       and c.conkey <@ array[v_game_id_attnum, v_round_number_attnum]::int2[]
  ) into v_already_unique;

  if v_already_unique then
    return;
  end if;

  alter table public.rounds
    add constraint uq_round_per_game unique (game_id, round_number);
end$$;

-- ============================================================
-- ai_adjudications(round_id, created_at desc) 复合索引
-- 加速 get-game-state 的 .order('created_at', desc).limit(1) 查询。
-- ============================================================
create index if not exists idx_adjudications_round_created
  on public.ai_adjudications (round_id, created_at desc);
