#!/bin/bash
set -e

echo "=== Setting up Ledgr ==="

cd "$(dirname "$0")/.."

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
