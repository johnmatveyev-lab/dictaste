#!/bin/bash
# Install Dictaste to /Applications with a stable Apple Development signature.
# PRODUCT_NAME is Dictaste; Xcode target/scheme may still be named FlowDictate.
# Do NOT ad-hoc re-sign after copy — that breaks Accessibility TCC every rebuild.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SRC="$ROOT/build/Build/Products/Release/Dictaste.app"
APP_DST="/Applications/Dictaste.app"

cd "$ROOT"
xcodebuild -project FlowDictate.xcodeproj -scheme FlowDictate -configuration Release \
  -derivedDataPath build \
  CODE_SIGN_IDENTITY="Apple Development" \
  DEVELOPMENT_TEAM=L85AF3V872 \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGNING_REQUIRED=YES

pkill -x FlowDictate 2>/dev/null || true
pkill -x Dictaste 2>/dev/null || true
sleep 0.4
# Remove legacy install path if present
rm -rf /Applications/FlowDictate.app "$APP_DST"
ditto "$APP_SRC" "$APP_DST"
xattr -dr com.apple.quarantine "$APP_DST" 2>/dev/null || true

echo "Installed Dictaste:"
codesign -dv --verbose=2 "$APP_DST" 2>&1 | grep -E 'Authority|TeamIdentifier|Identifier' || true
open "$APP_DST"
echo "Done. If Accessibility is off, enable Dictaste for $APP_DST then use Relaunch in setup."
