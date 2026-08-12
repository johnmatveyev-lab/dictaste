/**
 * Dictaste Windows MVP
 * - Live HUD word count · skip short highlight-to-speak under N words
 * - Re-read last · clear history (tray)
 * - Tray app + lime brand icon
 * - Remappable global hotkeys (defaults Ctrl+Shift+Space / Ctrl+Shift+R)
 * - Web Speech STT in always-on-top HUD
 * - Auto polish via /api/v1/polish + paste (Ctrl+V) on stop
 * - Highlight-to-speak: selection/clipboard
 *   · free system SAPI voices
 *   · managed premium TTS via /api/v1/tts (Pro)
 *   · BYO OpenAI TTS when openAIKey set (Developer plan parity)
 *   · SAPI fallback
 * - Optional launch at login
 * - Settings: license, STT/TTS, SAPI rate/voice, premium voice, quiet toasts
 * - Silent startup update check (notifies only when behind)
 * - Tray: copy last transcript + recent history
 * - Web Speech language (BCP-47) selectable in Settings
 * - Test voice (SAPI/premium) + paste suffix (space/newline/period)
 * - Optional dictation sound cues + export history
 * - Text replacements + auto-capitalize first letter
 * - Polish selection hotkey (rewrite highlighted text)
 * - Clipboard-only mode when auto-paste is off
 * - Pause hotkeys (tray) + export/import settings
 * - Spoken punctuation + strip fillers (offline cleanup)
 * - Cancel/discard dictation + paste last transcript hotkey
 * - Silence auto-stop + configurable paste delay
 * - Double-space → period + max dictation duration safety
 * - Persist pause hotkeys + timed pause (5/15/30 min auto-resume)
 * - Paste from history (tray) + deeper history (up to 50)
 * - Tray language switcher + case modes (sentence/lower/upper/title)
 * - Smart quotes / em dash + compact HUD
 * - Word-count toast + import history
 * - Skip polish under N words + open data folder + reset hotkeys
 */
