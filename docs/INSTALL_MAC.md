# Install Dictaste on macOS

## Requirements

- macOS 13 Ventura or later (best on latest)
- Xcode Command Line Tools (for source build)
- Permissions: **Microphone**, **Accessibility**, **Speech Recognition**

## Quick path — developer preview DMG

Pick the build that matches your chip (**About This Mac**):

1. **Apple Silicon (M1–M4):** [`Dictaste-0.1.1-arm64-unsigned.dmg`](https://github.com/johnmatveyev-lab/dictaste-mac/releases/download/v0.1.0-preview/Dictaste-0.1.1-arm64-unsigned.dmg)  
   **Intel:** [`Dictaste-0.1.1-intel-unsigned.dmg`](https://github.com/johnmatveyev-lab/dictaste-mac/releases/download/v0.1.0-preview/Dictaste-0.1.1-intel-unsigned.dmg)  
   (or https://dictaste.vercel.app/download)  
2. Open DMG → drag **Dictaste** to Applications  
3. First launch: right-click **Dictaste** → **Open** (unsigned until notarized)  
4. System Settings → Privacy & Security:
   - **Microphone** → enable Dictaste  
   - **Accessibility** → enable Dictaste  
5. Menu bar → Account → paste license + API key  

Notarized public DMG requires Apple Developer ID; preview is for developers/waitlist.  

## Build from source

```bash
git clone https://github.com/johnmatveyev-lab/dictaste-mac.git
cd dictaste-mac

# Generate Xcode project
brew install xcodegen   # once
xcodegen generate

# Build + install (recommended — installs as Dictaste.app)
chmod +x scripts/install_local.sh
./scripts/install_local.sh
```

Installs to `/Applications/Dictaste.app` and launches the app.

Prefer `./scripts/install_local.sh` over raw `xcodebuild` so the app always lands as **Dictaste.app** with the correct display name.

## First-run checklist

| Step | Action |
|------|--------|
| 1 | Menu bar icon visible |
| 2 | Accessibility toggle ON for Dictaste |
| 3 | License key pasted |
| 4 | BYO LLM key (Developer plan) |
| 5 | Hold **fn 🌐** → speak → release |
| 6 | Highlight any text → auto-read (highlight-to-speak) |

## Troubleshooting

- **Hotkey doesn’t work:** re-enable Accessibility, quit & reopen Dictaste  
- **No polish:** check license plan is **Developer** and API key is valid  
- **API URL:** default `https://dictaste.vercel.app` (Account settings override)

## Uninstall

```bash
pkill -x Dictaste 2>/dev/null || true
rm -rf /Applications/Dictaste.app
# Optional: remove auto-start launch agent if present
rm -f ~/Library/LaunchAgents/com.johnmatveyev.*.plist 2>/dev/null || true
```
