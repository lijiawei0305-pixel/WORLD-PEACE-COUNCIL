# Supabase MVP Backend

This directory contains the first backend/database slice for the Vite game.

Current scope:

- Postgres tables for games, per-game alliance state, turns, random events, proposals, AI adjudications, alliance reactions, and rule-engine settlements.
- Fixed initial world state copied from `src/data/worldPeaceCouncil.ts`.
- RLS is enabled on all MVP tables. The frontend should call Supabase Edge Functions; Edge Functions should access Postgres with the service role key.
- `public.create_mvp_game()` creates a new game with round 1 and the fixed initial alliance state.

Local validation once the Supabase CLI and Docker are available:

```bash
npx supabase db reset
```

Manual smoke query:

```sql
select public.create_mvp_game();
select id, status, current_round, global_tension from public.games order by created_at desc limit 1;
```
