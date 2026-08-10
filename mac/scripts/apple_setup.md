# Apple Developer setup for Dictaste (notarized Mac DMG)

**Cost:** $99/year (Apple Developer Program)  
**Apple Account:** jmat2019@icloud.com (already on this Mac)  
**Team today:** Personal free team `L85AF3V872` — **cannot** create Developer ID / notarize until paid Program is active.

**Canonical site:** https://dictaste.vercel.app  
**Install path after build scripts:** `/Applications/Dictaste.app` · `dist/Dictaste.dmg`

---

## Phase A — Enroll (you do this in browser, ~15–30 min)

1. Open **https://developer.apple.com/programs/enroll/**
2. Sign in with **jmat2019@icloud.com** (or the Apple ID you want for the business).
3. Choose **Individual** (simplest) unless you have a registered company (D‑U‑N‑S) ready.
4. Accept agreements, enter payment for **$99 USD**.
5. Wait for **activation email** (often minutes; sometimes up to 48h).
6. Confirm at **https://developer.apple.com/account** that membership status is **Active**.

When Active, Xcode → Settings → Accounts should show the team **without** “Personal Team” free-only limits.

---

## Phase B — Certificates (after membership Active)

### B1. Developer ID Application certificate

1. **https://developer.apple.com/account/resources/certificates/list**
2. **+** → **Developer ID Application** → Continue  
   (If greyed out, membership is not active yet.)
3. Create a CSR on your Mac:

```bash
open /System/Library/Frameworks/Security.framework/Versions/A/Resources/Keychain\ Access.app
```

In Keychain Access: **Certificate Assistant → Request a Certificate From a Certificate Authority…**

- User Email: your Apple ID email  
- Common Name: `Dictaste Developer ID`  
- Select **Saved to disk**  
- Save `CertificateSigningRequest.certSigningRequest`

4. Upload that CSR on the Apple page → Download `.cer` → double-click to install in **login** keychain.
5. Verify:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

You want a line like:  
`"Developer ID Application: Your Name (TEAMID)"`

### B2. App-specific password / API key for notarization

**Option (recommended): App Store Connect API key**

1. **https://appstoreconnect.apple.com/access/integrations/api**
2. Keys → **+** → name `DictasteNotary` → Access **Developer** or **Admin**
3. Download `AuthKey_XXXXXXXX.p8` **once** — store safely (e.g. `~/.appstoreconnect/private_keys/`)
4. Note **Issuer ID**, **Key ID**, **Team ID**

Then:

```bash
xcrun notarytool store-credentials "DictasteNotary" \
  --apple-id "jmat2019@icloud.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "app-specific-password"
```

Or with API key:

```bash
xcrun notarytool store-credentials "DictasteNotary" \
  --key ~/.appstoreconnect/private_keys/AuthKey_XXXXX.p8 \
  --key-id XXXXX \
  --issuer XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

**Option B: App-specific password**  
https://appleid.apple.com → Sign-In and Security → App-Specific Passwords → generate one for `notarytool`.

---

## Phase C — Build, sign, notarize DMG

```bash
cd /Users/john/Projects/FlowDictate   # local folder; product is Dictaste

# 1. Release build (Developer ID used by package script)
xcodebuild -project FlowDictate.xcodeproj -scheme FlowDictate \
  -configuration Release -derivedDataPath build \
  CODE_SIGN_IDENTITY="Developer ID Application" \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  CODE_SIGN_STYLE=Manual

# 2. Package + notarize
export CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export NOTARY_PROFILE=DictasteNotary
./scripts/package_dmg.sh

# Output: dist/Dictaste.dmg
# Or one-shot:
# ./scripts/release_ready.sh --notarize
```

---

## Phase D — Host DMG + wire website

1. Upload `dist/Dictaste.dmg` to a public URL (GitHub Release, Cloudflare R2, S3, Vercel Blob, etc.).
2. Set on Vercel Production project **dictaste**:

```bash
cd /Users/john/Projects/flowdictate-web
printf 'https://YOUR_PUBLIC_DMG_URL' | npx vercel env add NEXT_PUBLIC_DMG_URL production
npx vercel deploy --prod --yes
```

3. Confirm **https://dictaste.vercel.app/download** shows a real **Download for Mac** button after launch time.

---

## Phase E — Fresh Mac Gatekeeper test

On another Mac (or a fresh user account):

1. Download the DMG from the website  
2. Open → drag to Applications  
3. Launch — should **not** show “unidentified developer” if notarization stapled correctly  

```bash
spctl -a -vv /Applications/Dictaste.app
# expect: accepted, source=Notarized Developer ID
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No Developer ID option | Membership not active / wrong Apple ID |
| `notarytool` invalid credentials | Re-store credentials; check Team ID |
| Gatekeeper still blocks | Staple failed — re-run stapler; wait for “Accepted” notarization |
| Accessibility breaks after reinstall | Re-enable **Dictaste** in System Settings → Privacy → Accessibility |

After Phase D, tell the agent: **“DMG is live at \<url\>”** and we set `NEXT_PUBLIC_DMG_URL` + final smoke.