const {
  app,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  clipboard,
  BrowserWindow,
  ipcMain,
  shell,
  Notification,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const { exec, spawn } = require("child_process");

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const DEFAULT_API = "https://dictaste.vercel.app";

function loadConfig() {
  try {
    return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return defaultConfig();
  }
}

function defaultConfig() {
  return {
    apiBase: DEFAULT_API,
    licenseKey: "",
    polish: true,
    autoPaste: true,
    /**
     * Appended after polished dictation before paste.
     * "" | " " | "\\n" | ". " (period+space)
     */
    pasteSuffix: " ",
    /**
     * Delay before SendKeys Ctrl+V (ms). Helps slow apps focus.
     * Clamped 0–1000 in pasteText.
     */
    pasteDelayMs: 80,
    /**
     * Auto-stop dictation after this many ms of silence (no new speech results).
     * 0 = off (manual stop only). Typical 3000–5000.
     */
    silenceTimeoutMs: 4000,
    /**
     * Hard cap on a single dictation session (ms). Safety stop even if speech continues.
     * 0 = off. Default 90s.
     */
    maxDictationMs: 90000,
    /**
     * Convert double-space (or "  ") into sentence end ". " (iOS-style).
     * Applied offline before polish; skips when already after punctuation.
     */
    doubleSpacePeriod: true,
    /**
     * Smart typography: "quotes" → “ ” · 'quotes' → ‘ ’ · -- → —
     * Applied offline before polish.
     */
    smartQuotes: true,
    /**
     * Compact HUD: smaller pill, hide live partial transcript line.
     */
    hudCompact: false,
    /**
     * After paste/copy, toast includes word count (e.g. "Pasted · 42 words").
     */
    showWordCount: true,
    /**
     * Skip managed AI polish when transcript has fewer than this many words.
     * Offline cleanup (punctuation, fillers, smart quotes) still runs. 0 = always polish.
     */
    minWordsForPolish: 3,
    /**
     * Skip highlight-to-speak when selection has fewer than this many words.
     * Saves premium TTS quota. 0 = always read. Default 0.
     */
    minWordsForRead: 0,
    /** webspeech | openai | whisper-cli */
    sttMode: "webspeech",
    /** BCP-47 language for Web Speech (and Whisper language when set) */
    sttLang: "en-US",
    /**
     * Case transform after polish/replacements:
     * sentence = auto-capitalize (respects autoCapitalize flag)
     * lower | upper | title = force transform
     */
    caseMode: "sentence",
    openAIKey: "",
    /** Absolute path to whisper.cpp `whisper-cli` or `main` binary (optional offline) */
    whisperBin: "",
    whisperModel: "",
    /** First-run welcome notification shown once */
    seenWelcome: false,
    /** Highlight-to-speak rate: -10..10 (SAPI) */
    ttsRate: 0,
    /** Installed SAPI voice display name (empty = OS default) */
    ttsSapiVoice: "",
    /**
     * system = free SAPI only
     * managed = try /api/v1/tts (Pro), then BYO, then SAPI
     * auto = managed/BYO when keys present, else system
     */
    ttsEngine: "auto",
    /** OpenAI-compatible voice name for managed / BYO TTS */
    ttsVoice: "alloy",
    /** Start Dictaste when Windows signs in */
    launchAtLogin: false,
    /**
     * Quiet mode: suppress routine toasts (reading started, welcome, etc.).
     * Errors, quota, and update prompts still notify.
     */
    quietNotifications: false,
    /**
     * When true, Pause hotkeys state is saved to config and restored on launch.
     * Timed pauses also honor this for the duration of the pause.
     */
    persistPauseHotkeys: true,
    /** Restored when persistPauseHotkeys is on */
    hotkeysPaused: false,
    /** Soft beep on dictation start/stop (HUD WebAudio) */
    soundCues: true,
    /**
     * User replacements, one per line: find=replace
     * Whole-word, case-insensitive. Applied after polish.
     */
    replacements: "",
    /** Capitalize first letter of the final transcript */
    autoCapitalize: true,
    /**
     * Strip common filler words (um, uh, er, ah, hmm, you know) before polish.
     * English-oriented; off for non-English STT if desired.
     */
    stripFillers: true,
    /**
     * Spoken punctuation: "period" → .  "comma" → ,  "new line" → newline, etc.
     * Applied before polish so AI sees clean structure.
     */
    spokenPunctuation: true,
    /** Electron accelerators (also accept Ctrl+… display form) */
    hotkeyDictate: "CommandOrControl+Shift+Space",
    hotkeyRead: "CommandOrControl+Shift+R",
    /** Polish / rewrite selection (paste result) */
    hotkeyPolish: "CommandOrControl+Shift+P",
    /** Cancel in-progress dictation without paste */
    hotkeyCancel: "CommandOrControl+Shift+Escape",
    /** Re-paste last polished transcript into focused app */
    hotkeyPasteLast: "CommandOrControl+Shift+V",
    /**
     * How many recent transcripts to keep (10–50). Default 25.
     */
    historyMax: 25,
    /** Last polished dictations (newest first) */
    history: [],
  };
}

const DEFAULT_HOTKEY_DICTATE = "CommandOrControl+Shift+Space";
const DEFAULT_HOTKEY_READ = "CommandOrControl+Shift+R";
const DEFAULT_HOTKEY_POLISH = "CommandOrControl+Shift+P";
const DEFAULT_HOTKEY_CANCEL = "CommandOrControl+Shift+Escape";
const DEFAULT_HOTKEY_PASTE_LAST = "CommandOrControl+Shift+V";

/** Normalize user/settings hotkey strings to Electron accelerators. */
function toAccelerator(raw, fallback) {
  let s = String(raw || "")
    .trim()
    .replace(/\s+/g, "");
  if (!s) return fallback;
  // Order matters: expand long forms first
  s = s
    .replace(/CommandOrControl/gi, "§COC§")
    .replace(/CmdOrCtrl/gi, "§COC§")
    .replace(/Control/gi, "§COC§")
    .replace(/Ctrl/gi, "§COC§")
    .replace(/Cmd/gi, "§COC§")
    .replace(/Command/gi, "§COC§")
    .replace(/§COC§/g, "CommandOrControl")
    .replace(/Option/gi, "Alt")
    .replace(/Win/gi, "Super")
    .replace(/Windows/gi, "Super");
  // Title-case common keys
  s = s
    .split("+")
    .map((part) => {
      if (/^CommandOrControl$/i.test(part)) return "CommandOrControl";
      if (/^(Alt|Shift|Super|Meta)$/i.test(part))
        return part[0].toUpperCase() + part.slice(1).toLowerCase();
      if (/^Space$/i.test(part)) return "Space";
      if (/^[a-z]$/i.test(part)) return part.toUpperCase();
      if (/^F\d{1,2}$/i.test(part)) return part.toUpperCase();
      return part;
    })
    .join("+");
  return s || fallback;
}

function toDisplayHotkey(accel) {
  return String(accel || "")
    .replace(/CommandOrControl/gi, "Ctrl")
    .replace(/Super/gi, "Win");
}

function hotkeyDictateAccel() {
  return toAccelerator(cfg?.hotkeyDictate, DEFAULT_HOTKEY_DICTATE);
}

function hotkeyReadAccel() {
  return toAccelerator(cfg?.hotkeyRead, DEFAULT_HOTKEY_READ);
}

function hotkeyPolishAccel() {
  return toAccelerator(cfg?.hotkeyPolish, DEFAULT_HOTKEY_POLISH);
}

function hotkeyCancelAccel() {
  return toAccelerator(cfg?.hotkeyCancel, DEFAULT_HOTKEY_CANCEL);
}

function hotkeyPasteLastAccel() {
  return toAccelerator(cfg?.hotkeyPasteLast, DEFAULT_HOTKEY_PASTE_LAST);
}

/** Register (or re-register) global hotkeys from config. */
function registerHotkeys() {
  try {
    globalShortcut.unregisterAll();
  } catch {
    /* ignore */
  }
  if (hotkeysPaused) {
    rebuildTrayMenu();
    setTrayLabel();
    return { paused: true };
  }
  const dict = hotkeyDictateAccel();
  const read = hotkeyReadAccel();
  const polish = hotkeyPolishAccel();
  const cancel = hotkeyCancelAccel();
  const pasteLast = hotkeyPasteLastAccel();
  const okD = globalShortcut.register(dict, () => toggleListen());
  const okR = globalShortcut.register(read, () => {
    toggleFlowRead().catch(() => {});
  });
  const okP = globalShortcut.register(polish, () => {
    polishSelection().catch(() => {});
  });
  const okC = globalShortcut.register(cancel, () => {
    cancelDictation();
  });
  const okL = globalShortcut.register(pasteLast, () => {
    pasteLastTranscript();
  });
  if (!okD) {
    notify(`Could not bind dictate hotkey (${toDisplayHotkey(dict)}) — try another in Settings`);
  }
  if (!okR) {
    notify(`Could not bind read hotkey (${toDisplayHotkey(read)}) — try another in Settings`);
  }
  if (!okP) {
    notify(
      `Could not bind polish hotkey (${toDisplayHotkey(polish)}) — try another in Settings`
    );
  }
  if (!okC) {
    notify(
      `Could not bind cancel hotkey (${toDisplayHotkey(cancel)}) — try another in Settings`
    );
  }
  if (!okL) {
    notify(
      `Could not bind paste-last hotkey (${toDisplayHotkey(pasteLast)}) — try another in Settings`
    );
  }
  rebuildTrayMenu();
  setTrayLabel();
  return {
    dictate: dict,
    read,
    polish,
    cancel,
    pasteLast,
    okD,
    okR,
    okP,
    okC,
    okL,
  };
}

/** @type {ReturnType<typeof setTimeout> | null} */
let pauseResumeTimer = null;
/** Unix ms when timed pause ends (0 = indefinite) */
let pauseResumeAt = 0;

function clearPauseResumeTimer() {
  if (pauseResumeTimer) {
    clearTimeout(pauseResumeTimer);
    pauseResumeTimer = null;
  }
  pauseResumeAt = 0;
}

/**
 * Pause or resume global hotkeys.
 * @param {boolean} paused
 * @param {{ minutes?: number, silent?: boolean, persist?: boolean }} [opts]
 *   minutes>0 → auto-resume after that many minutes
 *   persist → write hotkeysPaused into config when persistPauseHotkeys on
 */
function setHotkeysPaused(paused, opts = {}) {
  const minutes = Number(opts.minutes) > 0 ? Number(opts.minutes) : 0;
  const silent = !!opts.silent;
  clearPauseResumeTimer();
  hotkeysPaused = !!paused;
  if (hotkeysPaused) {
    try {
      globalShortcut.unregisterAll();
    } catch {
      /* ignore */
    }
    if (listening) stopListening();
    if (reading) stopSpeaking();
    if (minutes > 0) {
      pauseResumeAt = Date.now() + Math.round(minutes * 60_000);
      pauseResumeTimer = setTimeout(() => {
        pauseResumeTimer = null;
        pauseResumeAt = 0;
        setHotkeysPaused(false, { silent: false });
      }, Math.round(minutes * 60_000));
      if (!silent) {
        notify(
          `Hotkeys paused ${minutes} min — auto-resume at ${new Date(pauseResumeAt).toLocaleTimeString()}`,
          { force: true }
        );
      }
    } else if (!silent) {
      notify("Hotkeys paused — resume from tray", { force: true });
    }
  } else {
    registerHotkeys();
    if (!silent) notify("Hotkeys resumed", { force: true });
  }
  // Persist indefinite pause (not timed) when enabled
  const shouldPersist =
    opts.persist !== false &&
    cfg?.persistPauseHotkeys !== false &&
    minutes <= 0;
  if (shouldPersist && cfg) {
    cfg = { ...cfg, hotkeysPaused };
    try {
      saveConfig(cfg);
    } catch {
      /* ignore */
    }
  } else if (!hotkeysPaused && cfg?.hotkeysPaused && cfg?.persistPauseHotkeys !== false) {
    // Clear persisted pause on resume
    cfg = { ...cfg, hotkeysPaused: false };
    try {
      saveConfig(cfg);
    } catch {
      /* ignore */
    }
  }
  rebuildTrayMenu();
  setTrayLabel();
  return {
    paused: hotkeysPaused,
    resumeAt: pauseResumeAt || null,
    minutes: minutes || null,
  };
}

const SETTINGS_EXPORT_KEYS = [
  "apiBase",
  "polish",
  "autoPaste",
  "pasteSuffix",
  "pasteDelayMs",
  "silenceTimeoutMs",
  "maxDictationMs",
  "doubleSpacePeriod",
  "smartQuotes",
  "hudCompact",
  "showWordCount",
  "minWordsForPolish",
  "minWordsForRead",
  "sttMode",
  "sttLang",
  "caseMode",
  "whisperBin",
  "whisperModel",
  "ttsRate",
  "ttsSapiVoice",
  "ttsEngine",
  "ttsVoice",
  "launchAtLogin",
  "quietNotifications",
  "persistPauseHotkeys",
  "soundCues",
  "replacements",
  "autoCapitalize",
  "stripFillers",
  "spokenPunctuation",
  "hotkeyDictate",
  "hotkeyRead",
  "hotkeyPolish",
  "hotkeyCancel",
  "hotkeyPasteLast",
  "historyMax",
];

function exportSettings({ includeSecrets = false } = {}) {
  try {
    const out = {
      product: "dictaste-windows",
      version: appVersion(),
      exportedAt: new Date().toISOString(),
      settings: {},
    };
    for (const k of SETTINGS_EXPORT_KEYS) {
      if (cfg && Object.prototype.hasOwnProperty.call(cfg, k)) {
        out.settings[k] = cfg[k];
      }
    }
    if (includeSecrets) {
      out.settings.licenseKey = cfg?.licenseKey || "";
      out.settings.openAIKey = cfg?.openAIKey || "";
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = path.join(
      app.getPath("documents"),
      `Dictaste-settings-${stamp}.json`
    );
    fs.writeFileSync(dest, JSON.stringify(out, null, 2), "utf8");
    shell.showItemInFolder(dest);
    notify(
      includeSecrets
        ? "Settings exported (includes secrets)"
        : "Settings exported (no license/API keys)",
      { force: true }
    );
    return { ok: true, path: dest };
  } catch (e) {
    notify(`Export settings failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

async function importSettings() {
  try {
    const win = settingsWin && !settingsWin.isDestroyed() ? settingsWin : null;
    const res = await dialog.showOpenDialog(win || undefined, {
      title: "Import Dictaste settings",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { ok: false, error: "canceled" };
    }
    const raw = fs.readFileSync(res.filePaths[0], "utf8");
    const data = JSON.parse(raw);
    const incoming = data.settings || data;
    if (!incoming || typeof incoming !== "object") {
      notify("Invalid settings file", { force: true });
      return { ok: false, error: "invalid" };
    }
    const next = { ...cfg };
    for (const k of SETTINGS_EXPORT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(incoming, k)) {
        next[k] = incoming[k];
      }
    }
    // Optional secrets if present in file
    if (typeof incoming.licenseKey === "string" && incoming.licenseKey) {
      next.licenseKey = incoming.licenseKey;
    }
    if (typeof incoming.openAIKey === "string" && incoming.openAIKey) {
      next.openAIKey = incoming.openAIKey;
    }
    cfg = next;
    cfg.hotkeyDictate = hotkeyDictateAccel();
    cfg.hotkeyRead = hotkeyReadAccel();
    cfg.hotkeyPolish = hotkeyPolishAccel();
    cfg.hotkeyCancel = hotkeyCancelAccel();
    cfg.hotkeyPasteLast = hotkeyPasteLastAccel();
    saveConfig(cfg);
    applyLaunchAtLogin(cfg.launchAtLogin);
    if (!hotkeysPaused) registerHotkeys();
    else rebuildTrayMenu();
    notify("Settings imported", { force: true });
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send("status", { phase: "idle", imported: true });
    }
    return { ok: true, path: res.filePaths[0] };
  } catch (e) {
    notify(`Import settings failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

/** 16×16 lime “D” tray icon (PNG buffer, no assets needed). */
function makeTrayIcon() {
  // Minimal valid 16x16 PNG with lime pixel data is heavy by hand —
  // use Electron's createFromDataURL via a tiny canvas-less base64 16x16 lime square.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVQ4T2NkYGD4z0ABYBzVMKoB" +
      "BgP+MzAw/GdG5jMyMqJLgDQjCyBrGHUDhtMNAABmQQf9vQZ0dwAAAABJRU5ErkJggg==",
    "base64"
  );
  let img = nativeImage.createFromBuffer(png);
  if (img.isEmpty()) {
    // Fallback empty → still works; tooltip carries brand.
    img = nativeImage.createEmpty();
  }
  return img.resize({ width: 16, height: 16 });
}

let tray = null;
let settingsWin = null;
let hudWin = null;
let listening = false;
/** System TTS (highlight-to-speak) in progress */
let reading = false;
/** Active SAPI PowerShell child */
let speakProc = null;
let cfg = null;
/** Last polished dictation (tray Copy last transcript) */
let lastTranscript = "";
/** Last highlight-to-speak text (re-read without re-capturing selection) */
let lastReadText = "";
/** Runtime: global hotkeys unbound until resumed (optionally persisted) */
let hotkeysPaused = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isWin() {
  return process.platform === "win32";
}

/** Kill in-flight SAPI speak process. */
function stopSpeaking() {
  if (speakProc && !speakProc.killed) {
    try {
      speakProc.kill();
    } catch {
      /* ignore */
    }
  }
  speakProc = null;
  if (reading) {
    reading = false;
    setTrayLabel();
    broadcastStatus({ phase: "idle", reading: false });
  }
}

/**
 * Speak text with Windows SAPI (free system voices).
 * Uses a temp .ps1 + UTF-8 base64 payload so user text cannot break the script.
 */
function speakTextSapi(text) {
  return new Promise((resolve, reject) => {
    stopSpeaking();
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      reject(new Error("Nothing to read"));
      return;
    }
    if (!isWin()) {
      // Dev on macOS/Linux — toast only (packaging happens on any host).
      notify(`Preview speak (${trimmed.length} chars) — SAPI runs on Windows`);
      resolve();
      return;
    }
    const rate = Math.max(-10, Math.min(10, Number(cfg?.ttsRate) || 0));
    const voiceName = String(cfg?.ttsSapiVoice || "").trim();
    const voiceLine = voiceName
      ? `try { $s.SelectVoice('${voiceName.replace(/'/g, "''")}') } catch {}`
      : "";
    const b64 = Buffer.from(trimmed, "utf8").toString("base64");
    const ps1 = path.join(app.getPath("temp"), `dictaste-speak-${Date.now()}.ps1`);
    const script = [
      "Add-Type -AssemblyName System.Speech",
      `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer`,
      `$s.Rate = ${rate}`,
      voiceLine,
      `$bytes = [Convert]::FromBase64String('${b64}')`,
      `$t = [Text.Encoding]::UTF8.GetString($bytes)`,
      `$s.Speak($t)`,
      "",
    ]
      .filter(Boolean)
      .join("\r\n");
    fs.writeFileSync(ps1, script, "utf8");
    reading = true;
    setTrayLabel();
    broadcastStatus({ phase: "reading", reading: true });
    speakProc = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { windowsHide: true }
    );
    speakProc.on("error", (e) => {
      try {
        fs.unlinkSync(ps1);
      } catch {
        /* ignore */
      }
      speakProc = null;
      reading = false;
      setTrayLabel();
      broadcastStatus({ phase: "idle", reading: false, error: String(e.message || e) });
      reject(e);
    });
    speakProc.on("close", () => {
      try {
        fs.unlinkSync(ps1);
      } catch {
        /* ignore */
      }
      speakProc = null;
      reading = false;
      setTrayLabel();
      broadcastStatus({ phase: "idle", reading: false });
      resolve();
    });
  });
}

/**
 * Play MP3 via WPF MediaPlayer (managed premium TTS path).
 * @param {string} mp3Path absolute path to .mp3
 */
function playMp3File(mp3Path) {
  return new Promise((resolve, reject) => {
    stopSpeaking();
    if (!isWin()) {
      notify(`Preview premium TTS file · ${path.basename(mp3Path)}`);
      resolve();
      return;
    }
    const escaped = mp3Path.replace(/'/g, "''");
    const ps1 = path.join(app.getPath("temp"), `dictaste-play-${Date.now()}.ps1`);
    const script = [
      "Add-Type -AssemblyName PresentationCore",
      `$p = New-Object System.Windows.Media.MediaPlayer`,
      `$p.Open([Uri]'${escaped}')`,
      `$p.Play()`,
      "$sw = [Diagnostics.Stopwatch]::StartNew()",
      "while (-not $p.NaturalDuration.HasTimeSpan) {",
      "  Start-Sleep -Milliseconds 40",
      "  if ($sw.ElapsedMilliseconds -gt 8000) { break }",
      "}",
      "if ($p.NaturalDuration.HasTimeSpan) {",
      "  $ms = [int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 250",
      "  Start-Sleep -Milliseconds $ms",
      "}",
      "$p.Close()",
      "",
    ].join("\r\n");
    fs.writeFileSync(ps1, script, "utf8");
    reading = true;
    setTrayLabel();
    broadcastStatus({ phase: "reading", reading: true, engine: "managed" });
    speakProc = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { windowsHide: true }
    );
    const cleanup = () => {
      try {
        fs.unlinkSync(ps1);
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(mp3Path);
      } catch {
        /* ignore */
      }
    };
    speakProc.on("error", (e) => {
      cleanup();
      speakProc = null;
      reading = false;
      setTrayLabel();
      broadcastStatus({ phase: "idle", reading: false, error: String(e.message || e) });
      reject(e);
    });
    speakProc.on("close", (code) => {
      cleanup();
      speakProc = null;
      reading = false;
      setTrayLabel();
      broadcastStatus({ phase: "idle", reading: false });
      if (code && code !== 0) reject(new Error(`MediaPlayer exit ${code}`));
      else resolve();
    });
  });
}

/**
 * Managed premium TTS via Dictaste /api/v1/tts (Pro plans).
 * Returns true if audio played; false if should fall back (BYO/SAPI).
 */
async function speakTextManaged(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Nothing to read");
  if (!cfg.licenseKey) return false;

  const base = (cfg.apiBase || DEFAULT_API).replace(/\/$/, "");
  broadcastStatus({ phase: "tts", reading: false, engine: "managed" });
  const { status, json } = await requestJson(`${base}/api/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.licenseKey}`,
    },
    body: {
      text: trimmed.slice(0, 8000),
      voice: cfg.ttsVoice || "alloy",
    },
  });

  if (status === 402 || status === 403) {
    // Free / Dev → try BYO next; do not toast as error
    return false;
  }
  if (status === 401) {
    notify("License invalid for premium voices — trying other engines");
    return false;
  }
  if (status !== 200 || !json?.audioBase64) {
    return false;
  }

  const mp3Path = path.join(app.getPath("temp"), `dictaste-tts-${Date.now()}.mp3`);
  fs.writeFileSync(mp3Path, Buffer.from(json.audioBase64, "base64"));
  await playMp3File(mp3Path);
  return true;
}

