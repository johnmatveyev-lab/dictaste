# Install Dictaste on Windows

## Preview zip

1. Download from [Releases](https://github.com/johnmatveyev-lab/dictaste/releases) or [dictaste.vercel.app/download](https://dictaste.vercel.app/download).
2. Unzip → run **Dictaste.exe** (SmartScreen may warn — unsigned).
3. Tray icon → Settings → paste license.

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
