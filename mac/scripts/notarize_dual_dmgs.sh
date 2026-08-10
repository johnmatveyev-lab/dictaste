#!/usr/bin/env bash
# Build arm64 + Intel Release DMGs, Developer ID sign, notarize, staple.
# Prerequisites:
#   - "Developer ID Application: …" in Keychain
#   - xcrun notarytool store-credentials DictasteNotary …
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="$ROOT/dist"
VERSION="${MARKETING_VERSION:-0.1.4}"
NOTARY_PROFILE="${NOTARY_PROFILE:-DictasteNotary}"

# Resolve identity
if [[ -z "${CODESIGN_IDENTITY:-}" ]]; then
  CODESIGN_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -1 || true)
fi
if [[ -z "${CODESIGN_IDENTITY:-}" ]]; then
  echo "ERROR: No Developer ID Application certificate in Keychain."
  echo "Create one at https://developer.apple.com/account/resources/certificates/add"
  echo "Upload CSR: ~/.dictaste-apple/CertificateSigningRequest.certSigningRequest"
  echo "Double-click the downloaded .cer to install, then re-run."
  exit 1
fi

# Team ID from identity string (TEAMID)
if [[ -z "${DEVELOPMENT_TEAM:-}" ]]; then
  DEVELOPMENT_TEAM=$(echo "$CODESIGN_IDENTITY" | sed -n 's/.*(\([^)]*\)).*/\1/p')
fi

if ! xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1; then
  echo "ERROR: notarytool profile '$NOTARY_PROFILE' missing."
  echo "Create app-specific password at https://appleid.apple.com → App-Specific Passwords"
  echo "Then:"
  echo "  xcrun notarytool store-credentials $NOTARY_PROFILE \\"
  echo "    --apple-id \"jmat2019@icloud.com\" \\"
  echo "    --team-id \"$DEVELOPMENT_TEAM\" \\"
  echo "    --password \"xxxx-xxxx-xxxx-xxxx\""
  exit 1
fi

echo "→ Identity: $CODESIGN_IDENTITY"
echo "→ Team:     $DEVELOPMENT_TEAM"
echo "→ Version:  $VERSION"
echo "→ Profile:  $NOTARY_PROFILE"

command -v xcodegen >/dev/null && xcodegen generate

mkdir -p "$OUT"
ENTITLEMENTS="$ROOT/scripts/Dictaste.entitlements"
if [[ ! -f "$ENTITLEMENTS" ]]; then
  cat > "$ENTITLEMENTS" <<'ENT'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.automation.apple-events</key>
  <true/>
  <key>com.apple.security.device.audio-input</key>
  <true/>
  <key>com.apple.security.personal-information.addressbook</key>
  <false/>
</dict>
</plist>
ENT
fi

build_and_package() {
  local arch="$1"
  local label="$2"
  local derived="$ROOT/build/DerivedData-notarize-$arch"
  echo ""
  echo "═══ Building $label ($arch) ═══"
  rm -rf "$derived"
  xcodebuild \
    -project FlowDictate.xcodeproj \
    -scheme FlowDictate \
    -configuration Release \
    -derivedDataPath "$derived" \
    ARCHS="$arch" \
    ONLY_ACTIVE_ARCH=YES \
    MACOSX_DEPLOYMENT_TARGET=13.0 \
    CODE_SIGN_IDENTITY="$CODESIGN_IDENTITY" \
    DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
    CODE_SIGN_STYLE=Manual \
    ENABLE_HARDENED_RUNTIME=YES \
    CODE_SIGNING_ALLOWED=YES \
    CODE_SIGNING_REQUIRED=YES \
    OTHER_CODE_SIGN_FLAGS="--timestamp --options=runtime" \
    build

  local app="$derived/Build/Products/Release/Dictaste.app"
  [[ -d "$app" ]] || { echo "Missing $app"; exit 1; }

  # Re-sign deep with hardened runtime + entitlements for notarization
  echo "→ Deep codesign $label"
  # Sign nested frameworks/binaries first if any
  find "$app" -type f \( -name "*.dylib" -o -name "*.so" -o -perm +111 \) 2>/dev/null | while read -r bin; do
    file "$bin" | grep -q 'Mach-O' || continue
    codesign --force --options runtime --timestamp --sign "$CODESIGN_IDENTITY" "$bin" 2>/dev/null || true
  done
  codesign --force --deep --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$CODESIGN_IDENTITY" \
    "$app"
  codesign --verify --deep --strict --verbose=2 "$app"
  spctl -a -vv "$app" 2>&1 || true

  local stage="$OUT/stage-notarize-$label"
  rm -rf "$stage"
  mkdir -p "$stage"
  ditto "$app" "$stage/Dictaste.app"
  xattr -cr "$stage/Dictaste.app" 2>/dev/null || true

  local dmg="$OUT/Dictaste-${VERSION}-${label}.dmg"
  rm -f "$dmg"
  hdiutil create -volname "Dictaste" -srcfolder "$stage" -ov -format UDZO "$dmg"

  echo "→ Notarize $dmg"
  xcrun notarytool submit "$dmg" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
  # Also staple app inside a copy for local install testing
  echo "✓ $dmg"
  ls -lh "$dmg"
  spctl -a -t open --context context:primary-signature -vv "$dmg" 2>&1 || true
}

build_and_package arm64 arm64
build_and_package x86_64 intel

# Symlink/default
cp -f "$OUT/Dictaste-${VERSION}-arm64.dmg" "$OUT/Dictaste.dmg" 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════"
echo " Notarized DMGs ready:"
ls -lh "$OUT"/Dictaste-${VERSION}-*.dmg
echo ""
echo " Next: upload to GitHub Releases + set Vercel env"
echo "═══════════════════════════════════════════════════"