/**
 * BYO OpenAI TTS (Developer plan parity — uses user's key, never our bill).
 * Returns true if audio played. Speech endpoint returns raw MP3 bytes.
 */
async function speakTextByoOpenAI(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Nothing to read");
  const key = (cfg.openAIKey || "").trim();
  if (!key) return false;

  broadcastStatus({ phase: "tts", reading: false, engine: "byo" });
  const body = JSON.stringify({
    model: "gpt-4o-mini-tts",
    voice: cfg.ttsVoice || "alloy",
    input: trimmed.slice(0, 4000),
    response_format: "mp3",
  });
  let bin = await requestBinary("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body,
  });
  // Older keys / regions: fall back to classic tts-1
  if (!bin.ok) {
    bin = await requestBinary("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: cfg.ttsVoice || "alloy",
        input: trimmed.slice(0, 4000),
        response_format: "mp3",
      }),
    });
  }
  if (!bin.ok || !bin.buffer?.length) {
    if (bin.status === 401) notify("OpenAI key rejected for TTS — system voice");
    return false;
  }
  const mp3Path = path.join(app.getPath("temp"), `dictaste-byo-${Date.now()}.mp3`);
  fs.writeFileSync(mp3Path, bin.buffer);
  await playMp3File(mp3Path);
  return true;
}

