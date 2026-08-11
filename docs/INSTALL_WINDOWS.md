# Install Dictaste on Windows

## Preview zip (0.1.9)

1. Download [Dictaste-Setup-0.1.9.zip](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.6/Dictaste-Setup-0.1.9.zip) or use [dictaste.vercel.app/download](https://dictaste.vercel.app/download).
2. Unzip → run **Dictaste.exe** (SmartScreen may warn — not code-signed yet; **More info → Run anyway**).
3. Tray icon → **Settings…** → paste license from the dashboard.
4. Hotkeys (remappable in Settings):
   - **Ctrl+Shift+Space** — start/stop dictation (polish + paste)
   - **Ctrl+Shift+R** — highlight-to-speak (selection or clipboard). Free system SAPI voices; Pro managed premium TTS when licensed. Same hotkey stops.
5. Tray menu: **Read selection**, **Unlock free Developer plan**, **Pricing**, **Check for updates…**, **Help / Issues**, **Star on GitHub**, **Download page**.

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

- Settings → **Launch Dictaste at Windows sign-in** for always-on hotkeys.
- Paste your OpenAI key for Developer-plan premium highlight-to-speak (BYO).


## License usage meter

Settings → paste license → **Refresh plan** shows plan, polish words, and premium TTS chars (same `/api/v1/me` as Mac).
