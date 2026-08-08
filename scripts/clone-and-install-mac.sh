#!/usr/bin/env bash
# Clone Mac source and install Dictaste.app (developers)
set -euo pipefail
DIR="${1:-$HOME/src/dictaste-mac}"
echo "→ Cloning into $DIR"
if [ ! -d "$DIR/.git" ]; then
  git clone https://github.com/johnmatveyev-lab/dictaste-mac.git "$DIR"
fi
cd "$DIR"
if ! command -v xcodegen >/dev/null; then
  echo "Install xcodegen: brew install xcodegen"
  exit 1
fi
xcodegen generate
chmod +x scripts/install_local.sh
./scripts/install_local.sh
echo "→ Next: https://dictaste.vercel.app/developers/setup"
