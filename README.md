# Dictaste

**Speak it. Ship it.**  
AI dictation + highlight-to-speak for **macOS** and **Windows**.

[![Site](https://img.shields.io/badge/site-dictaste.vercel.app-C8F542?style=flat-square)](https://dictaste.vercel.app)
[![Developer free](https://img.shields.io/badge/developers-free%20with%20★-C8F542?style=flat-square)](https://dictaste.vercel.app/developers)

> **★ Star this repo** to unlock the free **Developer** plan (unlimited polish with your own LLM API key).

---

## Free for developers (3 minutes)

1. **Star this repository** (button at the top right → ★ Star)
2. **Sign in** at [dictaste.vercel.app/developers/setup](https://dictaste.vercel.app/developers/setup)
3. Enter your **GitHub username** → **Verify star & unlock** → copy your license key (`dt_live_…`)
4. **Install** Dictaste (Mac or Windows below) → paste license + your OpenAI-compatible API key

Full walkthrough: [docs/DEVELOPER_SETUP.md](./docs/DEVELOPER_SETUP.md)

---

## Install on macOS

**Requirements:** macOS 14+ · Microphone + Accessibility permissions

### Option A — Developer preview DMG (unsigned)

Download **Dictaste** for Mac now (Gatekeeper will warn until Apple notarization):

- [Dictaste-0.1.0-unsigned.dmg](https://github.com/johnmatveyev-lab/dictaste-mac/releases/download/v0.1.0-preview/Dictaste-0.1.0-unsigned.dmg)
- Site: [dictaste.vercel.app/download](https://dictaste.vercel.app/download)
- Release notes: [v0.1.0-preview](https://github.com/johnmatveyev-lab/dictaste-mac/releases/tag/v0.1.0-preview)

First open: right-click **Dictaste** → **Open**. Notarized installer ships after Apple Developer ID.

### Option B — Build from source (developers)

```bash
# 1. Clone the Mac app source
git clone https://github.com/johnmatveyev-lab/dictaste-mac.git
cd dictaste-mac

# 2. Generate Xcode project & install as Dictaste.app
brew install xcodegen   # if needed
xcodegen generate
chmod +x scripts/install_local.sh
./scripts/install_local.sh
# → /Applications/Dictaste.app
```

Then:

1. Open **Dictaste** from Applications (menu bar icon)
2. Grant **Microphone** + **Accessibility** when asked
3. Menu bar → **Account & Settings…**
4. Paste **license key** + **your LLM API key**
5. Hold **fn 🌐** to dictate · highlight text to hear it read aloud

More detail: [docs/INSTALL_MAC.md](./docs/INSTALL_MAC.md)

---

## Install on Windows

**Requirements:** Windows 10/11 x64

### Option A — Developer preview zip (unsigned)

Download the portable **Dictaste** Windows build now (SmartScreen may warn — unsigned):

- [Dictaste-Setup-0.1.0.zip](https://github.com/johnmatveyev-lab/dictaste-windows/releases/download/v0.1.0-preview/Dictaste-Setup-0.1.0.zip)
- Site: [dictaste.vercel.app/download](https://dictaste.vercel.app/download)
- Release notes: [v0.1.0-preview](https://github.com/johnmatveyev-lab/dictaste-windows/releases/tag/v0.1.0-preview)

Unzip → run **Dictaste.exe** → tray → **Settings** → paste license. NSIS Setup.exe ships when CI packaging is unblocked.

### Option B — Run from source (developers)

```powershell
git clone https://github.com/johnmatveyev-lab/dictaste-windows.git
cd dictaste-windows
npm install
npm start
```

- Hotkey: **Ctrl+Shift+Space** (toggle listen)
- Tray icon → **Settings** → paste license + optional API keys
- Portable zip (macOS/Linux cross-build): `npm run pack:zip` → `dist/Dictaste-Setup-*.zip`
- NSIS installer (on Windows): `npm run dist` → `dist/Dictaste-Setup-*.exe`

More detail: [docs/INSTALL_WINDOWS.md](./docs/INSTALL_WINDOWS.md)

---

## What you get

| Plan | How | Polish |
|------|-----|--------|
| **Free** | Download + sign up | Managed polish (daily limit) |
| **Developer** | ★ Star this repo + BYO key | Unlimited on *your* API key |
| **Pro / Pro Plus** | Paid | Managed polish + premium TTS |

- Site & billing: https://dictaste.vercel.app  
- Support: support@dictaste.com  

---

## Related repositories

| Repo | Purpose | Visibility |
|------|---------|------------|
| **This repo** (`dictaste`) | Star unlock + install docs | Public |
| [`dictaste-mac`](https://github.com/johnmatveyev-lab/dictaste-mac) | Native macOS app source | Private (collaborators) / access via install path |
| [`dictaste-windows`](https://github.com/johnmatveyev-lab/dictaste-windows) | Windows Electron MVP | Public |

Website/API source is **not** in this repo (kept private for security).

---

## Brand

**Dictaste** · Speak it. Ship it.  
Lime `#C8F542` · Magenta `#FF2D95` · Dark `#0A0A0B`

---

## License

App binaries and trademarks © Dictaste.  
Star this repo to support development and unlock the free Developer plan.
