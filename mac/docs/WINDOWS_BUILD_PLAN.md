# Dictaste for Windows — Full Phase-by-Phase Build Plan

**Status:** Architecture & plan only (Mac + Flow Read first).  
**Scope:** Windows desktop client that reuses Dictaste web auth, licenses, polish API, and (later) highlight-to-speak TTS.  
**Implemented MVP:** `/Users/john/Projects/dictaste-windows` → https://github.com/johnmatveyev-lab/dictaste-windows  
**Out of scope for now:** Linux, iOS, Android.

---

## 1. Product goal (Windows parity)

| Capability | Mac today | Windows target |
|------------|-----------|----------------|
| Global hold-to-talk hotkey | fn / left ⌥ | Configurable (default: hold Right Ctrl or Caps Lock) |
| On-device / local STT | Apple Speech | Whisper.cpp or faster-whisper (local) |
| Cloud STT fallback | — | Optional OpenAI Whisper API |
| AI polish | Apple Intelligence → managed / BYO | Managed `/api/v1/polish` + BYO OpenAI |
| Insert into focused app | Synthetic paste | `SendInput` paste (clipboard restore) |
| HUD pill | Always-on mini → expand | Same UX (Win32 layered window / Tauri overlay) |
| Flow Read | System + premium TTS | System SAPI + premium TTS via same API |
| License / plans | fd_live_ + `/api/v1/me` | Identical |
| Auto-start | launchd agent | Startup folder / Task Scheduler / registry Run |

**Non-goals for v1:** Apple Intelligence polish, perfect Wayland-level edge cases, Microsoft Store on day one.

---

## 2. Recommended architecture

### 2.1 Stack choice: **Tauri 2 + Rust core + React UI**

| Layer | Tech | Why |
|-------|------|-----|
| Shell | Tauri 2 (Windows) | Small binary, secure, good tray support |
| UI | React + shared design tokens from web | Matches site / Mac HUD aesthetics |
| Hotkeys | Rust `global-hotkey` or Win32 hooks | Reliable system-wide capture |
| Audio | `cpal` | Cross-backend mic capture |
| STT | Whisper.cpp (bundled) or sidecar `faster-whisper` | Privacy + offline |
| Paste | Win32 clipboard + Ctrl+V SendInput | Works in most apps |
| TTS (Flow Read) | Windows SAPI + `/api/v1/tts` premium | Parity with Mac free/premium split |
| Updates | Tauri updater + GitHub Releases | Standard desktop path |
| Signing | EV or standard Authenticode cert | SmartScreen trust |

**Alternative if team is C#-heavy:** WinUI 3 / WPF native app — better “Windows feel,” separate UI stack.

### 2.2 Shared backend (already exists)

```
Windows Client                    flowdictate-web (Vercel)
─────────────────                 ───────────────────────
License key  ──────────────────►  GET  /api/v1/me
Polish text  ──────────────────►  POST /api/v1/polish
Premium TTS  ──────────────────►  POST /api/v1/tts
Checkout / account ─────────────►  Website dashboard (browser)
```

No new auth protocol — same `fd_live_…` Bearer license.

### 2.3 Repo layout (proposed)

```
flowdictate-windows/
  apps/desktop/          # Tauri project
  packages/ui/           # Shared React HUD + settings
  crates/
    core/                # hotkey, audio, paste, stt glue
    stt-whisper/         # whisper bindings / sidecar manager
  docs/
  scripts/sign-and-package.ps1
```

Or monorepo sibling: `/Users/john/Projects/flowdictate-windows`.

---

## 3. Phase plan

### Phase W0 — Foundations (3–5 days)
- [ ] Create repo + Tauri 2 Windows project
- [ ] Tray icon, quit, open settings
- [ ] Config store (license key, hotkey, polish on/off, API base URL)
- [ ] Deep link / button “Open dashboard” → browser
- [ ] CI: GitHub Actions Windows build (unsigned)

**Exit:** Empty tray app runs, persists settings.

