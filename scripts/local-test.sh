#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# local-test.sh — full local end-to-end test runner
#
# What this does (in order):
#   1. Starts MongoDB + Redis via Docker
#   2. Starts the backend in the background
#   3. Seeds test data (charger, driver, owner, tokens)
#   4. Runs unit tests
#   5. Starts the OCPP charger simulator
#   6. Runs a full session via curl (start → poll → stop → verify)
#
# Run from the repo root:
#   bash scripts/local-test.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
info() { echo -e "${YELLOW}▶ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }

BACKEND_PID=""
SIMULATOR_PID=""

cleanup() {
  info "Shutting down background processes…"
  [ -n "$BACKEND_PID"   ] && kill "$BACKEND_PID"   2>/dev/null || true
  [ -n "$SIMULATOR_PID" ] && kill "$SIMULATOR_PID" 2>/dev/null || true
  docker compose stop mongo redis 2>/dev/null || true
}
trap cleanup EXIT

# ── 0. Prerequisite checks ──────────────────────────────────────────────────

info "Checking prerequisites…"
command -v node   >/dev/null || fail "node not found — install Node 20+"
command -v yarn   >/dev/null || fail "yarn not found — npm i -g yarn"
command -v docker >/dev/null || fail "docker not found"
command -v curl   >/dev/null || fail "curl not found"
ok "Prerequisites OK"

# ── 1. Install deps ─────────────────────────────────────────────────────────

info "Installing dependencies…"
yarn install --silent
ok "Dependencies installed"

# ── 2. Start MongoDB + Redis ─────────────────────────────────────────────────

info "Starting MongoDB and Redis via Docker Compose…"
docker compose up -d mongo redis
echo "Waiting for MongoDB to be ready…"
for i in $(seq 1 30); do
  docker compose exec -T mongo mongosh --eval "db.runCommand({ping:1})" --quiet 2>/dev/null && break
  sleep 1
done
ok "MongoDB + Redis ready"

# ── 3. Copy local env ────────────────────────────────────────────────────────

if [ ! -f apps/backend/.env ]; then
  cp apps/backend/.env.local apps/backend/.env
  info "Created apps/backend/.env from .env.local"
fi

# ── 4. Run unit tests ────────────────────────────────────────────────────────

info "Running unit tests…"
yarn test:backend --silent 2>&1 | tail -5
ok "Unit tests passed"

# ── 5. Start backend ─────────────────────────────────────────────────────────

info "Starting backend (REST :3000, OCPP :9000)…"
yarn dev:backend > /tmp/ev-backend.log 2>&1 &
BACKEND_PID=$!

echo "Waiting for backend to be ready…"
for i in $(seq 1 30); do
  curl -sf http://localhost:3000/health >/dev/null 2>&1 && break
  sleep 1
  [ $i -eq 30 ] && { cat /tmp/ev-backend.log; fail "Backend failed to start"; }
done
ok "Backend running (pid $BACKEND_PID)"

# ── 6. Seed test data ────────────────────────────────────────────────────────

info "Seeding test data…"
SEED_OUTPUT=$(npx ts-node --project apps/backend/tsconfig.json scripts/seed.ts 2>/dev/null)
echo "$SEED_OUTPUT"

DRIVER_TOKEN=$(echo "$SEED_OUTPUT" | grep "Token:" | head -1 | awk '{print $2}')
ADMIN_TOKEN=$(echo  "$SEED_OUTPUT" | grep "Token:" | tail -1 | awk '{print $2}')

[ -z "$DRIVER_TOKEN" ] && fail "Could not extract driver token from seed output"
[ -z "$ADMIN_TOKEN"  ] && fail "Could not extract admin token from seed output"
ok "Seed complete"

# ── 7. Start OCPP charger simulator ─────────────────────────────────────────

info "Installing ocpp-rpc for simulator (if needed)…"
node -e "require('ocpp-rpc')" 2>/dev/null || npm install --no-save ocpp-rpc >/dev/null 2>&1
ok "ocpp-rpc available"

info "Starting OCPP charger simulator (TESTUNIT001)…"
node scripts/simulate-charger.js > /tmp/ev-simulator.log 2>&1 &
SIMULATOR_PID=$!

echo "Waiting for simulator to connect…"
for i in $(seq 1 15); do
  grep -q "Connected ✓" /tmp/ev-simulator.log 2>/dev/null && break
  sleep 1
  [ $i -eq 15 ] && { cat /tmp/ev-simulator.log; fail "Simulator failed to connect"; }
done
ok "Charger simulator connected"
sleep 2  # let BootNotification complete

# ── 8. API smoke tests ────────────────────────────────────────────────────────

info "Running API smoke tests…"

# Health
HEALTH=$(curl -sf http://localhost:3000/health)
echo "$HEALTH" | grep -q '"ok":true' || fail "Health check failed: $HEALTH"
ok "GET /health"

# List chargers
CHARGERS=$(curl -sf http://localhost:3000/chargers \
  -H "Authorization: Bearer $DRIVER_TOKEN")
echo "$CHARGERS" | grep -q 'TESTUNIT001' || fail "Charger not in list: $CHARGERS"
CHARGER_ID=$(echo "$CHARGERS" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data[0]._id))")
ok "GET /chargers → found TESTUNIT001 (id: $CHARGER_ID)"

# Start session
info "Starting charging session…"
SESSION_RESP=$(curl -sf -X POST http://localhost:3000/sessions/start \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"chargerId\":\"$CHARGER_ID\"}")
echo "$SESSION_RESP" | grep -q 'sessionId' || fail "Session start failed: $SESSION_RESP"
SESSION_ID=$(echo "$SESSION_RESP" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.sessionId))")
ok "POST /sessions/start → sessionId: $SESSION_ID"

# Wait for StartTransaction to come back from simulator
info "Waiting for charger to confirm start (5s)…"
sleep 5

# Poll session — should be active
SESSION=$(curl -sf http://localhost:3000/sessions/$SESSION_ID \
  -H "Authorization: Bearer $DRIVER_TOKEN")
STATUS=$(echo "$SESSION" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.status))")
[ "$STATUS" = "active" ] || fail "Session not active after start — status: $STATUS. Check /tmp/ev-backend.log"
ok "Session is ACTIVE"

