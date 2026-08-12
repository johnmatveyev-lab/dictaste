# Install Dictaste on Windows

## Preview zip (0.1.18)

1. Download [Dictaste-Setup-0.1.18.zip](https://github.com/johnmatveyev-lab/dictaste/releases/download/v0.1.4/Dictaste-Setup-0.1.18.zip) or use [dictaste.vercel.app/download](https://dictaste.vercel.app/download).
2. Unzip → run **Dictaste.exe** (SmartScreen may warn — **More info → Run anyway**).
3. Tray → **Settings…** → paste license.
4. Hotkeys (remappable):
   - **Ctrl+Shift+Space** — dictate
   - **Ctrl+Shift+R** — highlight-to-speak
   - **Ctrl+Shift+P** — polish selection (rewrite + paste)
5. Tray: Read · Polish selection · Copy last · Test voice · Recent transcripts · updates · unlock.

## From source

```bash
git clone https://github.com/johnmatveyev-lab/dictaste.git
cd dictaste/windows && npm install && npm start
```

## Tips

- **Polish selection** rewrites highlighted text with AI polish + replacements.
- Text replacements (`find=replace`) · auto-capitalize · sound cues · export history.
- Dictation language (20 locales) · launch at login · quiet notifications.
