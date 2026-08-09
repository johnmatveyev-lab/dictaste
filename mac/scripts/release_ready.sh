#!/usr/bin/env bash
# Build a release-ready Dictaste.app for notarization the moment Apple
# Developer Program is Active. Does NOT require Developer ID yet — falls back
# to Apple Development so the binary is always buildable while waiting.
#
# After membership is Active:
#   export CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
#   export DEVELOPMENT_TEAM=YOUR_TEAM_ID
#   export NOTARY_PROFILE=DictasteNotary
#   ./scripts/release_ready.sh --notarize
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NOTARIZE=0
for arg in "$@"; do
  case "$arg" in
    --notarize) NOTARIZE=1 ;;
  esac
done

TEAM="${DEVELOPMENT_TEAM:-L85AF3V872}"
# Prefer Developer ID if present in Keychain; else Apple Development.
if [[ -z "${CODESIGN_IDENTITY:-}" ]]; then
  if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
    CODESIGN_IDENTITY=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -1)
  else
    CODESIGN_IDENTITY="Apple Development"
  fi
fi

echo "→ Team: $TEAM"
echo "→ Identity: $CODESIGN_IDENTITY"
echo "→ Building Release…"

HARDENED=NO
if [[ "$CODESIGN_IDENTITY" == Developer\ ID* ]]; then
  HARDENED=YES
fi

xcodebuild -project FlowDictate.xcodeproj -scheme FlowDictate \
  -configuration Release -derivedDataPath build \
  CODE_SIGN_IDENTITY="$CODESIGN_IDENTITY" \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Manual \
  ENABLE_HARDENED_RUNTIME="$HARDENED" \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGNING_REQUIRED=YES

APP_BUILT="$ROOT/build/Build/Products/Release/Dictaste.app"
echo "→ Built: $APP_BUILT"
codesign -dv --verbose=2 "$APP_BUILT" 2>&1 | grep -E 'Authority|TeamIdentifier|Identifier|Signature' || true

# Stage a clean copy for packaging / installers
mkdir -p "$ROOT/dist"
rm -rf "$ROOT/dist/Dictaste.app" "$ROOT/dist/FlowDictate.app"
ditto "$APP_BUILT" "$ROOT/dist/Dictaste.app"
xattr -cr "$ROOT/dist/Dictaste.app" 2>/dev/null || true

if [[ "$NOTARIZE" -eq 1 ]]; then
  if [[ "$CODESIGN_IDENTITY" != Developer\ ID* ]]; then
    echo "ERROR: --notarize requires a Developer ID Application certificate."
    echo "Install it from developer.apple.com after membership is Active, then re-run."
    exit 1
  fi
  if ! xcrun notarytool history --keychain-profile "${NOTARY_PROFILE:-DictasteNotary}" >/dev/null 2>&1; then
    echo "ERROR: notarytool profile missing. Create with:"
    echo "  xcrun notarytool store-credentials DictasteNotary --apple-id YOU --team-id TEAM --password APP_SPECIFIC_PASSWORD"
    exit 1
  fi
  "$ROOT/scripts/package_dmg.sh" "$ROOT/dist/Dictaste.app" "$ROOT/dist"
else
  # Ad-hoc DMG for internal testing (not Gatekeeper-clean without notarization)
  DMG="$ROOT/dist/Dictaste-unsigned.dmg"
  rm -f "$DMG"
  hdiutil create -volname "Dictaste" -srcfolder "$ROOT/dist/Dictaste.app" -ov -format UDZO "$DMG"
  echo "→ Internal DMG (not notarized): $DMG"
  echo ""
  echo "When Apple membership is Active:"
  echo "  1) Create Developer ID Application cert"
  echo "  2) xcrun notarytool store-credentials DictasteNotary …"
  echo "  3) ./scripts/release_ready.sh --notarize"
  echo "  4) Host dist/Dictaste.dmg → NEXT_PUBLIC_DMG_URL on Vercel"
fi

echo "✓ Release artifacts ready under dist/"
