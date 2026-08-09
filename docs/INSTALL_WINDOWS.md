# Install Dictaste on Windows

## Requirements

- Windows 10 or 11 (x64)
- Node.js 20+ (for source install)
- Microphone permission

## Quick path — developer preview zip (unsigned)

1. Download [Dictaste-Setup-0.1.0.zip](https://github.com/johnmatveyev-lab/dictaste-windows/releases/download/v0.1.0-preview/Dictaste-Setup-0.1.0.zip)  
2. Unzip and run **Dictaste.exe** (SmartScreen may warn — unsigned)  
3. Tray icon → Settings → paste license + keys  

Site mirror: [dictaste.vercel.app/download](https://dictaste.vercel.app/download)

## Run from source (developers)

```powershell
git clone https://github.com/johnmatveyev-lab/dictaste-windows.git
cd dictaste-windows
npm install
npm start
```

### Package a portable zip (any OS)

```bash
npm run pack:zip
# → dist/Dictaste-Setup-0.1.0.zip
```

### Package an NSIS installer (Windows host or CI)

```powershell
npm run dist
# → dist/Dictaste-Setup-0.1.0.exe
```

CI builds unsigned NSIS installers when GitHub Actions is available. Until then, use the published preview zip on [dictaste-windows releases](https://github.com/johnmatveyev-lab/dictaste-windows/releases).

## Usage

| Action | How |
|--------|-----|
| Start/stop listen | **Ctrl+Shift+Space** |
| Settings | Tray icon → Settings |
| License | Paste `dt_live_…` from developer setup |
| Polish API | Default `https://dictaste.vercel.app` |
| STT modes | Web Speech (default) · OpenAI Whisper · offline whisper.cpp |

## First-run checklist

1. App appears in system tray  
2. Settings → license key  
3. Optional: OpenAI key for polish / Whisper  
4. Ctrl+Shift+Space → speak → stop → text pastes into focused app  

## Troubleshooting

- **Hotkey captured by another app:** change conflict or free the shortcut  
- **Paste fails:** focus a text field first; Windows may need the app run as user (not elevated)  
- **STT empty:** allow mic for Electron / Dictaste in Windows Privacy settings  

## Uninstall (source run)

Quit from tray. Delete the cloned folder.  
If you used `npm run dist`, use Windows Apps & Features to remove Dictaste.
