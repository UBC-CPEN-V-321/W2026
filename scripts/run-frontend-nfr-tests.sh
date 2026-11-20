#!/usr/bin/env bash
#
# Run frontend NFR tests (app/src/androidTest/.../nfr/*.kt).
#
# Uses the isolated E2E database and seeded session fixture for authorization tests.
# Usage: ./scripts/run-frontend-nfr-tests.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FRONTEND_DIR="${FRONTEND_DIR:-$ROOT/frontend}"
# Compose injects this into the backend container. The NFR authorization test
# uses a seeded user/session from the disposable E2E database.
export MONGODB_URI="mongodb://e2e-mongo:27017/cpen321"
export SKIP_EVENT_SYNC=1
export FRONTEND_TESTS_REQUIRE_SIGN_IN=0

source "$ROOT/scripts/lib/frontend-instrumented-test-common.sh"

command -v docker >/dev/null 2>&1 || die "Docker not found."
docker info >/dev/null 2>&1 || die "Docker is not running."

# Recreate the tmpfs-backed database so every run starts with the same users,
# sessions, and authorization boundary.
info "Resetting the isolated NFR database ..."
docker compose -f "$ROOT/docker-compose.yml" up \
  --force-recreate -d --wait --wait-timeout 120 e2e-mongo

run_instrumented_tests nfr
