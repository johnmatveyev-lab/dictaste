# Install Dictaste on Windows

## Preview zip (0.1.12)

1. Download [Dictaste-Setup-0.1.12.zip](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.4/Dictaste-Setup-0.1.12.zip) or use [dictaste.vercel.app/download](https://dictaste.vercel.app/download).
2. Unzip → run **Dictaste.exe** (SmartScreen may warn — not code-signed yet; **More info → Run anyway**).
3. Tray icon → **Settings…** → paste license from the dashboard.
4. Hotkeys (remappable in Settings):
   - **Ctrl+Shift+Space** — start/stop dictation (polish + paste)
   - **Ctrl+Shift+R** — highlight-to-speak (selection or clipboard). Free system SAPI voices; Pro managed premium TTS when licensed. Same hotkey stops.
5. Tray menu: **Read selection**, **Copy last transcript**, **Unlock free Developer plan**, **Pricing**, **Check for updates…**, **Help / Issues**, **Star on GitHub**, **Download page**.

## From source

```bash
git clone https://github.com/johnmatveyev-lab/dictaste.git
cd dictaste/windows
npm install
npm start
```

Pack portable zip: `npm run pack:zip` (requires electron-builder).

## License + BYO key

Same as Mac: star this repo → [developer setup](https://dictaste.vercel.app/developers/setup) → paste license + your LLM key in Settings.

## Tips

- Settings → **SAPI system voice** + speech rate for free offline highlight-to-speak.
- Settings → **Premium neural voice** when on Pro or BYO OpenAI key.
- Settings → **Launch Dictaste at Windows sign-in** for always-on hotkeys.
- Paste your OpenAI key for Developer-plan premium highlight-to-speak (BYO).
- Quiet notifications: errors & updates only (optional).
- Startup silently checks for newer Setup builds.

## License usage meter

Settings → paste license → **Refresh plan** shows plan, polish words, and premium TTS chars (same `/api/v1/me` as Mac).
