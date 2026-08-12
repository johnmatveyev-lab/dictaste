# Mac App Store App Sandbox spike (Path C)

**Product:** Dictaste 0.1.4 · **Team:** L85AF3V872 · **Bundle ID:** `com.johnmatveyev.flowdictate`  
**Track:** notarized DMG (Developer ID) **and** Mac App Store **in parallel**.  
**Scope of this spike:** static analysis + MAS build skeleton. Live Mac GUI validation still required.

## Verdict (core dictation)

| Area | Verdict | Notes |
|------|---------|--------|
| Mic + on-device STT | **GO** | Sandbox entitlement `device.audio-input`; usage strings already in Info.plist |
| Global hotkeys (fn / ⌥) via `CGEvent.tapCreate` | **PARTIAL** | Apple DTS: listening works under sandbox with **Input Monitoring** (`ListenEvent`). Current code gates on `AXIsProcessTrusted()` — must change for MAS |
| Paste-into-focused-app via `CGEvent.post` | **PARTIAL** | Apple DTS (2025): `PostEvent` TCC is sandbox-compatible; some third-party reports disagree — **must validate on a Mac** |
| Full Accessibility (`AXUIElement` selection / Flow Read) | **KILL (for MAS)** | App Sandbox blocks Accessibility APIs in general (Apple DTS) |
| Overall MAS for **core** dictation loop | **PARTIAL** | Viable only if live Mac run confirms ListenEvent + PostEvent; Flow Read stays DMG-only unless redesigned |

If live validation shows `CGEvent.post` or session taps fail under a real sandbox signature, **core dictation is KILL for MAS** and Path C becomes DMG-primary for those features (MAS optional reduced SKU or skip).

---

## Parallel config (do not merge tracks)

| Artifact | DMG / Developer ID | Mac App Store |
|----------|--------------------|---------------|
| Entitlements | `scripts/Dictaste.entitlements` (**unchanged**, sandbox OFF) | `scripts/Dictaste-MAS.entitlements` (sandbox ON) |
| Xcode config / scheme | `Release` / `FlowDictate` | `ReleaseMAS` / `FlowDictate-MAS` |
| Export | existing notarize scripts | `scripts/ExportOptions-MAS.plist` (skeleton) |
| Privacy manifest | shipped in bundle (harmless) | `FlowDictate/PrivacyInfo.xcprivacy` |
| Local build helper | `notarize_dual_dmgs.sh`, `release_ready.sh`, `package_dmg.sh` | `scripts/build_mas_sandbox.sh` |

DMG scripts keep applying hardened runtime + `Dictaste.entitlements` at codesign time. This PR does **not** strip or replace those entitlements.

---

## Code paths under test

### 1. Accessibility

| Call site | API | Sandbox expectation |
|-----------|-----|---------------------|
| `Permissions.swift` | `AXIsProcessTrusted` / `AXIsProcessTrustedWithOptions` | Prompt/trust for full AX often unavailable or ineffective under App Sandbox |
| `HotkeyMonitor.startIfPossible` | `guard AXIsProcessTrusted()` before tap | **Blocks hotkeys today** even if Input Monitoring would allow the tap |
| `SelectionMonitor` | `AXIsProcessTrusted` + `AXUIElement*` | **Expected fail** for system-wide selected text |
| `SelectionReader` | `AXUIElementCreateSystemWide`, `kAXSelectedTextAttribute`, etc. | **Expected fail** — full Accessibility APIs blocked |

