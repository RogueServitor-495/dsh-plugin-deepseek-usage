#!/usr/bin/env bash
# Start a standalone dsh web instance with the DeepSeek usage plugin,
# using the workspace-local DSH home (no changes to ~/.dsh).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME="$HERE/dsh-home" \
  node /Users/snake/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/lib/bin.js \
    --profile web --port 3081
