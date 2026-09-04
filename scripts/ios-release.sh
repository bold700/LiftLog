#!/usr/bin/env bash
# LiftLog iOS-release: web bundle bouwen (met Vercel-API-origin), syncen, archiveren en uploaden naar TestFlight.
#
# Vereisten (eenmalig):
#   - Xcode geïnstalleerd, Apple ID van team YR94KX729G ingelogd (Xcode → Settings → Accounts)
#   - CocoaPods: brew install cocoapods
#
# Gebruik:
#   scripts/ios-release.sh            # bouw + sync + archive + upload
#   scripts/ios-release.sh --no-upload  # alleen bouwen + archiveren
#
# Versie/buildnummer ophogen vóór je dit draait:
#   package.json "version", ios/App/App.xcodeproj/project.pbxproj (MARKETING_VERSION + CURRENT_PROJECT_VERSION)
set -euo pipefail

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods struikelt anders over "Unicode Normalization not appropriate for ASCII-8BIT"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="$ROOT/ios/App/build/LiftLog.xcarchive"
UPLOAD=1
[[ "${1:-}" == "--no-upload" ]] && UPLOAD=0

cd "$ROOT"
echo "▶ Web bundle (native, API → lift-log-phi.vercel.app)"
npm run build:native

echo "▶ Capacitor sync iOS (kopieert dist + pod install)"
npx cap sync ios

echo "▶ Archive (Release)"
rm -rf "$ARCHIVE"
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates archive | grep -E "error:|warning: Signing|ARCHIVE (SUCCEEDED|FAILED)" || true
[[ -d "$ARCHIVE" ]] || { echo "✗ Archive mislukt"; exit 1; }

if [[ $UPLOAD -eq 1 ]]; then
  echo "▶ Upload naar App Store Connect / TestFlight"
  xcodebuild -exportArchive -archivePath "$ARCHIVE" \
    -exportOptionsPlist ios/App/ExportOptions.plist \
    -exportPath "$ROOT/ios/App/build/export" -allowProvisioningUpdates
  echo "✓ Geüpload. Verwerking duurt ~10-15 min, daarna zichtbaar in TestFlight."
else
  echo "✓ Archive staat in $ARCHIVE (open met: open ios/App/build)"
fi
