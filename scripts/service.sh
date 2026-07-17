#!/bin/bash
# Ledgr background service entrypoint.
#
# Runs the backend (uvicorn) and frontend (vite) together on a DEDICATED port
# (default 8420, not the common 8080) so it never clashes with other projects.
# Designed to be run *in the foreground* by launchd — launchd keeps it alive,
# restarts it on crash, and starts it at login. Do not add `&`/nohup here;
# process management is launchd's job (see the plist in scripts/).
#
# Configuration (in precedence order):
#   1. Environment variables (highest)
#   2. .ledgr.env at the repo root (git-ignored — your personal paths go here;
#      copy .ledgr.env.example to create it)
#   3. Built-in defaults (lowest)
#
# Recognised settings:
#   LEDGR_PORT            Backend port         (default 8420)
#   LEDGR_FRONTEND_PORT   Frontend port        (default 5173)
#   BEANCOUNT_FILE        Ledger file to load  (default: data/example.beancount)
#   LEDGR_RELOAD          1 = run uvicorn with --reload so backend Python edits
#                         auto-reload (for development). Default off — the
#                         service is long-lived and the ledger hot-reloads on
#                         its own. Frontend (vite) always hot-reloads.
#
# Run standalone for a foreground session:  ./scripts/service.sh
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# Load local, git-ignored config if present. Capture any pre-set env vars first
# so an explicit `BEANCOUNT_FILE=... ./service.sh` still wins over .ledgr.env.
_env_beancount="${BEANCOUNT_FILE:-}"
_env_port="${LEDGR_PORT:-}"
_env_fport="${LEDGR_FRONTEND_PORT:-}"
if [ -f "$REPO_ROOT/.ledgr.env" ]; then
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.ledgr.env"
fi
[ -n "$_env_beancount" ] && BEANCOUNT_FILE="$_env_beancount"
[ -n "$_env_port" ] && LEDGR_PORT="$_env_port"
[ -n "$_env_fport" ] && LEDGR_FRONTEND_PORT="$_env_fport"

LEDGR_PORT="${LEDGR_PORT:-8420}"
LEDGR_FRONTEND_PORT="${LEDGR_FRONTEND_PORT:-5173}"
# Default to the bundled example ledger so the service runs out of the box with
# no personal path in version control. Set BEANCOUNT_FILE (in .ledgr.env or the
# environment) to point at your real file.
BEANCOUNT_FILE="${BEANCOUNT_FILE:-$REPO_ROOT/data/example.beancount}"

if [ ! -f "$BEANCOUNT_FILE" ]; then
  echo "Error: ledger file not found: $BEANCOUNT_FILE" >&2
  echo "Set BEANCOUNT_FILE in .ledgr.env (copy .ledgr.env.example) or the environment." >&2
  exit 1
fi
export BEANCOUNT_FILE="$(cd "$(dirname "$BEANCOUNT_FILE")" && pwd)/$(basename "$BEANCOUNT_FILE")"

echo "Ledgr service starting"
echo "  Ledger:   $BEANCOUNT_FILE"
echo "  Backend:  http://localhost:$LEDGR_PORT"
echo "  Frontend: http://localhost:$LEDGR_FRONTEND_PORT"

# --- Backend ---------------------------------------------------------------
cd "$REPO_ROOT/backend"
source .venv/bin/activate
# By default no --reload: this is a long-lived service, and the backend
# hot-reloads the ledger on file change on its own (see backend/ledger.py
# get_ledger). Set LEDGR_RELOAD=1 for development so backend Python edits
# auto-reload without a manual `ledgr restart`.
_reload_flag=""
[ "${LEDGR_RELOAD:-0}" = "1" ] && _reload_flag="--reload"
# shellcheck disable=SC2086 # intentional word-split of the optional flag
uvicorn main:app --host 127.0.0.1 --port "$LEDGR_PORT" $_reload_flag &
BACKEND_PID=$!
cd "$REPO_ROOT"

# --- Frontend --------------------------------------------------------------
# VITE_API_PORT points the dev-server proxy at our dedicated backend port.
cd "$REPO_ROOT/frontend"
VITE_API_PORT="$LEDGR_PORT" npm run dev -- --port "$LEDGR_FRONTEND_PORT" &
FRONTEND_PID=$!
cd "$REPO_ROOT"

# If either child dies, tear the whole service down so launchd restarts it
# cleanly instead of leaving a half-running pair.
trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null' EXIT INT TERM

# Wait until either child stops, then exit (macOS ships bash 3.2, which has no
# `wait -n`, so poll both PIDs instead).
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 2
done
echo "A child process exited (backend=$BACKEND_PID frontend=$FRONTEND_PID); shutting down."
