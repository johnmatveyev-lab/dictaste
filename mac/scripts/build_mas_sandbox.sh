#!/usr/bin/env bash
# Local Mac App Store / App Sandbox spike build.
# Does NOT touch the Developer ID / notarized DMG path.
# Uses Apple Development by default so no App Store secrets are required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEAM="${DEVELOPMENT_TEAM:-L85AF3V872}"
IDENTITY="${CODE_SIGN_IDENTITY:-Apple Development}"
DERIVED="${DERIVED_DATA_PATH:-$ROOT/build/DerivedData-mas}"

if command -v xcodegen >/dev/null 2>&1; then
  echo "→ xcodegen generate"
  xcodegen generate
fi

echo "→ Team: $TEAM"
echo "→ Identity: $IDENTITY"
echo "→ Scheme: FlowDictate-MAS / ReleaseMAS (App Sandbox ON)"

xcodebuild \
  -project FlowDictate.xcodeproj \
  -scheme FlowDictate-MAS \
  -configuration ReleaseMAS \
  -derivedDataPath "$DERIVED" \
  CODE_SIGN_IDENTITY="$IDENTITY" \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGNING_REQUIRED=YES \
  build

APP="$DERIVED/Build/Products/ReleaseMAS/Dictaste.app"
echo "→ Built: $APP"
echo ""
echo "Verify sandbox entitlements:"
codesign -d --entitlements - "$APP" 2>/dev/null | plutil -p - 2>/dev/null \
  || codesign -d --entitlements :- "$APP" 2>&1 || true
echo ""
echo "Install to /Applications (or run from DerivedData) and follow mac/docs/MAS_SANDBOX_SPIKE.md"
