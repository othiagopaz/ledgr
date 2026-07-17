#!/bin/bash
set -e

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# Ledger file resolution: CLI arg > .ledgr.env (git-ignored) > example ledger.
if [ -f "$REPO_ROOT/.ledgr.env" ]; then
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.ledgr.env"
fi
BEANCOUNT_FILE="${1:-${BEANCOUNT_FILE:-data/example.beancount}}"

if [ ! -f "$BEANCOUNT_FILE" ]; then
  echo "Error: file not found: $BEANCOUNT_FILE"
  exit 1
fi

export BEANCOUNT_FILE="$(cd "$(dirname "$BEANCOUNT_FILE")" && pwd)/$(basename "$BEANCOUNT_FILE")"

LEDGR_PORT="${LEDGR_PORT:-8420}"

# Start backend
echo "Starting backend on :$LEDGR_PORT..."
echo "  Ledger file: $BEANCOUNT_FILE"
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port "$LEDGR_PORT" &
BACKEND_PID=$!
cd ..

# Start frontend (proxy points at the dedicated backend port via VITE_API_PORT)
echo "Starting frontend on :5173..."
cd frontend
VITE_API_PORT="$LEDGR_PORT" npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Ledgr running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:$LEDGR_PORT"
echo "  API docs: http://localhost:$LEDGR_PORT/docs"
echo ""
echo "Press Ctrl+C to stop"

# Open browser after a short delay for servers to start
(sleep 0.5 && open http://localhost:5173) &

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
