# Flow Read — Product & Technical Spec

## What it is
Select text (e.g. a long LLM reply) → the Dictaste pill transforms into a **reader bar** → Play / Pause reads the text aloud.

## Tiers

| Voice path | Free | Developer | Pro | Pro Plus |
|------------|------|-----------|-----|----------|
| **System voices** (macOS AVSpeech) | Unlimited | Unlimited | Unlimited | Unlimited |
| **Premium managed** (OpenAI TTS via our API) | — | — (use BYO) | 50k chars/mo | 200k chars/mo |
| **BYO OpenAI TTS** | Optional | Unlimited on their key | Optional | Optional |

## UX
1. User selects text in any app  
2. Menu bar → **Flow Read selection** (or shortcut ⌃⌥⌘R)  
3. HUD expands to reader bar: ▶/❚❚, speed, voice label, stop  
4. Esc or Stop returns to idle mini pill  

## Settings (Account window)
- Default provider: System / OpenAI managed / BYO OpenAI  
- Voice picker (system voices + premium voice list)  
- Rate 0.5x–2.0x  
- Usage meters: polish words + premium read chars  

## API
`POST /api/v1/tts`  
Auth: Bearer license  
Body: `{ text, voice?, speed? }`  
Response: `{ audioBase64, format: "mp3", usage: { ttsCharsUsed, ttsCharsLimit } }`  
Or 403 `byo_only` / 402 `quota_exceeded`
