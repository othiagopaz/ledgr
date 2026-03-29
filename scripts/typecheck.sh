#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "Running basedpyright type checker..."
basedpyright
