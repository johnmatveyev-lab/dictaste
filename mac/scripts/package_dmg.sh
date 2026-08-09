#!/usr/bin/env bash
# Package a signed + notarized Dictaste.app into a DMG for distribution.
# Prerequisites:
#   - Developer ID Application certificate in Keychain
#   - notarytool credentials (xcrun notarytool store-credentials)
#   - Release build outputs Dictaste.app (PRODUCT_NAME)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/build/Build/Products/Release/Dictaste.app}"
OUT_DIR="${2:-$ROOT/dist}"
IDENTITY="${CODESIGN_IDENTITY:-Developer ID Application:}"
NOTARY_PROFILE="${NOTARY_PROFILE:-DictasteNotary}"

if [[ ! -d "$APP" ]]; then
  echo "App not found: $APP"
  echo "Build Release first, e.g.:"
  echo "  xcodebuild -project FlowDictate.xcodeproj -scheme FlowDictate -configuration Release -derivedDataPath build"
  exit 1
fi

mkdir -p "$OUT_DIR"
STAGE="$OUT_DIR/dmg-stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"
# User-facing app name is Dictaste
cp -R "$APP" "$STAGE/Dictaste.app"

echo "→ Codesign (hardened runtime)"
codesign --force --deep --options runtime \
  --sign "$IDENTITY" \
  --timestamp \
  "$STAGE/Dictaste.app"

codesign --verify --deep --strict --verbose=2 "$STAGE/Dictaste.app"

DMG="$OUT_DIR/Dictaste.dmg"
rm -f "$DMG"
hdiutil create -volname "Dictaste" -srcfolder "$STAGE" -ov -format UDZO "$DMG"

echo "→ Notarize"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"

echo "Done: $DMG"
echo "Host this URL in NEXT_PUBLIC_DMG_URL on the website."
