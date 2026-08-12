# Install Dictaste on Windows

## Preview zip (0.1.17)

1. Download [Dictaste-Setup-0.1.17.zip](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.4/Dictaste-Setup-0.1.17.zip) or use [dictaste.vercel.app/download](https://dictaste.vercel.app/download).
2. Unzip → run **Dictaste.exe** (SmartScreen may warn — not code-signed yet; **More info → Run anyway**).
3. Tray icon → **Settings…** → paste license from the dashboard.
4. Hotkeys (remappable in Settings):
   - **Ctrl+Shift+Space** — start/stop dictation (polish + paste)
   - **Ctrl+Shift+R** — highlight-to-speak (selection or clipboard).
5. Tray: **Read selection**, **Copy last**, **Test voice**, **Recent transcripts** (export), updates, unlock, pricing.

## From source

```bash
git clone https://github.com/johnmatveyev-lab/dictaste.git
cd dictaste/windows
npm install
npm start
```

## Tips

- **Text replacements**: lines like `teh=the` or `btw=by the way` (after polish).
- **Auto-capitalize** sentence starts (optional).
- Sound cues · export history · test voice · after-paste suffix · 20 dictation languages.
- Launch at login · quiet notifications · silent startup update check.

## License + BYO

Star this repo → [developer setup](https://dictaste.vercel.app/developers/setup) → paste license + LLM key in Settings.