function requestBinary(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        method,
        headers: {
          ...headers,
          ...(body
            ? { "Content-Length": Buffer.byteLength(body) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            buffer: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Resolve preferred engine and speak (managed → BYO → SAPI). */
async function speakText(text) {
  const engine = cfg.ttsEngine || "auto";
  const tryNeural =
    engine === "managed" ||
    (engine === "auto" && (Boolean(cfg.licenseKey) || Boolean(cfg.openAIKey)));

  if (tryNeural) {
    if (cfg.licenseKey) {
      try {
        if (await speakTextManaged(text)) return;
      } catch (e) {
        /* fall through to BYO/SAPI */
      }
    }
    if (cfg.openAIKey) {
      try {
        if (await speakTextByoOpenAI(text)) return;
      } catch (e) {
        notify(`BYO TTS failed — system voice (${e.message || e})`);
      }
    }
  }
  await speakTextSapi(text);
}

function applyLaunchAtLogin(enabled) {
  try {
    if (typeof app.setLoginItemSettings === "function") {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        path: process.execPath,
      });
    }
  } catch {
    /* ignore on non-packaged / unsupported */
  }
}

/**
 * Capture highlighted text: Ctrl+C into focused app, then read clipboard.
 * Restores prior clipboard. Falls back to existing clipboard if no selection.
 */
async function captureSelectionText() {
  const prev = clipboard.readText();
  const marker = `__dictaste_sel_${Date.now()}__`;
  clipboard.writeText(marker);

  if (isWin()) {
    await new Promise((resolve, reject) => {
      exec(
        `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 60; [System.Windows.Forms.SendKeys]::SendWait('^c')"`,
        { windowsHide: true, timeout: 5000 },
        (err) => (err ? reject(err) : resolve())
      );
    }).catch(() => {});
    await sleep(180);
  } else {
    await sleep(50);
  }

  const text = clipboard.readText();
  // Restore previous clipboard (selection path or marker)
  try {
    clipboard.writeText(prev || "");
  } catch {
    /* ignore */
  }

  if (text && text !== marker && text.trim()) return text.trim();
  // No selection change — use prior clipboard if it had real content
  if (prev && prev.trim() && prev !== marker) return prev.trim();
  return "";
}

/** Toggle highlight-to-speak (selection / clipboard → TTS). */
async function toggleFlowRead() {
  if (reading) {
    stopSpeaking();
    notify("Stopped reading");
    return;
  }
  // Don't fight mic dictation
  if (listening) {
    await stopListening();
    await sleep(200);
  }
  let text = "";
  try {
    text = await captureSelectionText();
  } catch (e) {
    notify(`Selection failed: ${e.message || e}`);
    return;
  }
  if (!text) {
    notify(
      `Highlight text (or copy) then press ${toDisplayHotkey(hotkeyReadAccel())}`
    );
    return;
  }
  await speakReadText(text);
}

/**
 * Speak arbitrary text as highlight-to-speak; remembers it for Re-read last.
 */
async function speakReadText(text) {
  const t = String(text || "").trim();
  if (!t) {
    notify("Nothing to read", { force: true });
    return { ok: false, error: "empty" };
  }
  const wc = countWords(t);
  const minR = minWordsForReadClamped();
  if (minR > 0 && wc < minR) {
    notify(
      `Skipped read · ${wc} word${wc === 1 ? "" : "s"} (min ${minR})`,
      { force: true }
    );
    // Still remember for Re-read last if user lowers threshold later
    lastReadText = t;
    lastTranscript = t;
    rebuildTrayMenu();
    return { ok: false, error: "too_short", words: wc, min: minR };
  }
  if (reading) {
    stopSpeaking();
    await sleep(80);
  }
  if (listening) {
    await stopListening();
    await sleep(200);
  }
  const preview = t.length > 60 ? t.slice(0, 57) + "…" : t;
  lastReadText = t;
  // Also surface in "copy last" path without pushing dictation history
  lastTranscript = t;
  rebuildTrayMenu();
  notify(
    cfg?.showWordCount !== false
      ? `Reading · ${wc} word${wc === 1 ? "" : "s"} · ${preview}`
      : `Reading · ${preview}`
  );
  try {
    await speakText(t);
    return { ok: true, words: wc };
  } catch (e) {
    notify(`Read failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Re-speak the last highlight-to-speak payload without re-capturing selection.
 */
async function rereadLast() {
  const t = String(lastReadText || lastTranscript || "").trim();
  if (!t) {
    notify(
      `Nothing to re-read — highlight text and press ${toDisplayHotkey(hotkeyReadAccel())} first`,
      { force: true }
    );
    return { ok: false, error: "empty" };
  }
  return speakReadText(t);
}

function clearHistory() {
  const n = normalizeHistory(cfg?.history).length;
  cfg = { ...cfg, history: [] };
  lastTranscript = "";
  // keep lastReadText so Re-read last still works after clearing dictation history
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
  notify(n ? `History cleared (${n})` : "History already empty", { force: true });
  return { ok: true, cleared: n };
}

/**
 * Polish / rewrite highlighted (or clipboard) text and paste result.
 * Applies AI polish + replacements + auto-capitalize.
 */
async function polishSelection() {
  if (listening) {
    await stopListening();
    await sleep(200);
  }
  if (reading) stopSpeaking();
  let text = "";
  try {
    text = await captureSelectionText();
  } catch (e) {
    notify(`Selection failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
  if (!text) {
    notify(
      `Highlight text (or copy) then press ${toDisplayHotkey(hotkeyPolishAccel())}`,
      { force: true }
    );
    return { ok: false, error: "empty" };
  }
  broadcastStatus({ phase: "polishing", last: text });
  notify(
    `Polishing selection · ${text.length > 40 ? text.slice(0, 37) + "…" : text}`
  );
  try {
    const polished = await finalizeTranscript(text);
    if (!polished) {
      broadcastStatus({ phase: "idle", last: text });
      notify("Polish returned empty", { force: true });
      return { ok: false, error: "empty-result" };
    }
    pushHistory(polished);
    const del = deliverText(polished);
    broadcastStatus({ phase: "idle", last: polished });
    if (del.mode === "paste") {
      notifyDeliver(polished, "paste");
    }
    return { ok: true, polished, deliver: del.mode, words: del.words };
  } catch (e) {
    broadcastStatus({ phase: "idle", error: String(e.message || e) });
    notify(`Polish selection failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

function requestJson(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data || "{}") });
          } catch {
            resolve({ status: res.statusCode, json: { raw: data } });
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

/**
 * Apply user replacements: lines of "find=replace" (whole-word, case-insensitive).
 */
function applyReplacements(text) {
  let out = String(text || "");
  if (!out) return out;
  const raw = String(cfg?.replacements || "");
  if (!raw.trim()) return out;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const find = trimmed.slice(0, eq).trim();
    const rep = trimmed.slice(eq + 1).trim();
    if (!find) continue;
    try {
      const re = new RegExp(
        `\\b${find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "gi"
      );
      out = out.replace(re, rep);
    } catch {
      /* skip bad pattern */
    }
  }
  return out;
}

function applyAutoCapitalize(text) {
  const t = String(text || "");
  if (!t || cfg?.autoCapitalize === false) return t;
  // Capitalize first letter of string and after sentence terminators
  return t.replace(/(^|[.!?…]\s+)([a-zà-öø-ÿ])/g, (_, p, c) => p + c.toUpperCase());
}

const STT_LANG_LABELS = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "en-AU": "English (AU)",
  "es-ES": "Spanish (ES)",
  "es-MX": "Spanish (MX)",
  "fr-FR": "French",
  "de-DE": "German",
  "pt-BR": "Portuguese (BR)",
  "pt-PT": "Portuguese (PT)",
  "it-IT": "Italian",
  "nl-NL": "Dutch",
  "pl-PL": "Polish",
  "uk-UA": "Ukrainian",
  "ru-RU": "Russian",
  "ja-JP": "Japanese",
  "ko-KR": "Korean",
  "zh-CN": "Chinese (CN)",
  "zh-TW": "Chinese (TW)",
  "hi-IN": "Hindi",
  "ar-SA": "Arabic",
};

function setSttLang(lang) {
  const next = String(lang || "en-US").trim() || "en-US";
  cfg = { ...cfg, sttLang: next };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
  setTrayLabel();
  notify(`Dictation language · ${STT_LANG_LABELS[next] || next}`, { force: true });
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send("status", {
      phase: "idle",
      sttLang: next,
      configHint: true,
    });
  }
  return { ok: true, sttLang: next };
}

function setCaseMode(mode) {
  const allowed = new Set(["sentence", "lower", "upper", "title"]);
  const next = allowed.has(String(mode || "").toLowerCase())
    ? String(mode).toLowerCase()
    : "sentence";
  cfg = { ...cfg, caseMode: next };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
  notify(`Case mode · ${next}`, { force: true });
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send("status", {
      phase: "idle",
      caseMode: next,
      configHint: true,
    });
  }
  return { ok: true, caseMode: next };
}

/**
 * Case transform: sentence (auto-cap) | lower | upper | title
 */
function applyCaseMode(text) {
  const t = String(text || "");
  if (!t) return t;
  const mode = String(cfg?.caseMode || "sentence").toLowerCase();
  if (mode === "lower") return t.toLocaleLowerCase();
  if (mode === "upper") return t.toLocaleUpperCase();
  if (mode === "title") {
    return t
      .toLocaleLowerCase()
      .replace(/(^|[\s\-_/([{"'])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
  }
  // sentence (default): use autoCapitalize flag
  return applyAutoCapitalize(t);
}

/**
 * Strip common English fillers (um, uh, er, ah, hmm, you know, like as filler).
 * Conservative: only standalone tokens, not mid-word.
 */
function applyStripFillers(text) {
  let out = String(text || "");
  if (!out || cfg?.stripFillers === false) return out;
  // Multi-word first
  out = out.replace(/\b(you know|i mean|kind of|sort of)\b/gi, " ");
  // Single fillers (avoid "like" — too often real content)
  out = out.replace(/\b(um+|uh+|er+|ah+|hmm+|mm+|mhm|uh-huh|uh huh)\b/gi, " ");
  // Collapse whitespace left by removals
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1");
  return out.trim();
}

/**
 * Spoken punctuation commands → real punctuation.
 * Longer phrases first. Case-insensitive whole words.
 */
function applySpokenPunctuation(text) {
  let out = String(text || "");
  if (!out || cfg?.spokenPunctuation === false) return out;
  const rules = [
    [/\bnew paragraph\b/gi, "\n\n"],
    [/\bnew line\b/gi, "\n"],
    [/\bnext line\b/gi, "\n"],
    [/\bquestion mark\b/gi, "?"],
    [/\bexclamation (mark|point)\b/gi, "!"],
    [/\bellipsis\b/gi, "…"],
    [/\bopen quote\b/gi, "\u201C"],
    [/\bclose quote\b/gi, "\u201D"],
    [/\bopen paren(thesis)?\b/gi, "("],
    [/\bclose paren(thesis)?\b/gi, ")"],
    [/\bdash\b/gi, "—"],
    [/\bhyphen\b/gi, "-"],
    [/\bsemicolon\b/gi, ";"],
    [/\bcolon\b/gi, ":"],
    [/\bcomma\b/gi, ","],
    [/\bperiod\b/gi, "."],
    [/\bfull stop\b/gi, "."],
  ];
  for (const [re, rep] of rules) {
    out = out.replace(re, rep);
  }
  // Tidy: space before newline/punct, double spaces, space after , . ? ! :
  out = out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/([,.;:!?…])([A-Za-zÀ-öø-ÿ])/g, "$1 $2")
    .replace(/([.!?…])\s*\n/g, "$1\n")
    .trim();
  return out;
}

/**
 * iOS-style: double space → ". " when not already ending a sentence.
 * Runs before filler strip so spacing is normalized early.
 */
function applyDoubleSpacePeriod(text) {
  let out = String(text || "");
  if (!out || cfg?.doubleSpacePeriod === false) return out;
  // Two or more spaces (or space+tab) after a word char → period + space
  // Skip if already preceded by sentence terminator
  out = out.replace(/([^\s.!?…,:;])[ \t]{2,}/g, "$1. ");
  return out;
}

/**
 * Smart typography: straight quotes → curly; -- → em dash; ... → ellipsis.
 */
function applySmartQuotes(text) {
  let out = String(text || "");
  if (!out || cfg?.smartQuotes === false) return out;
  // Em dash and ellipsis first
  out = out.replace(/---/g, "—").replace(/--/g, "—");
  out = out.replace(/\.\.\./g, "…");
  // Double quotes: alternating open/close per paragraph
  out = out.replace(/(^|[\s(\[{])"([^"]*)"/g, "$1\u201C$2\u201D");
  // Remaining lone opening " before a word
  out = out.replace(/(^|[\s(\[{])"/g, "$1\u201C");
  out = out.replace(/"/g, "\u201D");
  // Single quotes / apostrophes: contractions keep ’, paired ‘ ’
  out = out.replace(/(\w)'(\w)/g, "$1\u2019$2");
  out = out.replace(/(^|[\s(\[{])'([^']*)'/g, "$1\u2018$2\u2019");
  out = out.replace(/(^|[\s(\[{])'/g, "$1\u2018");
  out = out.replace(/'/g, "\u2019");
  return out;
}

/**
 * Offline cleanup → polish → replacements → case mode.
 * Spoken punctuation + filler strip run first so polish sees clean structure.
 */
async function finalizeTranscript(text) {
  let out = String(text || "").trim();
  if (!out) return "";
  out = applyDoubleSpacePeriod(out);
  out = applySpokenPunctuation(out);
  out = applySmartQuotes(out);
  out = applyStripFillers(out);
  out = await polishText(out);
  out = applyReplacements(out);
  out = applyCaseMode(out);
  return out.trim();
}

function minWordsForPolishClamped() {
  const n = Number(cfg?.minWordsForPolish);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(50, Math.round(n)));
}

function minWordsForReadClamped() {
  const n = Number(cfg?.minWordsForRead);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(15, Math.floor(n));
}

async function polishText(text) {
  if (!cfg.polish || !text.trim()) return text;
  if (!cfg.licenseKey) return text;
  const minW = minWordsForPolishClamped();
  if (minW > 0) {
    const wc = countWords(text);
    if (wc > 0 && wc < minW) {
      // Short utterances: skip network polish (saves quota / latency)
      return text;
    }
  }
  const base = (cfg.apiBase || DEFAULT_API).replace(/\/$/, "");
  try {
    const { status, json } = await requestJson(`${base}/api/v1/polish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.licenseKey}` },
      body: { text },
    });
    if (status === 200 && json.text) return json.text;
    if (status === 402) {
      const msg =
        json?.error ||
        "Polish quota reached — upgrade to Pro for more managed polish.";
      notify(msg, { force: true });
      const upgrade =
        json?.upgradeUrl || `${base}/pricing`;
      try {
        shell.openExternal(upgrade);
      } catch {
        /* ignore */
      }
      broadcastStatus({ phase: "idle", error: msg, code: json?.code || "quota" });
      return text;
    }
    if (status === 403 && json?.code === "byo_only") {
      const msg =
        json?.error ||
        "Developer plan is BYO LLM — add your API key in Settings, or upgrade for managed polish.";
      notify(msg, { force: true });
      broadcastStatus({ phase: "idle", error: msg, code: "byo_only" });
      return text;
    }
    if (status === 401) {
      notify("License invalid — paste a valid key in Settings or re-unlock on the site.", {
        force: true,
      });
      broadcastStatus({ phase: "idle", error: "Invalid license", code: "auth" });
      return text;
    }
  } catch {
    /* keep raw */
  }
  return text;
}

/** Compare semver-ish x.y.z — returns -1 / 0 / 1 */
function cmpSemver(a, b) {
  const pa = String(a || "0")
    .replace(/^v/i, "")
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0")
    .replace(/^v/i, "")
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * List installed Windows SAPI voices (display names).
 * @returns {Promise<string[]>}
 */
function listSapiVoices() {
  return new Promise((resolve) => {
    if (!isWin()) {
      resolve([]);
      return;
    }
    const ps1 = path.join(app.getPath("temp"), `dictaste-voices-${Date.now()}.ps1`);
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "$s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }",
      "",
    ].join("\r\n");
    try {
      fs.writeFileSync(ps1, script, "utf8");
    } catch {
      resolve([]);
      return;
    }
    const proc = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { windowsHide: true }
    );
    let out = "";
    proc.stdout.on("data", (d) => {
      out += String(d);
    });
    proc.on("error", () => {
      try {
        fs.unlinkSync(ps1);
      } catch {
        /* ignore */
      }
      resolve([]);
    });
    proc.on("close", () => {
      try {
        fs.unlinkSync(ps1);
      } catch {
        /* ignore */
      }
      const names = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      resolve(names);
    });
  });
}

function historyMaxClamped() {
  const n = Number(cfg?.historyMax);
  if (!Number.isFinite(n)) return 25;
  return Math.max(10, Math.min(50, Math.round(n)));
}

function normalizeHistory(list) {
  if (!Array.isArray(list)) return [];
  const max = historyMaxClamped();
  return list
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function pushHistory(text) {
  const t = String(text || "").trim();
  if (!t) return;
  lastTranscript = t;
  const max = historyMaxClamped();
  const prev = normalizeHistory(cfg?.history);
  const next = [t, ...prev.filter((x) => x !== t)].slice(0, max);
  cfg = { ...cfg, history: next };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
}

function copyLastTranscript(index = 0) {
  const hist = normalizeHistory(cfg?.history);
  const t = String(
    hist[index] || (index === 0 ? lastTranscript : "") || ""
  ).trim();
  if (!t) {
    notify("No transcript yet — dictate first", { force: true });
    return false;
  }
  clipboard.writeText(t);
  notify(
    t.length > 80 ? `Copied · ${t.slice(0, 77)}…` : `Copied · ${t}`,
    { force: true }
  );
  return true;
}

/**
 * Re-paste last (or indexed) transcript into the focused app.
 * Uses same auto-paste / clipboard-only rules as live dictation.
 */
function pasteLastTranscript(index = 0) {
  const hist = normalizeHistory(cfg?.history);
  const t = String(
    hist[index] || (index === 0 ? lastTranscript : "") || ""
  ).trim();
  if (!t) {
    notify("No transcript yet — dictate first", { force: true });
    return { ok: false, error: "empty" };
  }
  lastTranscript = t;
  const del = deliverText(t);
  if (del.mode === "paste") {
    notifyDeliver(t, "paste");
  }
  return { ok: true, deliver: del.mode, text: t, words: del.words };
}

/**
 * Abort in-progress dictation without polish/paste.
 * Safe no-op when not listening.
 */
function cancelDictation() {
  if (!listening) {
    notify("Nothing to cancel — not dictating", { force: false });
    return { ok: false, error: "idle" };
  }
  listening = false;
  setTrayLabel();
  broadcastStatus({ phase: "canceling" });
  if (hudWin && !hudWin.isDestroyed()) {
    hudWin.webContents.send("dictate-control", {
      action: "cancel",
      soundCues: cfg.soundCues !== false,
    });
  } else {
    hideHud();
    broadcastStatus({ phase: "idle", last: "", canceled: true });
  }
  notify("Dictation canceled", { force: true });
  return { ok: true };
}

/**
 * Probe live health.releases.windows for a newer Setup zip.
 * Opens download page when behind or on probe failure (unless silent).
 * @param {{ silent?: boolean }} [opts] silent=true: only notify/open when update available
 */
async function checkForUpdates(opts = {}) {
  const silent = !!opts.silent;
  const base = (cfg?.apiBase || DEFAULT_API).replace(/\/$/, "");
  const local = appVersion();
  try {
    const { status, json } = await requestJson(`${base}/api/health`, {
      method: "GET",
    });
    if (status !== 200 || !json?.ok) {
      if (!silent) {
        notify(`Dictaste ${local} · could not check updates — opening download page`);
        shell.openExternal(`${base}/download`);
      }
      return { ok: false, local };
    }
    const file = json.releases?.windows?.file || "";
    const m = file.match(/Dictaste-Setup-(\d+\.\d+\.\d+)/i);
    const remote = m?.[1] || null;
    if (!remote) {
      if (!silent) {
        notify(`Dictaste ${local} · no Windows release in health — opening download page`);
        shell.openExternal(`${base}/download`);
      }
      return { ok: true, local, remote: null };
    }
    const cmp = cmpSemver(local, remote);
    if (cmp < 0) {
      notify(`Update available: ${local} → ${remote}. Opening download…`, {
        force: true,
      });
      shell.openExternal(`${base}/download`);
      return { ok: true, local, remote, update: true };
    }
    if (silent) {
      return { ok: true, local, remote, update: false, silent: true };
    }
    if (cmp === 0) {
      notify(`Dictaste ${local} is up to date.`, { force: true });
      return { ok: true, local, remote, update: false };
    }
    notify(`Dictaste ${local} (newer than site ${remote}).`, { force: true });
    return { ok: true, local, remote, update: false, ahead: true };
  } catch (e) {
    if (silent) {
      return { ok: false, local, error: String(e?.message || e), silent: true };
    }
    notify(`Update check failed — opening download page`, { force: true });
    try {
      shell.openExternal(`${base}/download`);
    } catch {
      /* ignore */
    }
    return { ok: false, local, error: String(e.message || e) };
  }
}

/**
 * License + usage meter from GET /api/v1/me (same contract as Mac).
 */
async function fetchLicenseStatus() {
  if (!cfg?.licenseKey) {
    return { ok: false, error: "No license key saved" };
  }
  const base = (cfg.apiBase || DEFAULT_API).replace(/\/$/, "");
  try {
    const { status, json } = await requestJson(`${base}/api/v1/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.licenseKey}` },
    });
    if (status === 401) {
      return { ok: false, error: "Invalid or expired license", status };
    }
    if (status !== 200 || !json) {
      return { ok: false, error: `HTTP ${status}`, status, raw: json };
    }
    return {
      ok: true,
      plan: json.plan,
      planName: json.planName,
      subscriptionStatus: json.subscriptionStatus,
      wordsUsed: json.wordsUsed,
      wordsLimit: json.wordsLimit,
      charsUsed: json.charsUsed,
      charsLimit: json.charsLimit,
      ttsCharsUsed: json.ttsCharsUsed,
      ttsCharsLimit: json.ttsCharsLimit,
      usagePeriod: json.usagePeriod,
      githubLogin: json.githubLogin,
      githubStarred: json.githubStarred,
      byoOnly: json.byoOnly,
      unlimited: json.unlimited,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * W1 STT: OpenAI Whisper API (BYO key) from webm/wav base64 payload.
 */
function transcribeOpenAI(base64, mime = "audio/webm") {
  return new Promise((resolve, reject) => {
    if (!cfg.openAIKey) {
      reject(new Error("OpenAI key missing for Whisper STT"));
      return;
    }
    const buf = Buffer.from(base64, "base64");
    const boundary = "----DictasteBoundary" + Date.now();
    const ext = mime.includes("wav") ? "wav" : mime.includes("mp4") ? "mp4" : "webm";
    // Whisper wants ISO-639-1; map BCP-47 en-US → en
    const langRaw = String(cfg.sttLang || "").trim();
    const langIso = langRaw.includes("-") ? langRaw.split("-")[0] : langRaw;
    const langPart = langIso
      ? `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n${langIso}\r\n`
      : "";
    const preamble =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n` +
      langPart +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="dictation.${ext}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`;
    const closing = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
      Buffer.from(preamble, "utf8"),
      buf,
      Buffer.from(closing, "utf8"),
    ]);
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.openAIKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data || "{}");
            if (res.statusCode === 200 && json.text) resolve(json.text);
            else reject(new Error(json.error?.message || `Whisper HTTP ${res.statusCode}`));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * W1 offline: spawn whisper.cpp if user configured binary + model.
 * Expects 16kHz wav path.
 */
function transcribeWhisperCli(wavPath) {
  return new Promise((resolve, reject) => {
    const bin = cfg.whisperBin;
    if (!bin || !fs.existsSync(bin)) {
      reject(new Error("whisper-cli binary not configured"));
      return;
    }
    const model = cfg.whisperModel;
    const args = model
      ? ["-m", model, "-f", wavPath, "-nt", "-np"]
      : ["-f", wavPath, "-nt", "-np"];
    exec(
      `"${bin}" ${args.map((a) => `"${a}"`).join(" ")}`,
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        const text = String(stdout || "")
          .split("\n")
          .map((l) => l.replace(/^\[[^\]]+\]\s*/, "").trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        resolve(text);
      }
    );
  });
}

function applyPasteSuffix(text) {
  const t = String(text || "");
  if (!t) return t;
  const suf = cfg?.pasteSuffix;
  if (suf == null || suf === " ") return t.endsWith(" ") ? t : t + " ";
  if (suf === "") return t;
  if (suf === "\n" || suf === "\\n") return t.endsWith("\n") ? t : t + "\n";
  if (suf === ". " || suf === "period") {
    if (/[.!?…]\s*$/.test(t)) return t.endsWith(" ") ? t : t + " ";
    return t.replace(/\s*$/, "") + ". ";
  }
  return t + String(suf);
}

function pasteDelayMsClamped() {
  const n = Number(cfg?.pasteDelayMs);
  if (!Number.isFinite(n)) return 80;
  return Math.max(0, Math.min(1000, Math.round(n)));
}

function silenceTimeoutMsClamped() {
  const n = Number(cfg?.silenceTimeoutMs);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(30000, Math.round(n)));
}

function maxDictationMsClamped() {
  const n = Number(cfg?.maxDictationMs);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(600000, Math.round(n)));
}

function pasteText(text) {
  if (!text) return;
  const payload = applyPasteSuffix(text);
  const prev = clipboard.readText();
  clipboard.writeText(payload);
  const delay = pasteDelayMsClamped();
  // Windows: SendKeys Ctrl+V into focused window
  exec(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds ${delay}; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
    () => {
      setTimeout(() => clipboard.writeText(prev), 500 + delay);
    }
  );
}

function countWords(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  // Unicode-aware-ish: split on whitespace / punctuation runs
  return t.split(/[\s\u00A0]+/).filter(Boolean).length;
}

/**
 * Toast after deliver: optional word count + short preview.
 * @param {string} text
 * @param {"paste"|"clipboard"} mode
 */
function notifyDeliver(text, mode) {
  const t = String(text || "").trim();
  if (!t) return;
  const words = countWords(t);
  const wc =
    cfg?.showWordCount !== false && words > 0
      ? `${words} word${words === 1 ? "" : "s"}`
      : "";
  const preview =
    t.length > 72 ? t.slice(0, 69).replace(/\s+\S*$/, "") + "…" : t;
  if (mode === "clipboard") {
    notify(wc ? `Copied · ${wc} — Ctrl+V` : "Copied — Ctrl+V to paste", {
      force: true,
    });
    return;
  }
  // paste
  if (wc && cfg?.showWordCount !== false) {
    notify(preview ? `Pasted · ${wc} · ${preview}` : `Pasted · ${wc}`, {
      force: true,
    });
  } else if (preview) {
    notify(preview);
  }
}

/**
 * Deliver final text: paste into focused app, or leave on clipboard only.
 * When autoPaste is off, keeps polished text on clipboard for manual Ctrl+V.
 */
function deliverText(text) {
  const t = String(text || "");
  if (!t) return { mode: "empty", words: 0 };
  const words = countWords(t);
  if (cfg?.autoPaste !== false) {
    pasteText(t);
    return { mode: "paste", words };
  }
  const payload = applyPasteSuffix(t);
  clipboard.writeText(payload);
  notifyDeliver(t, "clipboard");
  return { mode: "clipboard", words };
}

const TEST_VOICE_SAMPLES = {
  "en-US": "Dictaste is ready. Speak it. Ship it.",
  "en-GB": "Dictaste is ready. Speak it. Ship it.",
  "en-AU": "Dictaste is ready. Speak it. Ship it.",
  "es-ES": "Dictaste está listo. Habla y envía.",
  "es-MX": "Dictaste está listo. Habla y envía.",
  "fr-FR": "Dictaste est prêt. Parlez et expédiez.",
  "de-DE": "Dictaste ist bereit. Sprechen und senden.",
  "pt-BR": "Dictaste está pronto. Fale e envie.",
  "pt-PT": "Dictaste está pronto. Fale e envie.",
  "it-IT": "Dictaste è pronto. Parla e spedisci.",
  "nl-NL": "Dictaste is klaar. Spreek en verstuur.",
  "pl-PL": "Dictaste jest gotowy. Mów i wysyłaj.",
  "uk-UA": "Dictaste готовий. Говоріть і надсилайте.",
  "ru-RU": "Dictaste готов. Говорите и отправляйте.",
  "ja-JP": "ディクテイストの準備ができました。",
  "ko-KR": "딕테이스트가 준비되었습니다.",
  "zh-CN": "Dictaste 已就绪。说出来，交付出去。",
  "zh-TW": "Dictaste 已就緒。說出來，交付出去。",
  "hi-IN": "डिक्टेस्ट तैयार है। बोलें और भेजें।",
  "ar-SA": "ديكتاست جاهز. تكلم وأرسل.",
};

async function testVoice() {
  const lang = cfg?.sttLang || "en-US";
  const sample =
    TEST_VOICE_SAMPLES[lang] || TEST_VOICE_SAMPLES["en-US"];
  try {
    notify(`Testing voice · ${lang}`, { force: true });
    await speakText(sample);
    return { ok: true, sample, lang };
  } catch (e) {
    notify(`Test voice failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * @param {string} body
 * @param {{ force?: boolean }} [opts] force=true bypasses quietNotifications
 */
function notify(body, opts = {}) {
  try {
    if (cfg?.quietNotifications && !opts.force) return;
    if (Notification.isSupported()) {
      new Notification({ title: "Dictaste", body }).show();
    }
  } catch {
    /* ignore */
  }
}

function setTrayLabel() {
  if (!tray) return;
  const d = toDisplayHotkey(hotkeyDictateAccel());
  const r = toDisplayHotkey(hotkeyReadAccel());
  const lang = STT_LANG_LABELS[cfg?.sttLang] || cfg?.sttLang || "en-US";
  if (hotkeysPaused) {
    if (pauseResumeAt > Date.now()) {
      const mins = Math.max(1, Math.ceil((pauseResumeAt - Date.now()) / 60_000));
      tray.setToolTip(`Dictaste — hotkeys paused (~${mins}m left)`);
    } else {
      tray.setToolTip("Dictaste — hotkeys paused");
    }
  } else if (listening) {
    tray.setToolTip(`Dictaste — listening · ${lang} (${d} to stop)`);
  } else if (reading) {
    tray.setToolTip(`Dictaste — reading (${r} to stop)`);
  } else {
    tray.setToolTip(`Dictaste — dictate ${d} · ${lang}`);
  }
}

function broadcastStatus(extra = {}) {
  const payload = { listening, ...extra };
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send("status", payload);
  }
  if (hudWin && !hudWin.isDestroyed()) {
    hudWin.webContents.send("status", payload);
  }
}

function hudSize() {
  if (cfg?.hudCompact) return { width: 280, height: 64 };
  return { width: 360, height: 120 };
}

function ensureHud() {
  if (hudWin && !hudWin.isDestroyed()) return hudWin;
  const { width, height } = hudSize();
  hudWin = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  hudWin.loadFile(path.join(__dirname, "hud.html"));
  hudWin.on("closed", () => {
    hudWin = null;
  });
  return hudWin;
}

function applyHudSize() {
  if (!hudWin || hudWin.isDestroyed()) return;
  const { width, height } = hudSize();
  try {
    hudWin.setSize(width, height);
  } catch {
    /* ignore */
  }
  hudWin.webContents.send("dictate-control", {
    action: "style",
    hudCompact: !!cfg?.hudCompact,
  });
}

function setHudCompact(on) {
  cfg = { ...cfg, hudCompact: !!on };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  applyHudSize();
  rebuildTrayMenu();
  notify(cfg.hudCompact ? "Compact HUD on" : "Compact HUD off", { force: true });
  return { ok: true, hudCompact: cfg.hudCompact };
}

function showHud() {
  const w = ensureHud();
  applyHudSize();
  w.showInactive();
  w.setAlwaysOnTop(true, "screen-saver");
}

function hideHud() {
  if (hudWin && !hudWin.isDestroyed()) hudWin.hide();
}

async function startListening() {
  if (listening) return;
  listening = true;
  setTrayLabel();
  showHud();
  broadcastStatus({ phase: "listening" });
  if (hudWin && !hudWin.isDestroyed()) {
    hudWin.webContents.send("dictate-control", {
      action: "start",
      sttMode: cfg.sttMode || "webspeech",
      sttLang: cfg.sttLang || "en-US",
      soundCues: cfg.soundCues !== false,
      silenceTimeoutMs: silenceTimeoutMsClamped(),
      maxDictationMs: maxDictationMsClamped(),
      hudCompact: !!cfg.hudCompact,
    });
  }
  // Also open settings window if never opened so user can save license first session
  if (!cfg.licenseKey) {
    openSettings();
  }
}

async function stopListening() {
  if (!listening) return;
  listening = false;
  setTrayLabel();
  broadcastStatus({ phase: "stopping" });
  if (hudWin && !hudWin.isDestroyed()) {
    hudWin.webContents.send("dictate-control", {
      action: "stop",
      soundCues: cfg.soundCues !== false,
    });
  }
}

function exportHistory() {
  const hist = normalizeHistory(cfg?.history);
  if (!hist.length) {
    notify("No transcripts to export yet", { force: true });
    return { ok: false, error: "empty" };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(app.getPath("documents"), `Dictaste-history-${stamp}.txt`);
  const body =
    `# Dictaste recent transcripts\n# ${new Date().toISOString()}\n\n` +
    hist.map((t, i) => `${i + 1}. ${t}`).join("\n\n") +
    "\n";
  try {
    fs.writeFileSync(dest, body, "utf8");
    shell.showItemInFolder(dest);
    notify(`Exported ${hist.length} transcripts`, { force: true });
    return { ok: true, path: dest, count: hist.length };
  } catch (e) {
    notify(`Export failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Import transcripts from a .txt export (or plain lines).
 * Merges into history (newest first), capped by historyMax.
 */
async function importHistory() {
  try {
    const win = settingsWin && !settingsWin.isDestroyed() ? settingsWin : null;
    const res = await dialog.showOpenDialog(win || undefined, {
      title: "Import Dictaste history",
      filters: [
        { name: "Text", extensions: ["txt", "md", "log"] },
        { name: "All", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { ok: false, error: "canceled" };
    }
    const raw = fs.readFileSync(res.filePaths[0], "utf8");
    const lines = raw.split(/\r?\n/);
    const items = [];
    let buf = [];
    const flush = () => {
      const joined = buf.join("\n").trim();
      buf = [];
      if (!joined || joined.startsWith("#")) return;
      // Strip leading "1. " numbering from export format
      const cleaned = joined.replace(/^\d+\.\s+/, "").trim();
      if (cleaned) items.push(cleaned);
    };
    for (const line of lines) {
      if (/^\d+\.\s+/.test(line)) {
        flush();
        buf.push(line);
      } else if (line.trim() === "") {
        flush();
      } else if (!line.trim().startsWith("#")) {
        buf.push(line);
      }
    }
    flush();
    // Also accept plain non-empty lines if no numbered blocks found
    if (!items.length) {
      for (const line of lines) {
        const s = line.trim();
        if (s && !s.startsWith("#")) items.push(s);
      }
    }
    if (!items.length) {
      notify("No transcripts found in file", { force: true });
      return { ok: false, error: "empty" };
    }
    const max = historyMaxClamped();
    const prev = normalizeHistory(cfg?.history);
    // Imported file order: treat as oldest→newest if numbered export; reverse so newest first
    const imported = items.slice().reverse();
    const merged = [];
    const seen = new Set();
    for (const t of [...imported, ...prev]) {
      const key = t.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(key);
      if (merged.length >= max) break;
    }
    cfg = { ...cfg, history: merged };
    if (merged[0]) lastTranscript = merged[0];
    saveConfig(cfg);
    rebuildTrayMenu();
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send("status", { phase: "idle", historyImported: true });
    }
    notify(`Imported ${items.length} · history now ${merged.length}`, {
      force: true,
    });
    return { ok: true, imported: items.length, total: merged.length };
  } catch (e) {
    notify(`Import history failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

function toggleListen() {
  if (listening) stopListening();
  else startListening();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 480,
    height: 720,
    title: "Dictaste",
    backgroundColor: "#0A0A0B",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  settingsWin.loadFile(path.join(__dirname, "settings.html"));
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

function appVersion() {
  try {
    return app.getVersion() || require("../package.json").version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

/** Open Electron userData (config.json lives here). */
function openUserDataFolder() {
  try {
    const dir = app.getPath("userData");
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    notify("Opened data folder", { force: true });
    return { ok: true, path: dir };
  } catch (e) {
    notify(`Open data folder failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

/** Restore default hotkeys and re-register. */
function resetHotkeys() {
  cfg = {
    ...cfg,
    hotkeyDictate: DEFAULT_HOTKEY_DICTATE,
    hotkeyRead: DEFAULT_HOTKEY_READ,
    hotkeyPolish: DEFAULT_HOTKEY_POLISH,
    hotkeyCancel: DEFAULT_HOTKEY_CANCEL,
    hotkeyPasteLast: DEFAULT_HOTKEY_PASTE_LAST,
  };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  if (!hotkeysPaused) registerHotkeys();
  else rebuildTrayMenu();
  notify(
    `Hotkeys reset · Dictate ${toDisplayHotkey(DEFAULT_HOTKEY_DICTATE)} · Read ${toDisplayHotkey(DEFAULT_HOTKEY_READ)}`,
    { force: true }
  );
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send("status", {
      phase: "idle",
      hotkeysReset: true,
      configHint: true,
    });
  }
  return {
    ok: true,
    hotkeyDictate: cfg.hotkeyDictate,
    hotkeyRead: cfg.hotkeyRead,
    hotkeyPolish: cfg.hotkeyPolish,
    hotkeyCancel: cfg.hotkeyCancel,
    hotkeyPasteLast: cfg.hotkeyPasteLast,
  };
}

function rebuildTrayMenu() {
  if (!tray) return;
  const base = () => (cfg.apiBase || DEFAULT_API).replace(/\/$/, "");
  const d = toDisplayHotkey(hotkeyDictateAccel());
  const r = toDisplayHotkey(hotkeyReadAccel());
  const p = toDisplayHotkey(hotkeyPolishAccel());
  const menu = Menu.buildFromTemplate([
    { label: `Dictaste ${appVersion()}`, enabled: false },
    {
      label: hotkeysPaused
        ? pauseResumeAt > Date.now()
          ? `Hotkeys: PAUSED (until ${new Date(pauseResumeAt).toLocaleTimeString()})`
          : "Hotkeys: PAUSED"
        : "Hotkeys: active",
      enabled: false,
    },
    { type: "separator" },
    {
      label: `Toggle dictation (${d})`,
      enabled: !hotkeysPaused,
      click: () => toggleListen(),
    },
    {
      label: `Read selection (${r})`,
      enabled: !hotkeysPaused,
      click: () => {
        toggleFlowRead().catch(() => {});
      },
    },
    {
      label: `Polish selection (${p})`,
      enabled: !hotkeysPaused,
      click: () => {
        polishSelection().catch(() => {});
      },
    },
    {
      label: "Stop reading",
      click: () => stopSpeaking(),
    },
    {
      label: "Re-read last",
      enabled: !!String(lastReadText || lastTranscript || "").trim() && !hotkeysPaused,
      click: () => {
        rereadLast().catch(() => {});
      },
    },
    {
      label: hotkeysPaused ? "Resume hotkeys" : "Pause hotkeys",
      click: () => setHotkeysPaused(!hotkeysPaused),
    },
    {
      label: "Pause hotkeys…",
      enabled: !hotkeysPaused,
      submenu: [
        {
          label: "Pause 5 minutes",
          click: () => setHotkeysPaused(true, { minutes: 5 }),
        },
        {
          label: "Pause 15 minutes",
          click: () => setHotkeysPaused(true, { minutes: 15 }),
        },
        {
          label: "Pause 30 minutes",
          click: () => setHotkeysPaused(true, { minutes: 30 }),
        },
        {
          label: "Pause until resume (remember)",
          click: () => setHotkeysPaused(true, { persist: true }),
        },
      ],
    },
    {
      label: `Cancel dictation (${toDisplayHotkey(hotkeyCancelAccel())})`,
      enabled: listening && !hotkeysPaused,
      click: () => cancelDictation(),
    },
    {
      label: "Copy last transcript",
      enabled: !!String(lastTranscript || cfg?.history?.[0] || "").trim(),
      click: () => copyLastTranscript(0),
    },
    {
      label: `Paste last transcript (${toDisplayHotkey(hotkeyPasteLastAccel())})`,
      enabled:
        !!String(lastTranscript || cfg?.history?.[0] || "").trim() &&
        !hotkeysPaused,
      click: () => pasteLastTranscript(0),
    },
    {
      label: "Test voice",
      click: () => {
        testVoice().catch(() => {});
      },
    },
    {
      label: `Language · ${STT_LANG_LABELS[cfg?.sttLang] || cfg?.sttLang || "en-US"}`,
      submenu: Object.keys(STT_LANG_LABELS).map((code) => ({
        label: STT_LANG_LABELS[code],
        type: "radio",
        checked: (cfg?.sttLang || "en-US") === code,
        click: () => setSttLang(code),
      })),
    },
    {
      label: `Case · ${String(cfg?.caseMode || "sentence")}`,
      submenu: [
        {
          label: "Sentence (auto-capitalize)",
          type: "radio",
          checked: (cfg?.caseMode || "sentence") === "sentence",
          click: () => setCaseMode("sentence"),
        },
        {
          label: "lower case",
          type: "radio",
          checked: cfg?.caseMode === "lower",
          click: () => setCaseMode("lower"),
        },
        {
          label: "UPPER CASE",
          type: "radio",
          checked: cfg?.caseMode === "upper",
          click: () => setCaseMode("upper"),
        },
        {
          label: "Title Case",
          type: "radio",
          checked: cfg?.caseMode === "title",
          click: () => setCaseMode("title"),
        },
      ],
    },
    {
      label: cfg?.hudCompact ? "HUD: compact ✓" : "HUD: compact",
      type: "checkbox",
      checked: !!cfg?.hudCompact,
      click: (item) => setHudCompact(!!item.checked),
    },
    {
      label: cfg?.smartQuotes !== false ? "Smart quotes ✓" : "Smart quotes",
      type: "checkbox",
      checked: cfg?.smartQuotes !== false,
      click: (item) => {
        cfg = { ...cfg, smartQuotes: !!item.checked };
        try {
          saveConfig(cfg);
        } catch {
          /* ignore */
        }
        rebuildTrayMenu();
        notify(
          cfg.smartQuotes ? "Smart quotes on" : "Smart quotes off",
          { force: true }
        );
      },
    },
    {
      label: "Export settings…",
      click: () => exportSettings({ includeSecrets: false }),
    },
    {
      label: "Open data folder…",
      click: () => openUserDataFolder(),
    },
    {
      label: "Reset hotkeys to defaults",
      click: () => resetHotkeys(),
    },
    {
      label: `Recent transcripts (${normalizeHistory(cfg?.history).length}/${historyMaxClamped()})`,
      enabled: normalizeHistory(cfg?.history).length > 0,
      submenu: (() => {
        const hist = normalizeHistory(cfg?.history);
        if (!hist.length) {
          return [{ label: "(empty)", enabled: false }];
        }
        return [
          ...hist.map((t, i) => ({
            label: (t.length > 42 ? t.slice(0, 39) + "…" : t).replace(/\s+/g, " "),
            submenu: [
              {
                label: "Paste into focused app",
                enabled: !hotkeysPaused,
                click: () => pasteLastTranscript(i),
              },
              {
                label: "Copy to clipboard",
                click: () => copyLastTranscript(i),
              },
            ],
          })),
          { type: "separator" },
          {
            label: "Paste latest",
            enabled: !hotkeysPaused,
            click: () => pasteLastTranscript(0),
          },
          {
            label: "Export history…",
            click: () => exportHistory(),
          },
          {
            label: "Import history…",
            click: () => {
              importHistory().catch(() => {});
            },
          },
          {
            label: "Clear history",
            click: () => clearHistory(),
          },
        ];
      })(),
    },
    { label: "Settings…", click: () => openSettings() },
    {
      label: "Open dashboard",
      click: () => shell.openExternal(`${base()}/dashboard`),
    },
    {
      label: "Unlock free Developer plan",
      click: () => shell.openExternal(`${base()}/developers/setup`),
    },
    {
      label: "Pricing",
      click: () => shell.openExternal(`${base()}/pricing`),
    },
    {
      label: "Download page",
      click: () => shell.openExternal(`${base()}/download`),
    },
    {
      label: "Check for updates…",
      click: () => {
        checkForUpdates().catch(() => {});
      },
    },
    {
      label: "Help / Issues",
      click: () => shell.openExternal("https://github.com/johnmatveyev-lab/dictaste/issues"),
    },
    {
      label: "Star on GitHub",
      click: () => shell.openExternal("https://github.com/johnmatveyev-lab/dictaste"),
    },
    { type: "separator" },
    { label: "Quit Dictaste", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  if (tray) {
    try {
      tray.destroy();
    } catch {
      /* ignore */
    }
    tray = null;
  }
  const img = makeTrayIcon();
  tray = new Tray(img);
  rebuildTrayMenu();
  setTrayLabel();
  tray.on("click", () => openSettings());
}

app.whenReady().then(() => {
  cfg = loadConfig();
  // Normalize hotkeys into accelerator form on load
  cfg.hotkeyDictate = hotkeyDictateAccel();
  cfg.hotkeyRead = hotkeyReadAccel();
  cfg.hotkeyPolish = hotkeyPolishAccel();
  cfg.hotkeyCancel = hotkeyCancelAccel();
  cfg.hotkeyPasteLast = hotkeyPasteLastAccel();
  applyLaunchAtLogin(cfg.launchAtLogin);
  // Restore paused state from prior session when enabled
  if (cfg.persistPauseHotkeys !== false && cfg.hotkeysPaused) {
    hotkeysPaused = true;
  }
  createTray();
  ensureHud();
  if (hotkeysPaused) {
    try {
      globalShortcut.unregisterAll();
    } catch {
      /* ignore */
    }
    rebuildTrayMenu();
    setTrayLabel();
    setTimeout(() => {
      notify("Hotkeys still paused from last session — resume from tray", {
        force: true,
      });
    }, 1500);
  } else {
    registerHotkeys();
  }

  ipcMain.handle("get-config", () => ({
    ...cfg,
    hotkeysPausedRuntime: hotkeysPaused,
    pauseResumeAt: pauseResumeAt || null,
    hotkeyDictateDisplay: toDisplayHotkey(hotkeyDictateAccel()),
    hotkeyReadDisplay: toDisplayHotkey(hotkeyReadAccel()),
    hotkeyPolishDisplay: toDisplayHotkey(hotkeyPolishAccel()),
    hotkeyCancelDisplay: toDisplayHotkey(hotkeyCancelAccel()),
    hotkeyPasteLastDisplay: toDisplayHotkey(hotkeyPasteLastAccel()),
  }));
  ipcMain.handle("save-config", (_e, next) => {
    const prev = { ...cfg };
    cfg = { ...cfg, ...next };
    if (next?.hotkeyDictate != null) {
      cfg.hotkeyDictate = toAccelerator(next.hotkeyDictate, DEFAULT_HOTKEY_DICTATE);
    }
    if (next?.hotkeyRead != null) {
      cfg.hotkeyRead = toAccelerator(next.hotkeyRead, DEFAULT_HOTKEY_READ);
    }
    if (next?.hotkeyPolish != null) {
      cfg.hotkeyPolish = toAccelerator(next.hotkeyPolish, DEFAULT_HOTKEY_POLISH);
    }
    if (next?.hotkeyCancel != null) {
      cfg.hotkeyCancel = toAccelerator(next.hotkeyCancel, DEFAULT_HOTKEY_CANCEL);
    }
    if (next?.hotkeyPasteLast != null) {
      cfg.hotkeyPasteLast = toAccelerator(
        next.hotkeyPasteLast,
        DEFAULT_HOTKEY_PASTE_LAST
      );
    }
    saveConfig(cfg);
    if (Object.prototype.hasOwnProperty.call(next || {}, "launchAtLogin")) {
      applyLaunchAtLogin(cfg.launchAtLogin);
    }
    const hotkeysChanged =
      prev.hotkeyDictate !== cfg.hotkeyDictate ||
      prev.hotkeyRead !== cfg.hotkeyRead ||
      prev.hotkeyPolish !== cfg.hotkeyPolish ||
      prev.hotkeyCancel !== cfg.hotkeyCancel ||
      prev.hotkeyPasteLast !== cfg.hotkeyPasteLast;
    if (
      hotkeysChanged ||
      next?.hotkeyDictate != null ||
      next?.hotkeyRead != null ||
      next?.hotkeyPolish != null ||
      next?.hotkeyCancel != null ||
      next?.hotkeyPasteLast != null
    ) {
      registerHotkeys();
    } else {
      rebuildTrayMenu();
      setTrayLabel();
    }
    return {
      ...cfg,
      hotkeyDictateDisplay: toDisplayHotkey(hotkeyDictateAccel()),
      hotkeyReadDisplay: toDisplayHotkey(hotkeyReadAccel()),
      hotkeyPolishDisplay: toDisplayHotkey(hotkeyPolishAccel()),
      hotkeyCancelDisplay: toDisplayHotkey(hotkeyCancelAccel()),
      hotkeyPasteLastDisplay: toDisplayHotkey(hotkeyPasteLastAccel()),
    };
  });
  ipcMain.handle("polish-and-paste", async (_e, text) => {
    const polished = await finalizeTranscript(String(text || ""));
    pushHistory(polished);
    deliverText(polished);
    return polished;
  });
  ipcMain.handle("license-status", async () => fetchLicenseStatus());
  ipcMain.handle("check-for-updates", async () => checkForUpdates());
  ipcMain.handle("list-sapi-voices", async () => listSapiVoices());
  ipcMain.handle("test-voice", async () => testVoice());
  ipcMain.handle("copy-last-transcript", (_e, index) =>
    copyLastTranscript(Number(index) || 0)
  );
  ipcMain.handle("paste-last-transcript", (_e, index) =>
    pasteLastTranscript(Number(index) || 0)
  );
  ipcMain.handle("cancel-dictation", () => cancelDictation());
  ipcMain.handle("get-history", () => normalizeHistory(cfg?.history));
  ipcMain.handle("export-history", () => exportHistory());
  ipcMain.handle("import-history", async () => importHistory());
  ipcMain.handle("open-user-data", () => openUserDataFolder());
  ipcMain.handle("reset-hotkeys", () => resetHotkeys());
  ipcMain.handle("set-stt-lang", (_e, lang) => setSttLang(lang));
  ipcMain.handle("set-case-mode", (_e, mode) => setCaseMode(mode));
  ipcMain.handle("set-hud-compact", (_e, on) => setHudCompact(!!on));
  ipcMain.handle("clear-history", () => clearHistory());
  ipcMain.handle("reread-last", async () => rereadLast());
  ipcMain.handle("get-hotkeys-paused", () => ({
    paused: hotkeysPaused,
    resumeAt: pauseResumeAt || null,
  }));
  ipcMain.handle("set-hotkeys-paused", (_e, paused, opts) =>
    setHotkeysPaused(!!paused, opts && typeof opts === "object" ? opts : {})
  );
  ipcMain.handle("pause-hotkeys-for", (_e, minutes) =>
    setHotkeysPaused(true, { minutes: Number(minutes) || 0 })
  );
  ipcMain.handle("export-settings", (_e, opts) =>
    exportSettings(opts || { includeSecrets: false })
  );
  ipcMain.handle("import-settings", async () => importSettings());
  ipcMain.handle("read-selection", async () => {
    await toggleFlowRead();
    return { reading };
  });
  ipcMain.handle("polish-selection", async () => polishSelection());
  ipcMain.handle("stop-reading", () => {
    stopSpeaking();
    return true;
  });
  ipcMain.handle("open-external", (_e, url) => shell.openExternal(url));
  ipcMain.handle("set-listening", (_e, on) => {
    if (on) startListening();
    else stopListening();
    return listening;
  });

  /** HUD finished a session with transcript and/or audio — STT + polish + paste */
  ipcMain.handle("session-complete", async (_e, payload = {}) => {
    // discard path: cancel hotkey / abort without paste
    if (payload.discard || payload.canceled) {
      listening = false;
      setTrayLabel();
      hideHud();
      broadcastStatus({ phase: "idle", last: "", canceled: true });
      return { polished: "", canceled: true };
    }
    return sessionCompleteBody(payload);
  });

  async function sessionCompleteBody(payload = {}) {
    listening = false;
    setTrayLabel();
    hideHud();
    let raw = String(payload.text || "").trim();
    const mode = cfg.sttMode || "webspeech";

    // Prefer audio STT when mode is openai / whisper-cli and audio present
    if (!raw && payload.audioBase64) {
      broadcastStatus({ phase: "transcribing" });
      try {
        if (mode === "openai") {
          raw = await transcribeOpenAI(payload.audioBase64, payload.mime || "audio/webm");
        } else if (mode === "whisper-cli") {
          const tmp = path.join(
            app.getPath("temp"),
            `dictaste-${Date.now()}.${(payload.mime || "").includes("wav") ? "wav" : "webm"}`
          );
          fs.writeFileSync(tmp, Buffer.from(payload.audioBase64, "base64"));
          try {
            raw = await transcribeWhisperCli(tmp);
          } finally {
            try {
              fs.unlinkSync(tmp);
            } catch {
              /* ignore */
            }
          }
        }
      } catch (e) {
        notify(`STT failed: ${e.message || e}`);
        broadcastStatus({ phase: "idle", last: "", error: String(e.message || e) });
        return { polished: "", error: String(e.message || e) };
      }
    }

    raw = String(raw || "").trim();
    if (!raw) {
      broadcastStatus({ phase: "idle", last: "" });
      return { polished: "" };
    }
    broadcastStatus({ phase: "polishing", last: raw });
    const polished = await finalizeTranscript(raw);
    pushHistory(polished);
    const del = deliverText(polished);
    broadcastStatus({ phase: "idle", last: polished });
    if (del.mode === "paste") {
      notifyDeliver(polished, "paste");
    } else if (del.mode === "clipboard") {
      // deliverText already notified via notifyDeliver
    }
    return { polished, deliver: del.mode, words: del.words };
  }

  // First-run: open settings so license can be pasted + welcome toast
  if (!cfg.licenseKey) {
    setTimeout(() => openSettings(), 400);
  }
  if (!cfg.seenWelcome) {
    setTimeout(() => {
      notify(
        `Welcome · Dictaste ${appVersion()}. Dictate ${toDisplayHotkey(hotkeyDictateAccel())} · Cancel ${toDisplayHotkey(hotkeyCancelAccel())} · Paste last ${toDisplayHotkey(hotkeyPasteLastAccel())}. Remap in Settings.`
      );
      cfg.seenWelcome = true;
      saveConfig(cfg);
    }, 1200);
  }

  // Silent startup update check — only notifies when a newer Setup is live
  setTimeout(() => {
    checkForUpdates({ silent: true }).catch(() => {});
  }, 8000);
});

app.on("will-quit", () => {
  stopSpeaking();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", (e) => {
  e.preventDefault?.();
});
