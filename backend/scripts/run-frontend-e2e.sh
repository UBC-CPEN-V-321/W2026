#!/usr/bin/env bash
# Runs all Android E2E journeys against the real app, backend, and throwaway MongoDB.
set -uo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$(cd "$BACKEND_DIR/../frontend" && pwd)"
BACKEND_URL="${E2E_BACKEND_URL:-http://localhost:3000}"
RUNNER_ARG="-Pandroid.testInstrumentationRunnerArguments"
BACKEND_PID=""
STATUS=0

cleanup() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  (cd "$BACKEND_DIR" && npm run e2e:db:down >/dev/null 2>&1)
  echo "Stopped the backend and discarded the E2E database."
}
trap cleanup EXIT

cd "$BACKEND_DIR" || exit 1
echo "==> Starting and seeding the E2E database"
npm run e2e:db:up && npm run e2e:seed || exit 1

echo "==> Starting the real backend"
npm run e2e:backend >/tmp/e2e-backend.log 2>&1 &
BACKEND_PID=$!
for _ in $(seq 1 60); do
  curl -fs "$BACKEND_URL/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "$BACKEND_URL/health" >/dev/null 2>&1 || {
  echo "Backend did not start. See /tmp/e2e-backend.log"
  exit 1
}

if command -v adb >/dev/null 2>&1; then
  adb emu geo fix -123.2460 49.2606 >/dev/null 2>&1 || true
fi

cd "$FRONTEND_DIR" || exit 1
echo "==> Running every real-backend E2E test"
./gradlew :app:connectedDebugAndroidTest \
  "$RUNNER_ARG.package=com.exploreUBC.cpen321application.e2e" || STATUS=1

echo "==> Re-seeding without events for the empty-state E2E test"
(cd "$BACKEND_DIR" && npm run e2e:seed -- empty) || exit 1
./gradlew :app:connectedDebugAndroidTest \
  "$RUNNER_ARG.class=com.exploreUBC.cpen321application.e2e.events.LiveEventsEmptyStateE2ETest" || STATUS=1

exit $STATUS
