#!/usr/bin/env bash
# 一键重部署所有 Edge Functions，统一用 deno.json import-map。
# 用法：bash scripts/deploy-all-functions.sh
# 注意：会有几秒/函数的不可用窗口；不要在 in-flight 游戏中跑。

set -e

PROJECT_REF="qjpmsqynwyxtdpvparrm"
IMPORT_MAP="supabase/functions/deno.json"

FUNCTIONS=(
  alliance-map
  create-game
  get-game-state
  generate-events
  advance-stage
  submit-proposal
  settle-round
  next-round
)

echo "=== 重部署 ${#FUNCTIONS[@]} 个 Edge Functions  (project=$PROJECT_REF, import-map=$IMPORT_MAP) ==="

for fn in "${FUNCTIONS[@]}"; do
  echo ""
  echo "→ $fn"
  npx supabase functions deploy "$fn" \
    --project-ref "$PROJECT_REF" \
    --import-map "$IMPORT_MAP" 2>&1 | tail -3
done

echo ""
echo "=== 全部完成 ==="
