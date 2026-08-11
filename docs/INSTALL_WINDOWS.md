# Install Dictaste on Windows

## Preview zip (0.1.15)

1. Download [Dictaste-Setup-0.1.15.zip](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.4/Dictaste-Setup-0.1.15.zip) or use [dictaste.vercel.app/download](https://dictaste.vercel.app/download).
2. Unzip → run **Dictaste.exe** (SmartScreen may warn — not code-signed yet; **More info → Run anyway**).
3. Tray icon → **Settings…** → paste license from the dashboard.
4. Hotkeys (remappable in Settings):
   - **Ctrl+Shift+Space** — start/stop dictation (polish + paste)
   - **Ctrl+Shift+R** — highlight-to-speak (selection or clipboard). Free system SAPI voices; Pro managed premium TTS when licensed. Same hotkey stops.
5. Tray menu: **Read selection**, **Copy last transcript**, **Test voice**, **Recent transcripts**, **Unlock free Developer plan**, **Pricing**, **Check for updates…**, **Help / Issues**, **Star on GitHub**, **Download page**.

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

- Settings → **Test voice** to preview SAPI or premium with current rate/voice.
- Settings → **After paste** (space / newline / period) for chaining dictations.
- Settings → **Dictation language** for Web Speech and Whisper (20 locales).
- Settings → **Recent transcripts** (last 10) — click to copy; also in tray submenu.
- Settings → **SAPI system voice** + speech rate for free offline highlight-to-speak.
- Settings → **Launch Dictaste at Windows sign-in** for always-on hotkeys.
- Quiet notifications: errors & updates only (optional).
- Startup silently checks for newer Setup builds.

## License usage meter

Settings → paste license → **Refresh plan** shows plan, polish words, and premium TTS chars (same `/api/v1/me` as Mac).
