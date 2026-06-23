#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORTABLE_NODE="./.portable-node/node-v22.11.0-darwin-arm64/bin"
if [ -x "$PORTABLE_NODE/npm" ]; then
  export PATH="$PWD/$PORTABLE_NODE:$PATH"
fi

export npm_config_cache="${TMPDIR:-/tmp}/npm-cache"

echo "林非凡交易研究中心 starting..."
echo "Open http://127.0.0.1:3000/ after Next.js reports Ready."

npm run dev -- --hostname 127.0.0.1
