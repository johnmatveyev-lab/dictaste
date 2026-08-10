# Dictaste for macOS

Native menu bar app — system-wide dictation + highlight-to-speak.

**Canonical repo (star for free Developer plan):** https://github.com/johnmatveyev-lab/dictaste  
**Product:** https://dictaste.vercel.app  

## Build

```bash
cd mac
brew install xcodegen
xcodegen generate
./scripts/install_local.sh
```

**Important:** Always open Dictaste from **/Applications** after install. Running from a DMG uses App Translocation and Accessibility permissions will not stick.

## License

Apache-2.0 — see [../LICENSE](../LICENSE).