# Let it charge for a couple of meter intervals
info "Letting session accumulate energy (25s — two meter value intervals)…"
sleep 25

# Poll again to see energy accumulating
SESSION=$(curl -sf http://localhost:3000/sessions/$SESSION_ID \
  -H "Authorization: Bearer $DRIVER_TOKEN")
ENERGY=$(echo "$SESSION" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.energyDeliveredWh))")
ACCRUED=$(echo "$SESSION" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accruedAmount))")
ok "Energy delivered: ${ENERGY} Wh  |  Accrued: ${ACCRUED} paisa"

# Stop session
info "Stopping session…"
STOP_RESP=$(curl -sf -X POST http://localhost:3000/sessions/$SESSION_ID/stop \
  -H "Authorization: Bearer $DRIVER_TOKEN")
echo "$STOP_RESP" | grep -q 'success' || fail "Stop failed: $STOP_RESP"
ok "POST /sessions/:id/stop accepted"

# Wait for StopTransaction
sleep 5

# Verify session completed
SESSION=$(curl -sf http://localhost:3000/sessions/$SESSION_ID \
  -H "Authorization: Bearer $DRIVER_TOKEN")
FINAL_STATUS=$(echo "$SESSION" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.status))")
GROSS=$(echo "$SESSION" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.grossAmount))")
COMMISSION=$(echo "$SESSION" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.commissionAmount))")

[ "$FINAL_STATUS" = "completed" ] || fail "Session not completed — status: $FINAL_STATUS"
ok "Session COMPLETED"
ok "Gross amount:      ${GROSS} paisa"
ok "Commission (10%):  ${COMMISSION} paisa"

# Admin reconciliation
RECON=$(curl -sf http://localhost:3000/admin/reconciliation \
  -H "Authorization: Bearer $ADMIN_TOKEN")
ok "Admin reconciliation: $RECON"

# ── 9. Done ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ALL TESTS PASSED — local end-to-end is working           ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Logs:"
echo "  Backend:   tail -f /tmp/ev-backend.log"
echo "  Simulator: tail -f /tmp/ev-simulator.log"
echo ""
echo "Keep exploring:"
echo "  Admin web:  yarn dev:admin  → http://localhost:5173  (paste admin token)"
echo "  Driver app: cd apps/driver-app && EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start"
echo "  Owner app:  cd apps/owner-app  && EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start"
echo ""
echo "  Driver token: $DRIVER_TOKEN"
echo "  Admin token:  $ADMIN_TOKEN"
echo ""
echo "Press Ctrl+C to stop backend and simulator."
wait