**Evidence:** Apple DTS — “In general, App Sandbox blocks use of the Accessibility APIs” ([thread 789896](https://developer.apple.com/forums/thread/789896)).

### 2. Global hotkeys (fn / ⌥)

| Call site | API | Sandbox expectation |
|-----------|-----|---------------------|
| `HotkeyMonitor.swift` | `CGEvent.tapCreate(tap: .cgSessionEventTap, options: .defaultTap, …)` | **Likely OK** with Input Monitoring (`CGPreflightListenEventAccess` / `CGRequestListenEventAccess`) |
| Same | Event swallow (return `nil` for Esc) | Needs live check — active taps that modify the stream may be stricter than listen-only |
| `AppState` | `NSEvent.addGlobalMonitorForEvents` (reading Esc) | Historically tied to Accessibility; prefer CGEventTap for MAS |

**Evidence:** Quinn (DTS) — use `CGEventTap` + Input Monitoring for sandboxed / MAS keyboard watching ([thread 789896](https://developer.apple.com/forums/thread/789896), [thread 707680](https://developer.apple.com/forums/thread/707680)).

**Spike implication:** Hotkeys are not automatically dead under sandbox, but the **AX gate** in `HotkeyMonitor` must be replaced (or bypassed for MAS) with ListenEvent checks. Until a Mac run proves the tap + fn/⌥ behavior, verdict stays **PARTIAL**.

### 3. Paste-into-focused-app

| Call site | API | Sandbox expectation |
|-----------|-----|---------------------|
| `TextInserter.postCommandV` | `CGEvent…post(tap: .cghidEventTap)` for ⌘V | Apple DTS: OK with **PostEvent** (`CGPreflightPostEventAccess` / `CGRequestPostEventAccess`). UI may show under Privacy › Accessibility but TCC service is `PostEvent`, not full AX |
| Same | `NSPasteboard.general` write/restore | Own pasteboard use is fine in sandbox |
| `SelectionReader.postCommandC` | Same injection pattern for ⌘C | Same PostEvent dependency |

**Evidence:** DTS Oct 2025 follow-up on posting events in sandbox ([thread 789896](https://developer.apple.com/forums/thread/789896)). Conflicting third-party blogs claim `CGEvent.post` is hard-blocked — treat as **unproven until Mac validation**.

If PostEvent works: core loop can complete under sandbox.  
If PostEvent fails: clipboard-only fallback already exists in `TextInserter` (“text stays on the clipboard”) — usable but **not** true paste-into-focused-app; product quality drop → lean KILL for MAS parity.

### 4. Other sandbox friction (secondary)

| Feature | Risk |
|---------|------|
| `Permissions.installToApplicationsAndRelaunch` (`FileManager` → `/Applications`, `Process` + `/bin/bash`) | Breaks / useless under sandbox |
| `UserDefaults(suiteName: "com.apple.HIToolbox")` fn-key “Do Nothing” | Likely blocked cross-app defaults |
| `SMAppService` LaunchAgent in `Contents/Library/LaunchAgents` | MAS login-item rules differ; validate separately |
| Network polish / usage / TTS | Needs `network.client` (included in MAS entitlements) |
| Flow Read highlight capture | Depends on AX + optional ⌘C inject → **DMG-only** unless redesigned |

---

## Expected matrix: MAS vs DMG

| Feature | Notarized DMG (current) | MAS (proposed) |
|---------|-------------------------|----------------|
| Mic + on-device transcription | Yes | Yes |
| Hold-fn / tap-⌥ hotkeys | Yes (AX today) | Yes **if** ListenEvent + code drop AX gate |
| Auto-paste ⌘V into focused app | Yes | Yes **if** PostEvent works; else clipboard-only |
| Flow Read (AX selection) | Yes | **No** (sandbox blocks AX APIs) |
| Selection → AX text read | Yes | **No** (sandbox blocks AX APIs) |
| Selection → clipboard steal ⌘C | Yes | Only if PostEvent works; still weaker without AX |
| Install-to-`/Applications` helper | Yes | N/A (MAS installs via App Store) |
| Cloud polish / account / voice clone | Yes | Yes (network + user-selected files) |
| Hardened runtime | Yes (codesign) | Yes (`ReleaseMAS`) |
| App Sandbox | No | Yes |

---

## How to validate on a Mac (human)

1. **Baseline DMG path (regression):**  
   `./scripts/release_ready.sh` (or existing notarize flow). Confirm sandbox still **off** and `scripts/Dictaste.entitlements` still applied for Developer ID.

2. **MAS sandbox build:**  
   ```bash
   cd mac
   brew install xcodegen   # if needed
   ./scripts/build_mas_sandbox.sh
   ```
   Confirm codesign entitlements include `com.apple.security.app-sandbox = true`.

3. **Permissions UI:**  
   - Grant **Microphone**  
   - Grant **Input Monitoring** (ListenEvent) — do **not** assume Accessibility alone is enough  
   - On first paste, allow **PostEvent** prompt (may appear under Accessibility list)

4. **Core loop checklist:**  
   - [ ] `CGEvent.tapCreate` succeeds with sandbox ON  
   - [ ] fn hold starts/stops recording  
   - [ ] left ⌥ tap toggles  
   - [ ] Esc swallows while dictating  
   - [ ] Transcript auto-pastes into Notes / TextEdit / browser field  
   - [ ] If paste fails: does clipboard fallback leave text on pasteboard?

5. **Kill criteria for MAS core:**  
   - Tap create returns nil under sandbox with Input Monitoring granted, **or**  
   - `CGEvent.post` never delivers ⌘V with PostEvent granted, **and** clipboard-only is unacceptable.

6. **AX / Flow Read:**  
   Expect `AXUIElement` selection reads to fail; document exact `AXError` if logged. Do not expand MAS scope until core loop is green.

7. **Optional archive (local secrets):**  
   ```bash
   xcodebuild -scheme FlowDictate-MAS -configuration ReleaseMAS archive …
   xcodebuild -exportArchive -exportOptionsPlist scripts/ExportOptions-MAS.plist …
   ```
   Provisioning profiles stay local; repo skeleton must remain mergeable without them.

---

## Proposed next engineering (only after Mac run)

1. Gate `HotkeyMonitor` on `CGPreflightListenEventAccess` for sandboxed builds; keep AX gate for DMG if desired.  
2. Request PostEvent explicitly before first insert; surface Settings deep link.  
3. `#if` / runtime `AppSandbox.isEnabled` feature flags: hide Flow Read / AX onboarding on MAS.  
4. Do **not** change bundle ID unless TCC continuity proves broken across tracks.

---

## What this PR deliberately does not do

- No public marketing / website changes  
- No mirror archive  
- No replacement of DMG entitlements or notarize scripts  
- No Apple secrets required to merge  
- No claim of live Mac GUI proof (static analysis only in CI)
