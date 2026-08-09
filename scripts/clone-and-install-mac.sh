#!/usr/bin/env bash
set -euo pipefail
REPO="${DICTASTE_REPO:-https://github.com/johnmatveyev-lab/dictaste.git}"
DIR="${1:-dictaste}"
git clone "$REPO" "$DIR"
cd "$DIR/mac"
command -v xcodegen >/dev/null || brew install xcodegen
xcodegen generate
chmod +x scripts/install_local.sh
./scripts/install_local.sh
echo "Installed Dictaste.app — star the repo and unlock at https://dictaste.vercel.app/developers/setup"