### Phase W1 — Capture + paste loop (1–2 weeks)
- [ ] Global hotkey press/release
- [ ] Mic capture while held
- [ ] On release: paste **placeholder** or last transcript stub
- [ ] Clipboard save/restore
- [ ] Esc cancel
- [ ] HUD: mini pill + recording expand (port visuals)

**Exit:** Hold hotkey → release → text appears in Notepad (even if STT is mocked).

### Phase W2 — Speech-to-text (1–2 weeks)
- [ ] Bundle Whisper small/base model (or download on first run)
- [ ] Transcribe buffer on release
- [ ] Progress UI “Transcribing…”
- [ ] Language: English v1; locale later
- [ ] Error handling: no mic, model missing

**Exit:** Real dictation into any focused text field.

### Phase W3 — Polish + licenses (3–5 days)
- [ ] Account panel (license, BYO OpenAI, prefer managed)
- [ ] Call `/api/v1/me` + `/api/v1/polish`
- [ ] Usage meter (same as Mac)
- [ ] Quota handling (402 → show upgrade link)
- [ ] Dev plan BYO path

**Exit:** Full dictate → polish → insert with live backend.

### Phase W4 — Flow Read on Windows (1 week, after Mac Flow Read stable)
- [ ] Read selection / clipboard
- [ ] SAPI system voices (free)
- [ ] Premium `/api/v1/tts` + BYO
- [ ] Reader bar UI (play/pause/speed)

**Exit:** Flow Read parity with Mac free + premium paths.

### Phase W5 — Packaging & distribution (3–5 days)
- [ ] Code signing certificate purchased
- [ ] `sign-and-package.ps1` → signed installer (MSIX or NSIS)
- [ ] SmartScreen reputation plan (gradual rollout)
- [ ] Host installer → `NEXT_PUBLIC_WIN_SETUP_URL`
- [ ] Download page: Windows Download button
- [ ] Auto-update channel

**Exit:** Public Windows download live.

### Phase W6 — Hardening (ongoing)
- [ ] Antivirus false-positive mitigation
- [ ] Elevated apps / admin windows paste edge cases
- [ ] Multi-monitor HUD
- [ ] Telemetry (opt-in) for crash reports
- [ ] Localization

---

## 4. Risk register

| Risk | Mitigation |
|------|------------|
| SmartScreen “unknown publisher” | Sign early; distribute widely; EV cert optional |
| Hotkey conflicts | Fully remappable hotkeys |
| Whisper binary size | Download model on first launch; small model default |
| Paste fails in some apps | Fallback: leave text on clipboard + toast |
| Game anti-cheat | Document “don’t use in competitive games” |
| STT quality vs Apple | Allow cloud STT upgrade path for Pro |

---

## 5. Pricing / plans (shared with Mac)

No Windows-specific SKUs. Same Free / Dev / Pro / Pro Plus:

- Dictation unlimited all plans  
- Managed polish + premium Flow Read voices: plan limits  
- System TTS free  
- Dev BYO unlimited polish/TTS on their keys  

---

## 6. Success metrics (Windows launch)

- Install → first successful dictation < 5 minutes  
- Crash-free sessions > 99%  
- ≥ 40% of Win installs paste license within 7 days  
- Support tickets: hotkey/mic issues < 10% of installs  

---

## 7. Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Tauri 2 | Size, security, speed to shared UI |
| STT | Local Whisper first | Privacy story + COGS |
| Auth | License key (existing) | No OAuth redesign |
| Store | Direct download first | Faster than MS Store review |
| Linux | Deferred | Focus Win after Mac |

---

## 8. Handoff after Mac notarization

1. Ship Mac DMG  
2. Open `flowdictate-windows` repo from this plan  
3. Execute W0–W1 in first sprint  
4. Keep API contracts frozen (`/api/v1/me`, `polish`, `tts`)  

**Estimated calendar time to public Win MVP:** 6–10 weeks with one full-time engineer after Mac is shipping.
