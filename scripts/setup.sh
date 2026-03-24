#!/bin/bash
set -e

echo "=== Setting up Ledgr ==="

cd "$(dirname "$0")/.."

# beancount requires bison >= 3.8 to build
if ! command -v bison &>/dev/null || [ "$(bison --version | head -1 | grep -oE '[0-9]+\.[0-9]+')" \< "3.8" ]; then
  echo "Error: bison >= 3.8 is required but not found in PATH."
  echo "Install it with: brew install bison"
  echo "Then add it to your PATH: export PATH=\"/opt/homebrew/opt/bison/bin:\$PATH\""
  exit 1
fi

# Backend
echo "→ Setting up Python backend..."
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Generate fixture
echo "→ Generating example data..."
mkdir -p data
source backend/.venv/bin/activate
bean-example --seed 42 -o data/example.beancount
bean-check data/example.beancount && echo "  ✓ Example file valid"

# Frontend
echo "→ Setting up React frontend..."
cd frontend
npm install
cd ..

echo ""
echo "=== Setup complete ==="
echo "Run ./scripts/dev.sh to start development"
