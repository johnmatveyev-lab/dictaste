# Apple Developer ID — do these clicks now (~10 min)

Account accepted. This Mac still only has **Apple Development**. Notarization needs **Developer ID Application** + notary credentials.

## 1) Developer ID Application certificate

1. Browser should be open on **Certificates** (or open https://developer.apple.com/account/resources/certificates/add )
2. Choose **Developer ID Application** → Continue  
3. Upload CSR:  
   `~/.dictaste-apple/CertificateSigningRequest.certSigningRequest`  
   (Finder window opened for you)
4. Download the `.cer` → **double-click** to install in **login** keychain  
5. Verify in Terminal:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

You need a line like:  
`"Developer ID Application: John Matveyev (XXXXXXXXXX)"`

**Note your Team ID** in parentheses — paid team may differ from free `L85AF3V872`.

## 2) Notary credentials (app-specific password)

1. https://appleid.apple.com → Sign-In and Security → **App-Specific Passwords**  
2. Generate password named `DictasteNotary`  
3. Run (replace TEAMID and the password):

```bash
xcrun notarytool store-credentials "DictasteNotary" \
  --apple-id "jmat2019@icloud.com" \
  --team-id "TEAMID" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

## 3) Tell me “certs done” (or paste Team ID)

I will run:

```bash
cd /Users/john/Projects/FlowDictate
./scripts/notarize_dual_dmgs.sh
```

Then publish arm64 + Intel DMGs to GitHub Releases and wire Vercel download URLs.

## Alternative: App Store Connect API key

https://appstoreconnect.apple.com/access/integrations/api  
Create key → download `.p8` →:

```bash
mkdir -p ~/.appstoreconnect/private_keys
# move AuthKey_XXX.p8 there
xcrun notarytool store-credentials "DictasteNotary" \
  --key ~/.appstoreconnect/private_keys/AuthKey_XXX.p8 \
  --key-id XXX \
  --issuer YOUR-ISSUER-UUID
```
