# Install Dictaste on macOS

## Preview DMG

1. Download arm64 or Intel DMG from [Releases](https://github.com/johnmatveyev-lab/dictaste/releases) or [dictaste.vercel.app/download](https://dictaste.vercel.app/download).
2. Open the DMG → drag **Dictaste** to Applications.
3. First launch: right-click → **Open** (unsigned preview until notarized).
4. Grant **Microphone**, **Accessibility**, and **Speech Recognition**.

## Build from source

```bash
git clone https://github.com/johnmatveyev-lab/dictaste.git
cd dictaste/mac
brew install xcodegen
xcodegen generate
chmod +x scripts/install_local.sh
./scripts/install_local.sh
```

Installed as **Dictaste.app**. Internal Xcode target may still say `FlowDictate`; product name is Dictaste.

## License + BYO key

1. ★ Star [this repo](https://github.com/johnmatveyev-lab/dictaste)
2. [Developer setup](https://dictaste.vercel.app/developers/setup) → copy `dt_live_…`
3. Menu bar → Account → paste license + your OpenAI-compatible API key
