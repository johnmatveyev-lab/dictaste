# Install Dictaste on Windows

## Preview zip (0.1.1)

1. Download [Dictaste-Setup-0.1.1.zip](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.4/Dictaste-Setup-0.1.1.zip) or use [dictaste.vercel.app/download](https://dictaste.vercel.app/download).
2. Unzip → run **Dictaste.exe** (SmartScreen may warn — not code-signed yet).
3. Tray icon → **Settings…** → paste license from the dashboard.
4. Hotkey: **Ctrl+Shift+Space** to start/stop dictation.
5. Tray menu also has **Help / Issues**, **Star for free Developer plan**, and **Download page**.

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
