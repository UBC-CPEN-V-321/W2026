#!/usr/bin/env bash
#
# Run frontend E2E tests (app/src/androidTest/.../e2e/*.kt).
#
# Prerequisites: sign in inside the app on the emulator, then press Enter when prompted.
# Usage: ./scripts/run-frontend-e2e-tests.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FRONTEND_DIR="${FRONTEND_DIR:-$ROOT/frontend}"
# Compose injects this into the backend container; E2E sessions live only in e2e-mongo.
export MONGODB_URI="mongodb://e2e-mongo:27017/cpen321"
export SKIP_EVENT_SYNC=1

source "$ROOT/scripts/lib/frontend-instrumented-test-common.sh"

# The profile creation test completes a seeded user's onboarding. Recreate only the
# disposable E2E Mongo container so each run starts with that user's original state.
# `docker compose up` alone keeps an existing container (and its tmpfs data).
info "Resetting the isolated E2E database ..."
docker compose -f "$ROOT/docker-compose.yml" up \
  --force-recreate -d --wait --wait-timeout 120 e2e-mongo

run_instrumented_tests e2e
