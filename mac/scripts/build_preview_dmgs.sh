#!/usr/bin/env bash
# Build unsigned developer-preview DMGs for Apple Silicon (arm64) and Intel (x86_64).
# Requires: xcodegen, Xcode, Apple Development signing identity.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist"
TEAM="${DEVELOPMENT_TEAM:-L85AF3V872}"
IDENTITY="${CODE_SIGN_IDENTITY:-Apple Development}"
VERSION="${MARKETING_VERSION:-0.1.0}"

cd "$ROOT"
command -v xcodegen >/dev/null && xcodegen generate

mkdir -p "$OUT"
rm -rf "$OUT/Dictaste-arm64.app" "$OUT/Dictaste-intel.app" \
  "$OUT/Dictaste-${VERSION}-arm64-unsigned.dmg" \
  "$OUT/Dictaste-${VERSION}-intel-unsigned.dmg" \
  "$OUT/stage-arm64" "$OUT/stage-intel"

build_arch() {
  local arch="$1"
  local label="$2"
  local derived="$ROOT/build/DerivedData-$arch"
  echo "→ Building $label ($arch) · deployment 13.0+"
  rm -rf "$derived"
  xcodebuild \
    -project FlowDictate.xcodeproj \
    -scheme FlowDictate \
    -configuration Release \
    -derivedDataPath "$derived" \
    ARCHS="$arch" \
    ONLY_ACTIVE_ARCH=NO \
    MACOSX_DEPLOYMENT_TARGET=13.0 \
    CODE_SIGN_IDENTITY="$IDENTITY" \
    DEVELOPMENT_TEAM="$TEAM" \
    CODE_SIGN_STYLE=Manual \
    CODE_SIGNING_ALLOWED=YES \
    CODE_SIGNING_REQUIRED=YES \
    build

  local app="$derived/Build/Products/Release/Dictaste.app"
  if [[ ! -d "$app" ]]; then
    echo "Missing app at $app" >&2
    exit 1
  fi

  # Verify arch
  file "$app/Contents/MacOS/Dictaste" || file "$app/Contents/MacOS/"*
  local min
  min=$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$app/Contents/Info.plist" 2>/dev/null || echo "?")
  echo "   LSMinimumSystemVersion=$min"

  local stage="$OUT/stage-$label"
  rm -rf "$stage"
  mkdir -p "$stage"
  ditto "$app" "$stage/Dictaste.app"
  xattr -dr com.apple.quarantine "$stage/Dictaste.app" 2>/dev/null || true

  local dmg="$OUT/Dictaste-${VERSION}-${label}-unsigned.dmg"
  rm -f "$dmg"
  hdiutil create -volname "Dictaste ${label}" -srcfolder "$stage" -ov -format UDZO "$dmg"
  echo "✓ $dmg"
  ls -lh "$dmg"
}

build_arch arm64 arm64
build_arch x86_64 intel

echo ""
echo "Done. Upload both DMGs to GitHub Releases and set:"
echo "  NEXT_PUBLIC_DMG_URL_ARM64=..."
echo "  NEXT_PUBLIC_DMG_URL_INTEL=..."
echo "  NEXT_PUBLIC_DMG_URL=...  (default: prefer arm64 or universal landing)"
