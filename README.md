# Dictaste

**Speak it. Ship it.**  
Open-source **Mac & Windows** dictation + highlight-to-speak clients.

[![Site](https://img.shields.io/badge/site-dictaste.vercel.app-C8F542?style=flat-square)](https://dictaste.vercel.app)
[![Developer free](https://img.shields.io/badge/developers-free%20with%20★-C8F542?style=flat-square)](https://dictaste.vercel.app/developers)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](./LICENSE)

> **★ Star this repo** to unlock the free **Developer** plan — unlimited AI polish with **your own LLM API key** (costs us nothing; free for you for life).

---

## What is open vs hosted

| Open in this repo (Apache-2.0) | Hosted product (private) |
|--------------------------------|---------------------------|
| **mac/** — native Swift menu-bar app | Website, Clerk auth, Stripe billing |
| **windows/** — Electron tray MVP | Managed polish / TTS APIs |
| Docs, install scripts, Releases | Entitlements & affiliate backend |

You get **full client source**. The revenue SaaS stays private. That is intentional.

---

## Free for developers (lifetime)

1. **★ Star this repository**
2. Open [dictaste.vercel.app/developers/setup](https://dictaste.vercel.app/developers/setup) → sign in → verify your GitHub username  
3. Copy your license key (`dt_live_…`)
4. Install Dictaste → **Account** → paste license + **your** OpenAI-compatible API key  

Full walkthrough: [docs/DEVELOPER_SETUP.md](./docs/DEVELOPER_SETUP.md)

**Pro / Pro Plus** ($4 / $8): managed polish without bringing a key → [pricing](https://dictaste.vercel.app/#pricing)

**Affiliates:** **30%** commission when you share Dictaste → [affiliate program](https://dictaste.vercel.app/affiliate)

---

## Repository layout

```
mac/          Native macOS app (Swift / XcodeGen)
windows/      Windows tray app (Electron)
docs/         Install + developer setup
scripts/      Helper install scripts
```

---

## Install on macOS

**Requirements:** macOS 13 Ventura+ · Microphone + Accessibility (+ Speech Recognition)

### Option A — Notarized DMG (recommended)

Developer ID signed + Apple notarized. Open the DMG → drag **Dictaste** to Applications.

- **Apple Silicon:** [Dictaste-0.1.4-arm64.dmg](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.4/Dictaste-0.1.4-arm64.dmg)  
- **Intel:** [Dictaste-0.1.4-intel.dmg](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.4/Dictaste-0.1.4-intel.dmg)  
- Also: [dictaste.vercel.app/download](https://dictaste.vercel.app/download)

### Option B — Build from source

```bash
git clone https://github.com/johnmatveyev-lab/dictaste.git
cd dictaste/mac
brew install xcodegen   # once
xcodegen generate
chmod +x scripts/install_local.sh
./scripts/install_local.sh
# → /Applications/Dictaste.app
```

Details: [docs/INSTALL_MAC.md](./docs/INSTALL_MAC.md)

---

## Install on Windows

**Requirements:** Windows 10/11 x64

### Option A — Preview zip

- [Dictaste-Setup-0.1.56.zip](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.4/Dictaste-Setup-0.1.56.zip) · encode last · sort lines last · slugify last · wrap last · reformat last · paste UUID/ID · paste date/time · clear clipboard privacy · local session stats · test BYO keys · merge history · NVIDIA NIM · snippets · reorder history · pin history · edit history · read aloud · history search · copy all · tray plan/usage · delete history item · undo last · append joiner · HUD mode chips · append to last · continuous · tray quick toggles · sticky HUD · tray speech rate · re-polish last · support diagnostics · live HUD word count · re-read last · clear history · skip short polish · data folder · reset hotkeys · word-count toast · import history · smart quotes · compact HUD · tray language · case modes · paste from history · history size · timed pause · persist pause · double-space period · max duration · silence auto-stop · paste delay · cancel · paste last · spoken punctuation · strip fillers · pause hotkeys · export settings · highlight-to-speak  
- Or [Releases](https://github.com/johnmatveyev-lab/dictaste/releases/tag/v0.1.4) / [download page](https://dictaste.vercel.app/download)  
- Unzip → run **Dictaste.exe** (SmartScreen may warn) → tray → Settings → paste license  

### Option B — Run / build from source

```bash
git clone https://github.com/johnmatveyev-lab/dictaste.git
cd dictaste/windows
npm install
npm start
# pack portable zip:
npm run pack:zip
```

Details: [docs/INSTALL_WINDOWS.md](./docs/INSTALL_WINDOWS.md)

---

## After install

1. Menu bar / tray → **Account & Settings**  
2. Paste **license** (`dt_live_…`)  
3. Developer plan: paste **your LLM API key**  
4. Hold **fn 🌐** (Mac) to dictate · highlight text to hear it  

---

## Contributing

Issues and PRs on **client** code welcome. For product/billing bugs, use the site or Issues with the `hosted` label.

Please do not open PRs that re-implement or proxy the private managed API for free unlimited use.

---

## License

Client source: [Apache License 2.0](./LICENSE).  
Trademark: **Dictaste** name/logo reserved.  
Hosted service at dictaste.vercel.app is proprietary.

---

## Related

| Repo | Role |
|------|------|
| **This repo** | Public clients + star unlock |
| `dictaste-mac` / `dictaste-windows` | Historical mirrors (prefer this monorepo) |
| `dictaste-web` | Private website + API (not public) |
