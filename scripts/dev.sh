#!/bin/bash
set -e

cd "$(dirname "$0")/.."

BEANCOUNT_FILE="${1:-data/example.beancount}"

if [ ! -f "$BEANCOUNT_FILE" ]; then
  echo "Error: file not found: $BEANCOUNT_FILE"
  exit 1
fi

export BEANCOUNT_FILE="$(cd "$(dirname "$BEANCOUNT_FILE")" && pwd)/$(basename "$BEANCOUNT_FILE")"

# Start backend
echo "Starting backend on :8080..."
echo "  Ledger file: $BEANCOUNT_FILE"
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8080 &
BACKEND_PID=$!
cd ..

# Start frontend
echo "Starting frontend on :5173..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Ledgr running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8080"
echo "  API docs: http://localhost:8080/docs"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
