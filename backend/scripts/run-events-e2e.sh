#!/usr/bin/env bash
# Runs every Live Events E2E test against a throwaway local MongoDB and the real backend.
#   npm run e2e:events          (from backend/; an emulator on API 36 or lower must already be running)
# Steps: start the DB, seed, start the backend, set the emulator to UBC, run the events tests,
# re-seed with no events and run the empty-state test, then stop everything and discard the data.
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
echo "==> Starting the E2E database and seeding it"
npm run e2e:db:up && npm run e2e:seed || exit 1

echo "==> Starting the backend on the E2E database"
npm run e2e:backend >/tmp/e2e-backend.log 2>&1 &
BACKEND_PID=$!
for _ in $(seq 1 60); do
  curl -fs "$BACKEND_URL/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "$BACKEND_URL/health" >/dev/null 2>&1 || { echo "Backend did not start. See /tmp/e2e-backend.log"; exit 1; }

# Optional: set the emulator location to UBC when adb is available (skipped otherwise).
if command -v adb >/dev/null 2>&1; then
  echo "==> Setting the emulator location to UBC"
  adb emu geo fix -123.2460 49.2606 >/dev/null 2>&1 || echo "Could not set the location; continuing."
else
  echo "==> adb not found; skipping the emulator location step"
fi

cd "$FRONTEND_DIR" || exit 1
echo "==> Running the Live Events E2E tests"
./gradlew :app:connectedDebugAndroidTest \
  "$RUNNER_ARG.package=com.exploreUBC.cpen321application.e2e.events" || STATUS=1

echo "==> Re-seeding with no events and running the empty-state test"
(cd "$BACKEND_DIR" && npm run e2e:seed -- empty) || exit 1
./gradlew :app:connectedDebugAndroidTest \
  "$RUNNER_ARG.class=com.exploreUBC.cpen321application.e2e.events.LiveEventsEmptyStateE2ETest" || STATUS=1

exit $STATUS
