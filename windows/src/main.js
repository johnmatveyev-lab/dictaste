/**
 * Dictaste Windows MVP
 * - Paste current date/time (tray + Settings)
 * - Privacy: clear clipboard after paste/copy
 * - Local session stats (words + dictations today)
 * - Test NVIDIA / OpenAI BYO key connection
 * - Merge history with next · duplicate history item
 * - BYO NVIDIA NIM polish + Magpie TTS (nvapi key)
 * - Snippets — quick paste phrases from tray + Settings
 * - Reorder history · boost to top · pin move up/down
 * - Pin history items (stay on top · survive clear of recents)
 * - Edit history item · read history aloud (TTS)
 * - History search · copy all history · tray plan/usage · delete item
 * - Sticky HUD position · tray TTS rate presets
 * - Re-polish last · copy support diagnostics
 * - Live HUD word count · skip short highlight-to-speak under N words
 * - Re-read last · clear history (tray)
 * - Tray app + lime brand icon
 * - Remappable global hotkeys (defaults Ctrl+Shift+Space / Ctrl+Shift+R)
 * - Web Speech STT in always-on-top HUD
 * - Auto polish via /api/v1/polish + paste (Ctrl+V) on stop
 * - Highlight-to-speak: selection/clipboard
 *   · free system SAPI voices
 *   · managed premium TTS via /api/v1/tts (Pro)
 *   · BYO NVIDIA Magpie TTS when nvidiaKey set
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
     * Privacy: after auto-paste, restore empty clipboard (not prior contents).
     * After clipboard-only deliver, clear clipboard after a short delay.
     */
    clearClipboardAfter: false,
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
    /** Saved HUD origin (null = OS default / top-center on first show). */
    hudPosX: null,
    hudPosY: null,
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
    /**
     * After a successful dictation paste/clipboard, automatically start listening again.
     * Stop with the dictate hotkey, Cancel, or turn continuous off in tray/Settings.
     */
    continuousDictation: false,
    /**
     * When on, each new dictation is appended to the previous transcript
     * (space-separated) before paste — great with continuous mode for long notes.
     */
    appendDictation: false,
    /**
     * How to join when appendDictation is on:
     * space | newline | paragraph (blank line)
     */
    appendJoiner: "space",
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
    /** NGC / NVIDIA NIM API key — BYO polish + Magpie TTS */
    nvidiaKey: "",
    nvidiaPolishModel: "nvidia/nemotron-mini-4b-instruct",
    /** Magpie speaker id */
    nvidiaVoice: "English-US.Female-1",
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
    /**
     * Pinned transcripts (shown first; not capped by historyMax recents).
     * Max 10. Survive “clear recents”; removed by unpin/delete/clear all.
     */
    pinnedHistory: [],
    /**
     * Quick-paste snippets (tray Snippets menu + Settings editor).
     * One phrase per entry; max 20. Not pushed into dictation history unless pasted via dictation.
     */
    snippets: [],
    /**
     * Local-only daily stats (not sent to server).
     * { day: "YYYY-MM-DD", words: number, dictations: number }
     */
    usageStats: { day: "", words: 0, dictations: 0 },
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
    pasteLastTranscript(0, { latest: true });
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
  "clearClipboardAfter",
  "pasteSuffix",
  "pasteDelayMs",
  "silenceTimeoutMs",
  "maxDictationMs",
  "doubleSpacePeriod",
  "smartQuotes",
  "hudCompact",
  "hudPosX",
  "hudPosY",
  "showWordCount",
  "minWordsForPolish",
  "minWordsForRead",
  "continuousDictation",
  "appendDictation",
  "appendJoiner",
  "sttMode",
  "sttLang",
  "caseMode",
  "whisperBin",
  "whisperModel",
  "ttsRate",
  "ttsSapiVoice",
  "ttsEngine",
  "ttsVoice",
  "nvidiaPolishModel",
  "nvidiaVoice",
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
  "snippets",
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
      out.settings.nvidiaKey = cfg?.nvidiaKey || "";
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
    if (typeof incoming.nvidiaKey === "string" && incoming.nvidiaKey) {
      next.nvidiaKey = incoming.nvidiaKey;
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
/** Cached license/plan label for tray (refreshed async) */
let cachedPlanLabel = "";
let planRefreshInFlight = false;
let lastPlanRefreshAt = 0;
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

/** Resolve preferred engine and speak (managed → NVIDIA → OpenAI → SAPI). */
async function speakText(text) {
  const engine = cfg.ttsEngine || "auto";
  const tryNeural =
    engine === "managed" ||
    engine === "nvidia" ||
    (engine === "auto" &&
      (Boolean(cfg.licenseKey) || Boolean(cfg.openAIKey) || Boolean(cfg.nvidiaKey)));

  if (engine === "nvidia") {
    if (cfg.nvidiaKey) {
      try {
        if (await speakTextByoNVIDIA(text)) return;
      } catch (e) {
        notify(`NVIDIA TTS failed — system voice (${e.message || e})`);
      }
    }
    await speakTextSapi(text);
    return;
  }

  if (tryNeural) {
    if (cfg.licenseKey && engine !== "nvidia") {
      try {
        if (await speakTextManaged(text)) return;
      } catch (e) {
        /* fall through */
      }
    }
    if (cfg.nvidiaKey) {
      try {
        if (await speakTextByoNVIDIA(text)) return;
      } catch (e) {
        /* fall through */
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

/**
 * BYO NVIDIA Magpie TTS via NIM (OpenAI-compatible /audio/speech, then Magpie invoke).
 */
async function speakTextByoNVIDIA(text) {
  const key = (cfg.nvidiaKey || "").trim();
  if (!key || !text?.trim()) return false;
  broadcastStatus({ phase: "tts", reading: false, engine: "nvidia" });
  const models = [
    "nvidia/magpie-tts-multilingual",
    "magpie-tts-multilingual",
  ];
  const voice = cfg.nvidiaVoice || "English-US.Female-1";
  for (const model of models) {
    try {
      const bin = await requestBinary(
        "https://integrate.api.nvidia.com/v1/audio/speech",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Accept: "application/octet-stream",
          },
          body: JSON.stringify({
            model,
            input: text,
            voice,
            response_format: "mp3",
          }),
        }
      );
      if (bin.ok && bin.buffer?.length > 64) {
        const mp3Path = path.join(
          app.getPath("temp"),
          `dictaste-nvidia-${Date.now()}.mp3`
        );
        fs.writeFileSync(mp3Path, bin.buffer);
        await playMp3File(mp3Path);
        try {
          fs.unlinkSync(mp3Path);
        } catch {
          /* ignore */
        }
        return true;
      }
    } catch {
      /* try next */
    }
  }
  // Magpie invoke fallback
  try {
    const bin = await requestBinary(
      "https://integrate.api.nvidia.com/v1/audio/nvidia/magpie-tts-multilingual",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ text, voice, quality: "high" }),
      }
    );
    let audioBuf = null;
    if (bin.ok && bin.buffer?.length > 64) {
      try {
        const json = JSON.parse(bin.buffer.toString("utf8"));
        if (json?.audio || json?.audio_base64) {
          audioBuf = Buffer.from(json.audio || json.audio_base64, "base64");
        }
      } catch {
        audioBuf = bin.buffer;
      }
    }
    if (audioBuf?.length > 64) {
      const mp3Path = path.join(
        app.getPath("temp"),
        `dictaste-magpie-${Date.now()}.mp3`
      );
      fs.writeFileSync(mp3Path, audioBuf);
      await playMp3File(mp3Path);
      try {
        fs.unlinkSync(mp3Path);
      } catch {
        /* ignore */
      }
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
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

function clearHistory({ includePins = false } = {}) {
  const pinned = normalizePinned(cfg?.pinnedHistory);
  const recents = normalizeHistory(cfg?.history);
  if (!includePins) {
    if (!recents.length) {
      notify(
        pinned.length
          ? `Recents empty · ${pinned.length} pin${pinned.length === 1 ? "" : "s"} kept`
          : "History already empty",
        { force: true }
      );
      return { ok: true, cleared: 0, pinsKept: pinned.length };
    }
    lastTranscript = pinned[0] || "";
    persistHistoryStores(pinned, []);
    notify(
      `Cleared ${recents.length} recent${recents.length === 1 ? "" : "s"}` +
        (pinned.length
          ? ` · ${pinned.length} pin${pinned.length === 1 ? "" : "s"} kept`
          : ""),
      { force: true }
    );
    return { ok: true, cleared: recents.length, pinsKept: pinned.length };
  }
  const n = recents.length + pinned.length;
  lastTranscript = "";
  // keep lastReadText so Re-read last still works after clearing dictation history
  persistHistoryStores([], []);
  notify(n ? `History cleared (${n})` : "History already empty", { force: true });
  return { ok: true, cleared: n, pinsKept: 0 };
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

function appendJoinerText() {
  const j = String(cfg?.appendJoiner || "space").toLowerCase();
  if (j === "newline" || j === "\n" || j === "line") return "\n";
  if (j === "paragraph" || j === "para" || j === "\n\n") return "\n\n";
  return " ";
}

function setAppendJoiner(mode) {
  const raw = String(mode || "space").toLowerCase();
  const next =
    raw === "newline" || raw === "line"
      ? "newline"
      : raw === "paragraph" || raw === "para"
        ? "paragraph"
        : "space";
  cfg = { ...cfg, appendJoiner: next, appendDictation: true };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
  setTrayLabel();
  const label =
    next === "newline" ? "newline" : next === "paragraph" ? "paragraph" : "space";
  notify(`Append joiner: ${label}`, { force: true });
  return { ok: true, appendJoiner: next };
}


async function polishText(text) {
  if (!cfg.polish || !text.trim()) return text;
  const minW = minWordsForPolishClamped();
  if (minW > 0) {
    const wc = countWords(text);
    if (wc > 0 && wc < minW) {
      // Short utterances: skip network polish (saves quota / latency)
      return text;
    }
  }

  // 1) Managed polish when licensed
  if (cfg.licenseKey) {
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
        const upgrade = json?.upgradeUrl || `${base}/pricing`;
        try {
          shell.openExternal(upgrade);
        } catch {
          /* ignore */
        }
        broadcastStatus({ phase: "idle", error: msg, code: json?.code || "quota" });
        // fall through to BYO NVIDIA / OpenAI if keys present
      } else if (status === 403 && json?.code === "byo_only") {
        // Developer plan — use BYO keys below
      } else if (status === 401) {
        notify(
          "License invalid — paste a valid key in Settings or re-unlock on the site.",
          { force: true }
        );
        broadcastStatus({ phase: "idle", error: "Invalid license", code: "auth" });
      }
    } catch {
      /* try BYO */
    }
  }

  // 2) BYO NVIDIA NIM chat (OpenAI-compatible)
  if ((cfg.nvidiaKey || "").trim()) {
    const polished = await polishTextByoNVIDIA(text);
    if (polished) return polished;
  }

  // 3) BYO OpenAI chat
  if ((cfg.openAIKey || "").trim()) {
    const polished = await polishTextByoOpenAI(text);
    if (polished) return polished;
  }

  return text;
}

async function polishTextByoNVIDIA(text) {
  const key = (cfg.nvidiaKey || "").trim();
  if (!key) return null;
  const models = [
    cfg.nvidiaPolishModel || "nvidia/nemotron-mini-4b-instruct",
    "meta/llama-3.1-8b-instruct",
    "meta/llama-3.1-70b-instruct",
  ];
  const system = `You are a dictation editor. Fix grammar and structure. Remove filler. Output ONLY the cleaned text.`;
  for (const model of models) {
    try {
      const { status, json } = await requestJson(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: {
            model,
            temperature: 0.3,
            max_tokens: Math.min(4096, Math.max(256, Math.ceil(text.length / 2) + 200)),
            messages: [
              { role: "system", content: system },
              { role: "user", content: `Raw transcript:\n${text}` },
            ],
          },
        }
      );
      const content = json?.choices?.[0]?.message?.content?.trim();
      if (status === 200 && content) return content;
    } catch {
      /* next model */
    }
  }
  return null;
}

async function polishTextByoOpenAI(text) {
  const key = (cfg.openAIKey || "").trim();
  if (!key) return null;
  try {
    const { status, json } = await requestJson(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: {
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                "You are a dictation editor. Fix grammar and structure. Remove filler. Output ONLY the cleaned text.",
            },
            { role: "user", content: `Raw transcript:\n${text}` },
          ],
        },
      }
    );
    const content = json?.choices?.[0]?.message?.content?.trim();
    if (status === 200 && content) return content;
  } catch {
    /* ignore */
  }
  return null;
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

const PINNED_HISTORY_MAX = 10;

function normalizeHistory(list) {
  if (!Array.isArray(list)) return [];
  const max = historyMaxClamped();
  return list
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizePinned(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, PINNED_HISTORY_MAX);
}

/**
 * Display order: pins first, then recent (newest first). Pins never appear twice.
 * @returns {{ text: string, pinned: boolean }[]}
 */
function flatHistory() {
  const pinned = normalizePinned(cfg?.pinnedHistory);
  const pinnedSet = new Set(pinned);
  const recents = normalizeHistory(cfg?.history).filter((t) => !pinnedSet.has(t));
  return [
    ...pinned.map((text) => ({ text, pinned: true })),
    ...recents.map((text) => ({ text, pinned: false })),
  ];
}

function flatTexts() {
  return flatHistory().map((x) => x.text);
}

function persistHistoryStores(pinned, history) {
  cfg = {
    ...cfg,
    pinnedHistory: normalizePinned(pinned),
    history: normalizeHistory(history),
  };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
}

function pushHistory(text) {
  const t = String(text || "").trim();
  if (!t) return;
  lastTranscript = t;
  bumpUsageStats(t, { persist: false });
  const pinned = normalizePinned(cfg?.pinnedHistory);
  // Keep pin if already pinned; still set as last transcript
  if (pinned.includes(t)) {
    try {
      saveConfig(cfg);
    } catch {
      /* ignore */
    }
    rebuildTrayMenu();
    return;
  }
  const max = historyMaxClamped();
  const prev = normalizeHistory(cfg?.history);
  const next = [t, ...prev.filter((x) => x !== t)].slice(0, max);
  // persistHistoryStores also saves usageStats via cfg
  persistHistoryStores(pinned, next);
}

/**
 * Remove the newest unpinned dictation and restore lastTranscript to the prior one.
 * Does not reverse paste into the focused app (use Ctrl+Z there). Pins untouched.
 */
function undoLastDictation() {
  const hist = normalizeHistory(cfg?.history);
  if (!hist.length && !String(lastTranscript || "").trim()) {
    notify("Nothing to undo", { force: true });
    return { ok: false, error: "empty" };
  }
  const removed = hist[0] || lastTranscript || "";
  const next = hist.slice(1);
  lastTranscript = next[0] || normalizePinned(cfg?.pinnedHistory)[0] || "";
  persistHistoryStores(cfg?.pinnedHistory, next);
  const preview = String(removed).trim();
  notify(
    preview
      ? `Undid last dictation · ${preview.length > 48 ? preview.slice(0, 45) + "…" : preview}`
      : "Undid last dictation",
    { force: true }
  );
  return {
    ok: true,
    removed: preview,
    remaining: flatTexts().length,
    lastTranscript,
  };
}

/**
 * Remove a single history entry by flat index (pins first, then recents).
 */
function deleteHistoryAt(index = 0) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const items = flatHistory();
  if (!items.length || i >= items.length) {
    notify("No history item to delete", { force: true });
    return { ok: false, error: "empty" };
  }
  const removed = items[i].text;
  const wasPinned = items[i].pinned;
  let pinned = normalizePinned(cfg?.pinnedHistory);
  let hist = normalizeHistory(cfg?.history);
  if (wasPinned) {
    pinned = pinned.filter((x) => x !== removed);
  } else {
    hist = hist.filter((x) => x !== removed);
  }
  if (String(lastTranscript || "").trim() === String(removed || "").trim()) {
    lastTranscript = hist[0] || pinned[0] || "";
  }
  persistHistoryStores(pinned, hist);
  const preview = String(removed || "").trim();
  notify(
    preview
      ? `Deleted · ${preview.length > 48 ? preview.slice(0, 45) + "…" : preview}`
      : "Deleted history item",
    { force: true }
  );
  return { ok: true, removed: preview, remaining: flatTexts().length };
}

function copyAllHistory() {
  const items = flatHistory();
  if (!items.length) {
    notify("No history to copy", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = items
    .map((x, i) => `${i + 1}.${x.pinned ? " ★" : ""} ${x.text}`)
    .join("\n\n");
  clipboard.writeText(text);
  notify(`Copied ${items.length} transcript${items.length === 1 ? "" : "s"}`, {
    force: true,
  });
  return { ok: true, count: items.length };
}

/**
 * Replace a history entry in place (flat index). Empty text deletes the item.
 */
function updateHistoryAt(index = 0, text = "") {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const items = flatHistory();
  if (!items.length || i >= items.length) {
    notify("No history item to edit", { force: true });
    return { ok: false, error: "empty" };
  }
  const nextText = String(text || "").trim();
  if (!nextText) {
    return deleteHistoryAt(i);
  }
  const prev = items[i];
  let pinned = normalizePinned(cfg?.pinnedHistory);
  let hist = normalizeHistory(cfg?.history);
  if (prev.pinned) {
    pinned = pinned.map((x) => (x === prev.text ? nextText : x));
    // de-dupe if nextText already pinned elsewhere
    const seen = new Set();
    pinned = pinned.filter((x) => {
      if (seen.has(x)) return false;
      seen.add(x);
      return true;
    });
    hist = hist.filter((x) => x !== nextText);
  } else {
    hist = hist.map((x) => (x === prev.text ? nextText : x));
    const seen = new Set();
    hist = hist.filter((x) => {
      if (seen.has(x)) return false;
      seen.add(x);
      return true;
    });
  }
  if (
    String(lastTranscript || "").trim() === String(prev.text || "").trim() ||
    i === items.findIndex((x) => !x.pinned)
  ) {
    lastTranscript = nextText;
  }
  persistHistoryStores(pinned, hist);
  const preview =
    nextText.length > 48 ? nextText.slice(0, 45) + "…" : nextText;
  notify(`Updated history #${i + 1} · ${preview}`, { force: true });
  return { ok: true, index: i, text: nextText, remaining: flatTexts().length };
}

/**
 * Toggle pin on a flat-index history item. Pins float to top and survive clear-recents.
 */
function pinHistoryAt(index = 0) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const items = flatHistory();
  if (!items.length || i >= items.length) {
    notify("No history item to pin", { force: true });
    return { ok: false, error: "empty" };
  }
  const item = items[i];
  let pinned = normalizePinned(cfg?.pinnedHistory);
  let hist = normalizeHistory(cfg?.history);
  if (item.pinned) {
    pinned = pinned.filter((x) => x !== item.text);
    hist = [item.text, ...hist.filter((x) => x !== item.text)].slice(
      0,
      historyMaxClamped()
    );
    persistHistoryStores(pinned, hist);
    notify("Unpinned from top", { force: true });
    return { ok: true, pinned: false, text: item.text, remaining: flatTexts().length };
  }
  if (pinned.length >= PINNED_HISTORY_MAX && !pinned.includes(item.text)) {
    notify(`Pin limit ${PINNED_HISTORY_MAX} — unpin one first`, { force: true });
    return { ok: false, error: "limit" };
  }
  pinned = [item.text, ...pinned.filter((x) => x !== item.text)].slice(
    0,
    PINNED_HISTORY_MAX
  );
  hist = hist.filter((x) => x !== item.text);
  persistHistoryStores(pinned, hist);
  const preview =
    item.text.length > 48 ? item.text.slice(0, 45) + "…" : item.text;
  notify(`Pinned · ${preview}`, { force: true });
  return { ok: true, pinned: true, text: item.text, remaining: flatTexts().length };
}

/**
 * Move a history item within its section (pins among pins, recents among recents).
 * delta: -1 = toward top of list, +1 = toward bottom.
 */
function moveHistoryAt(index = 0, delta = -1) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const d = Number(delta) < 0 ? -1 : 1;
  const items = flatHistory();
  if (!items.length || i >= items.length) {
    notify("No history item to move", { force: true });
    return { ok: false, error: "empty" };
  }
  const item = items[i];
  let pinned = normalizePinned(cfg?.pinnedHistory);
  let hist = normalizeHistory(cfg?.history);
  if (item.pinned) {
    const pi = pinned.indexOf(item.text);
    if (pi < 0) return { ok: false, error: "missing" };
    const nj = pi + d;
    if (nj < 0 || nj >= pinned.length) {
      notify(d < 0 ? "Already at top of pins" : "Already at bottom of pins", {
        force: true,
      });
      return { ok: false, error: "edge", index: i };
    }
    const next = pinned.slice();
    const [row] = next.splice(pi, 1);
    next.splice(nj, 0, row);
    pinned = next;
  } else {
    const hi = hist.indexOf(item.text);
    if (hi < 0) return { ok: false, error: "missing" };
    const nj = hi + d;
    if (nj < 0 || nj >= hist.length) {
      notify(d < 0 ? "Already at top of recents" : "Already at bottom of recents", {
        force: true,
      });
      return { ok: false, error: "edge", index: i };
    }
    const next = hist.slice();
    const [row] = next.splice(hi, 1);
    next.splice(nj, 0, row);
    hist = next;
  }
  persistHistoryStores(pinned, hist);
  const after = flatHistory();
  const newIndex = after.findIndex((x) => x.text === item.text);
  notify(d < 0 ? "Moved up" : "Moved down", { force: true });
  return {
    ok: true,
    index: newIndex >= 0 ? newIndex : i,
    text: item.text,
    remaining: after.length,
  };
}

/**
 * Boost item to top of its section (first pin, or newest recent).
 */
function boostHistoryAt(index = 0) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const items = flatHistory();
  if (!items.length || i >= items.length) {
    notify("No history item to boost", { force: true });
    return { ok: false, error: "empty" };
  }
  const item = items[i];
  let pinned = normalizePinned(cfg?.pinnedHistory);
  let hist = normalizeHistory(cfg?.history);
  if (item.pinned) {
    if (pinned[0] === item.text) {
      notify("Already top pin", { force: true });
      return { ok: true, index: 0, text: item.text, remaining: items.length };
    }
    pinned = [item.text, ...pinned.filter((x) => x !== item.text)];
  } else {
    if (hist[0] === item.text) {
      notify("Already top of recents", { force: true });
      return {
        ok: true,
        index: pinned.length,
        text: item.text,
        remaining: items.length,
      };
    }
    hist = [item.text, ...hist.filter((x) => x !== item.text)].slice(
      0,
      historyMaxClamped()
    );
    lastTranscript = item.text;
  }
  persistHistoryStores(pinned, hist);
  const after = flatHistory();
  const newIndex = after.findIndex((x) => x.text === item.text);
  const preview =
    item.text.length > 48 ? item.text.slice(0, 45) + "…" : item.text;
  notify(`Moved to top · ${preview}`, { force: true });
  return {
    ok: true,
    index: newIndex >= 0 ? newIndex : 0,
    text: item.text,
    remaining: after.length,
  };
}

/**
 * Merge flat-index item with the next older row in the same section (pin or recents).
 * Chronological join: older + joiner + newer (uses append joiner setting).
 */
function mergeHistoryWithNext(index = 0) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const items = flatHistory();
  if (items.length < 2 || i >= items.length - 1) {
    notify("Need two items in the same section to merge", { force: true });
    return { ok: false, error: "need_pair" };
  }
  const a = items[i];
  const b = items[i + 1];
  if (a.pinned !== b.pinned) {
    notify("Can't merge pin with recent — same section only", { force: true });
    return { ok: false, error: "cross_section" };
  }
  const joiner = appendJoinerText();
  // UI lists newest first within recents; pins in pin order.
  // Merge as "next (older/below) + joiner + current" for recents chronological feel.
  // For pins, keep listed order: current + joiner + next.
  const merged = a.pinned
    ? `${a.text}${joiner}${b.text}`.replace(/\s+/g, (m) => m).trim()
    : `${b.text}${joiner}${a.text}`.replace(/\s+/g, (m) => m).trim();
  // Clean double spaces from joiner edges lightly
  const text = merged.replace(/[ \t]{2,}/g, " ").trim();
  if (!text) {
    return { ok: false, error: "empty" };
  }
  let pinned = normalizePinned(cfg?.pinnedHistory);
  let hist = normalizeHistory(cfg?.history);
  if (a.pinned) {
    const pi = pinned.indexOf(a.text);
    const pj = pinned.indexOf(b.text);
    if (pi < 0 || pj < 0) return { ok: false, error: "missing" };
    const lo = Math.min(pi, pj);
    const hi = Math.max(pi, pj);
    pinned = pinned.filter((_, idx) => idx !== hi);
    pinned[lo] = text;
  } else {
    const hi = hist.indexOf(a.text);
    const hj = hist.indexOf(b.text);
    if (hi < 0 || hj < 0) return { ok: false, error: "missing" };
    // remove both, insert merged at newer position (min index = newer)
    const keepIdx = Math.min(hi, hj);
    hist = hist.filter((t) => t !== a.text && t !== b.text);
    hist = [text, ...hist.filter((t) => t !== text)].slice(0, historyMaxClamped());
    // ensure merged is at front of recents (newest)
    void keepIdx;
    lastTranscript = text;
  }
  persistHistoryStores(pinned, hist);
  const after = flatHistory();
  const newIndex = after.findIndex((x) => x.text === text);
  const preview = text.length > 48 ? text.slice(0, 45) + "…" : text;
  notify(`Merged · ${preview}`, { force: true });
  return {
    ok: true,
    index: newIndex >= 0 ? newIndex : 0,
    text,
    remaining: after.length,
  };
}

/**
 * Merge the two newest unpinned dictations (tray/settings convenience).
 */
function mergeLastTwoHistory() {
  const hist = normalizeHistory(cfg?.history);
  if (hist.length < 2) {
    notify("Need two recent transcripts to merge", { force: true });
    return { ok: false, error: "need_pair" };
  }
  const pinned = normalizePinned(cfg?.pinnedHistory);
  // flat index of first recent
  const start = pinned.length;
  return mergeHistoryWithNext(start);
}

/**
 * Duplicate a history item (insert copy at top of its section).
 */
function duplicateHistoryAt(index = 0) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const items = flatHistory();
  if (!items.length || i >= items.length) {
    notify("No history item to duplicate", { force: true });
    return { ok: false, error: "empty" };
  }
  const item = items[i];
  const t = item.text;
  let pinned = normalizePinned(cfg?.pinnedHistory);
  let hist = normalizeHistory(cfg?.history);
  if (item.pinned) {
    if (pinned.length >= PINNED_HISTORY_MAX) {
      notify(`Pin limit ${PINNED_HISTORY_MAX} — unpin one first`, { force: true });
      return { ok: false, error: "limit" };
    }
    // insert copy after original in pin list
    const pi = pinned.indexOf(t);
    if (pi < 0) return { ok: false, error: "missing" };
    const next = pinned.slice();
    next.splice(pi + 1, 0, t);
    pinned = next.slice(0, PINNED_HISTORY_MAX);
  } else {
    // newest-first: put copy at front
    hist = [t, ...hist].slice(0, historyMaxClamped());
    lastTranscript = t;
  }
  persistHistoryStores(pinned, hist);
  const after = flatHistory();
  const newIndex = after.findIndex((x) => x.text === t);
  notify("Duplicated history item", { force: true });
  return {
    ok: true,
    index: newIndex >= 0 ? newIndex : i,
    text: t,
    remaining: after.length,
  };
}

/**
 * Speak a history entry aloud (same TTS path as highlight-to-speak).
 */
async function speakHistoryAt(index = 0) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const items = flatHistory();
  const t = String(
    items[i]?.text || (i === 0 ? lastTranscript : "") || ""
  ).trim();
  if (!t) {
    notify("No history item to read", { force: true });
    return { ok: false, error: "empty" };
  }
  return speakReadText(t);
}

const SNIPPETS_MAX = 20;

function normalizeSnippets(list) {
  if (typeof list === "string") {
    list = list.split(/\r?\n/);
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const t = String(raw || "").trim();
    if (!t || t.startsWith("#")) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= SNIPPETS_MAX) break;
  }
  return out;
}

function getSnippets() {
  return normalizeSnippets(cfg?.snippets);
}

function setSnippets(list) {
  const next = normalizeSnippets(list);
  cfg = { ...cfg, snippets: next };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
  return { ok: true, count: next.length, snippets: next };
}

/**
 * Paste (or clipboard-deliver) a snippet by index into the focused app.
 */
function pasteSnippetAt(index = 0) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const snips = getSnippets();
  const t = String(snips[i] || "").trim();
  if (!t) {
    notify("No snippet at that slot", { force: true });
    return { ok: false, error: "empty" };
  }
  // Snippets are deliberate inserts — do not push into dictation history
  const del = deliverText(t);
  if (del.mode === "paste") {
    notifyDeliver(t, "paste");
  } else {
    notify(
      t.length > 80 ? `Snippet on clipboard · ${t.slice(0, 77)}…` : `Snippet on clipboard · ${t}`,
      { force: true }
    );
  }
  return { ok: true, deliver: del.mode, text: t, words: del.words, index: i };
}

/**
 * Save current last transcript (or flat history item) as a new snippet.
 */
function saveSnippetFromHistory(index = 0, opts = {}) {
  const latest = !!(opts && opts.latest);
  const t = historyTextAt(index, { latest });
  if (!t) {
    notify("Nothing to save as snippet — dictate first", { force: true });
    return { ok: false, error: "empty" };
  }
  const prev = getSnippets();
  if (prev.includes(t)) {
    notify("Already a snippet", { force: true });
    return { ok: true, count: prev.length, snippets: prev, duplicate: true };
  }
  if (prev.length >= SNIPPETS_MAX) {
    notify(`Snippet limit ${SNIPPETS_MAX} — remove one in Settings`, {
      force: true,
    });
    return { ok: false, error: "limit" };
  }
  const next = [t, ...prev].slice(0, SNIPPETS_MAX);
  const r = setSnippets(next);
  const preview = t.length > 48 ? t.slice(0, 45) + "…" : t;
  notify(`Snippet saved · ${preview}`, { force: true });
  return { ...r, text: t };
}

async function refreshPlanCache({ rebuild = true, force = false } = {}) {
  if (planRefreshInFlight) return cachedPlanLabel;
  const now = Date.now();
  if (!force && cachedPlanLabel && now - lastPlanRefreshAt < 60_000) {
    return cachedPlanLabel;
  }
  planRefreshInFlight = true;
  try {
    const st = await fetchLicenseStatus();
    if (st?.ok) {
      const plan = st.planName || st.plan || "free";
      if (st.unlimited) {
        cachedPlanLabel = `${plan} · unlimited`;
      } else if (st.wordsLimit != null) {
        cachedPlanLabel = `${plan} · polish ${st.wordsUsed ?? 0}/${st.wordsLimit}`;
      } else {
        cachedPlanLabel = String(plan);
      }
    } else if (!cfg?.licenseKey) {
      cachedPlanLabel = "no license";
    } else {
      cachedPlanLabel = st?.error || "license error";
    }
  } catch (e) {
    cachedPlanLabel = String(e.message || e);
  } finally {
    planRefreshInFlight = false;
    lastPlanRefreshAt = Date.now();
  }
  if (rebuild) {
    try {
      rebuildTrayMenu();
    } catch {
      /* ignore */
    }
  }
  return cachedPlanLabel;
}

/** Prefer last dictation, then newest unpinned, then first pin. */
function latestTranscriptText() {
  const last = String(lastTranscript || "").trim();
  if (last) return last;
  const hist = normalizeHistory(cfg?.history);
  if (hist[0]) return hist[0];
  const pin = normalizePinned(cfg?.pinnedHistory);
  return pin[0] || "";
}

function historyTextAt(index = 0, { latest = false } = {}) {
  if (latest) return latestTranscriptText();
  const texts = flatTexts();
  return String(texts[index] || "").trim();
}

function copyLastTranscript(index = 0, opts = {}) {
  const t = historyTextAt(index, opts);
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
 * Pass { latest: true } for hotkey / “paste last” (ignores pin order).
 */
function pasteLastTranscript(index = 0, opts = {}) {
  const t = historyTextAt(index, opts);
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
 * Re-run polish pipeline on last (or indexed) transcript and paste result.
 * Useful when the first polish was weak or offline cleanup-only.
 */
async function repolishLast(index = 0, opts = {}) {
  const raw = historyTextAt(index, opts);
  if (!raw) {
    notify("No transcript yet — dictate first", { force: true });
    return { ok: false, error: "empty" };
  }
  if (listening) {
    await stopListening();
    await sleep(150);
  }
  if (reading) stopSpeaking();
  broadcastStatus({ phase: "polishing" });
  notify(
    `Re-polishing · ${raw.length > 48 ? raw.slice(0, 45) + "…" : raw}`,
    { force: true }
  );
  try {
    // Force network polish when user explicitly re-polishes (ignore min-words skip)
    const prevPolish = cfg.polish;
    const prevMin = cfg.minWordsForPolish;
    cfg = { ...cfg, polish: true, minWordsForPolish: 0 };
    let out = "";
    try {
      out = await finalizeTranscript(raw);
    } finally {
      cfg = { ...cfg, polish: prevPolish, minWordsForPolish: prevMin };
    }
    out = String(out || raw).trim();
    if (!out) {
      notify("Re-polish returned empty", { force: true });
      broadcastStatus({ phase: "idle", error: "empty" });
      return { ok: false, error: "empty" };
    }
    lastTranscript = out;
    pushHistory(out);
    const del = deliverText(out);
    if (del.mode === "paste") notifyDeliver(out, "paste");
    else notify(out.length > 80 ? out.slice(0, 77) + "…" : out, { force: true });
    broadcastStatus({ phase: "idle", last: out, repolished: true });
    rebuildTrayMenu();
    return { ok: true, text: out, deliver: del.mode, words: del.words };
  } catch (e) {
    notify(`Re-polish failed: ${e.message || e}`, { force: true });
    broadcastStatus({ phase: "idle", error: String(e.message || e) });
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Copy non-secret support diagnostics to clipboard (version, OS, hotkeys, flags).
 */
function copySupportDiagnostics() {
  const os = require("os");
  const base = (cfg?.apiBase || DEFAULT_API).replace(/\/$/, "");
  const lines = [
    `Dictaste Windows ${appVersion()}`,
    `Platform: ${process.platform} ${os.release()} ${process.arch}`,
    `Electron: ${process.versions.electron || "?"} · Node ${process.versions.node || "?"}`,
    `API: ${base}`,
    `License: ${cfg?.licenseKey ? "set (" + String(cfg.licenseKey).slice(0, 8) + "…)" : "missing"}`,
    `STT: ${cfg?.sttMode || "webspeech"} · ${cfg?.sttLang || "en-US"}`,
    `TTS: ${cfg?.ttsEngine || "auto"} · rate ${cfg?.ttsRate ?? 0} · voice ${cfg?.ttsSapiVoice || "default"} / ${cfg?.ttsVoice || "alloy"}`,
    `NVIDIA: ${cfg?.nvidiaKey ? "key set" : "no key"} · polish ${cfg?.nvidiaPolishModel || "default"} · voice ${cfg?.nvidiaVoice || "default"}`,
    `OpenAI BYO: ${cfg?.openAIKey ? "key set" : "no key"}`,
    `Polish: ${cfg?.polish !== false ? "on" : "off"} · minWordsPolish ${minWordsForPolishClamped()} · minWordsRead ${minWordsForReadClamped()}`,
    `Hotkeys: dictate ${toDisplayHotkey(hotkeyDictateAccel())} · read ${toDisplayHotkey(hotkeyReadAccel())} · polish ${toDisplayHotkey(hotkeyPolishAccel())} · cancel ${toDisplayHotkey(hotkeyCancelAccel())} · paste-last ${toDisplayHotkey(hotkeyPasteLastAccel())}`,
    `Hotkeys paused: ${hotkeysPaused ? "yes" : "no"}`,
    `Auto-paste: ${cfg?.autoPaste !== false ? "on" : "off"} · clear-clipboard: ${cfg?.clearClipboardAfter ? "on" : "off"} · continuous: ${cfg?.continuousDictation ? "on" : "off"} · append: ${cfg?.appendDictation ? "on" : "off"} · quiet: ${cfg?.quietNotifications ? "on" : "off"} · compact HUD: ${cfg?.hudCompact ? "on" : "off"}`,
    `History: ${flatTexts().length} (${normalizePinned(cfg?.pinnedHistory).length}★ / ${historyMaxClamped()} recents)`,
    `Local stats: ${usageStatsLabel()} (${getUsageStats().day})`,
    `Launch at login: ${cfg?.launchAtLogin ? "on" : "off"}`,
    `Site: https://dictaste.vercel.app · Issues: https://github.com/johnmatveyev-lab/dictaste/issues`,
  ];
  const text = lines.join("\n");
  clipboard.writeText(text);
  notify("Support diagnostics copied (no full secrets)", { force: true });
  return { ok: true, text };
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

/** After paste/copy, optionally wipe clipboard for privacy. */
let clearClipboardTimer = null;

function scheduleClearClipboard(delayMs = 2500) {
  if (clearClipboardTimer) {
    try {
      clearTimeout(clearClipboardTimer);
    } catch {
      /* ignore */
    }
    clearClipboardTimer = null;
  }
  const d = Math.max(300, Math.min(30000, Math.round(Number(delayMs) || 2500)));
  clearClipboardTimer = setTimeout(() => {
    clearClipboardTimer = null;
    try {
      clipboard.writeText("");
    } catch {
      /* ignore */
    }
  }, d);
}

function pasteText(text) {
  if (!text) return;
  const payload = applyPasteSuffix(text);
  const prev = clipboard.readText();
  clipboard.writeText(payload);
  const delay = pasteDelayMsClamped();
  const privacy = !!cfg?.clearClipboardAfter;
  // Windows: SendKeys Ctrl+V into focused window
  exec(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds ${delay}; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
    () => {
      // Default: restore prior clipboard. Privacy: clear instead of restoring secrets.
      setTimeout(() => {
        try {
          clipboard.writeText(privacy ? "" : prev);
        } catch {
          /* ignore */
        }
      }, 500 + delay);
    }
  );
}

function countWords(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  // Unicode-aware-ish: split on whitespace / punctuation runs
  return t.split(/[\s\u00A0]+/).filter(Boolean).length;
}

function todayIsoDay() {
  return new Date().toISOString().slice(0, 10);
}

/** Local-only daily usage; rolls over at UTC day boundary. */
function getUsageStats() {
  const day = todayIsoDay();
  const raw = cfg?.usageStats && typeof cfg.usageStats === "object" ? cfg.usageStats : {};
  if (String(raw.day || "") !== day) {
    return { day, words: 0, dictations: 0 };
  }
  return {
    day,
    words: Math.max(0, Math.floor(Number(raw.words) || 0)),
    dictations: Math.max(0, Math.floor(Number(raw.dictations) || 0)),
  };
}

function bumpUsageStats(text, { persist = true } = {}) {
  const words = countWords(text);
  if (words <= 0) return getUsageStats();
  const cur = getUsageStats();
  const next = {
    day: cur.day,
    words: cur.words + words,
    dictations: cur.dictations + 1,
  };
  cfg = { ...cfg, usageStats: next };
  if (persist) {
    try {
      saveConfig(cfg);
    } catch {
      /* ignore */
    }
  }
  return next;
}

function resetUsageStats() {
  const next = { day: todayIsoDay(), words: 0, dictations: 0 };
  cfg = { ...cfg, usageStats: next };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
  notify("Today's local stats reset", { force: true });
  return { ok: true, ...next };
}

function usageStatsLabel() {
  const s = getUsageStats();
  const w = s.words;
  const d = s.dictations;
  return `Today · ${w} word${w === 1 ? "" : "s"} · ${d} dictation${d === 1 ? "" : "s"}`;
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
  // Clipboard-only: optional timed wipe so transcripts don't linger for Ctrl+V forever.
  if (cfg?.clearClipboardAfter) {
    const delay = Math.max(2000, pasteDelayMsClamped() + 2000);
    scheduleClearClipboard(delay);
  }
  return { mode: "clipboard", words };
}

/**
 * Format current moment for paste-date/time helper.
 * @param {"datetime"|"date"|"time"|"iso"|"filename"} kind
 */
function formatNow(kind = "datetime") {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  switch (String(kind || "datetime")) {
    case "date":
      return `${yyyy}-${mm}-${dd}`;
    case "time":
      return `${hh}:${mi}`;
    case "iso":
      return d.toISOString();
    case "filename":
      return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
    case "local":
      try {
        return d.toLocaleString();
      } catch {
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
      }
    case "datetime":
    default:
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }
}

/**
 * Paste (or clipboard-deliver) a timestamp. Does not push dictation history.
 */
function pasteDateTime(kind = "datetime") {
  const text = formatNow(kind);
  if (!text) {
    notify("Could not format date/time", { force: true });
    return { ok: false, error: "empty" };
  }
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode };
}

/**
 * Generate an ID for paste-uuid helper (no history pollution).
 * @param {"uuid"|"uuid-upper"|"compact"|"short"} kind
 */
function generateId(kind = "uuid") {
  let u;
  try {
    u = require("crypto").randomUUID();
  } catch {
    // Extremely old Node fallback
    const b = require("crypto").randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString("hex");
    u = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  switch (String(kind || "uuid")) {
    case "uuid-upper":
      return u.toUpperCase();
    case "compact":
      return u.replace(/-/g, "");
    case "short":
      return u.replace(/-/g, "").slice(0, 8);
    case "uuid":
    default:
      return u;
  }
}

/**
 * Paste (or clipboard-deliver) a fresh UUID/ID. Does not push dictation history.
 */
function pasteId(kind = "uuid") {
  const text = generateId(kind);
  if (!text) {
    notify("Could not generate ID", { force: true });
    return { ok: false, error: "empty" };
  }
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode };
}

/** Latest dictation text for reformat-last helper. */
function getLatestTranscript() {
  const pinned = normalizePinned(cfg?.pinnedHistory);
  const hist = normalizeHistory(cfg?.history);
  return String(lastTranscript || hist[0] || pinned[0] || "").trim();
}

/**
 * Reformat transcript text.
 * @param {"single"|"bullets"|"numbered"|"paragraphs"|"trim"} kind
 */
function reformatText(raw, kind = "single") {
  const t = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  const splitItems = (s) => {
    // Prefer existing lines; else sentence-ish splits
    const lines = s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    if (lines.length > 1) return lines;
    return s
      .split(/(?<=[.!?…])\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
  };
  const stripBullet = (p) =>
    p.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
  switch (String(kind || "single")) {
    case "bullets": {
      return splitItems(t)
        .map((p) => `- ${stripBullet(p)}`)
        .join("\n");
    }
    case "numbered": {
      return splitItems(t)
        .map((p, i) => `${i + 1}. ${stripBullet(p)}`)
        .join("\n");
    }
    case "paragraphs": {
      return t
        .replace(/\s+/g, " ")
        .replace(/([.!?…])\s+/g, "$1\n\n")
        .trim();
    }
    case "trim": {
      return t
        .split("\n")
        .map((l) => l.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    case "single":
    default:
      return t.replace(/\s+/g, " ").trim();
  }
}

/**
 * Reformat last transcript and paste. Updates lastTranscript + history[0] when matched.
 * Does not push a new history entry.
 */
function reformatLast(kind = "single") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to reformat", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = reformatText(src, kind);
  if (!text) {
    notify("Reformat produced empty text", { force: true });
    return { ok: false, error: "empty" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Wrap transcript in quotes / brackets / markdown fences.
 * @param {"quotes"|"single-quotes"|"parens"|"brackets"|"braces"|"code"|"codeblock"|"blockquote"} kind
 */
function wrapText(raw, kind = "quotes") {
  const t = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  switch (String(kind || "quotes")) {
    case "single-quotes":
      return "'" + t.replace(/'/g, "\u2019") + "'";
    case "parens":
      return "(" + t + ")";
    case "brackets":
      return "[" + t + "]";
    case "braces":
      return "{" + t + "}";
    case "code":
      return "`" + t.replace(/`/g, "'") + "`";
    case "codeblock":
      return "```\n" + t + "\n```";
    case "blockquote":
      return t
        .split("\n")
        .map((line) => (line.length ? "> " + line : ">"))
        .join("\n");
    case "quotes":
    default:
      return '"' + t.replace(/"/g, "\u201d") + '"';
  }
}

/**
 * Wrap last transcript and paste. Updates lastTranscript + history[0] when matched.
 */
function wrapLast(kind = "quotes") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to wrap", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = wrapText(src, kind);
  if (!text) {
    notify("Wrap produced empty text", { force: true });
    return { ok: false, error: "empty" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Identifier / case transforms for last transcript (dev-friendly).
 * @param {"slug"|"snake"|"camel"|"pascal"|"constant"|"lower"|"upper"} kind
 */
function slugifyText(raw, kind = "slug") {
  const t = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  const words = t
    .replace(/['’]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  const lowerWords = words.map((w) => w.toLowerCase());
  switch (String(kind || "slug")) {
    case "snake":
      return lowerWords.join("_");
    case "camel": {
      return lowerWords
        .map((w, i) =>
          i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)
        )
        .join("");
    }
    case "pascal":
      return lowerWords
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
    case "constant":
      return lowerWords.join("_").toUpperCase();
    case "lower":
      return t.toLocaleLowerCase();
    case "upper":
      return t.toLocaleUpperCase();
    case "slug":
    default:
      return lowerWords.join("-");
  }
}

/**
 * Slugify / case-transform last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function slugifyLast(kind = "slug") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to slugify", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = slugifyText(src, kind);
  if (!text) {
    notify("Slugify produced empty text", { force: true });
    return { ok: false, error: "empty" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Line-order transforms for last transcript.
 * @param {"asc"|"desc"|"reverse"|"dedupe"|"dedupe-sort"|"shuffle"} kind
 */
function sortLinesText(raw, kind = "asc") {
  const t = String(raw || "").replace(/\r\n/g, "\n");
  if (!t.trim()) return "";
  // Preserve trailing newline intent lightly: work on content lines
  let lines = t.split("\n");
  // Drop a single trailing empty line from split (normal for text ending in \n)
  const hadTrailingNl = lines.length > 1 && lines[lines.length - 1] === "";
  if (hadTrailingNl) lines = lines.slice(0, -1);
  const nonEmpty = () => lines.filter((l) => String(l).trim() !== "");
  switch (String(kind || "asc")) {
    case "desc":
      lines = [...lines].sort((a, b) =>
        b.localeCompare(a, undefined, { sensitivity: "base", numeric: true })
      );
      break;
    case "reverse":
      lines = [...lines].reverse();
      break;
    case "dedupe": {
      const seen = new Set();
      const out = [];
      for (const l of lines) {
        const key = l.trim().toLowerCase();
        if (!key) {
          out.push(l);
          continue;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(l);
      }
      lines = out;
      break;
    }
    case "dedupe-sort": {
      const seen = new Set();
      const out = [];
      for (const l of nonEmpty()) {
        const key = l.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(l.trim());
      }
      out.sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
      );
      lines = out;
      break;
    }
    case "shuffle": {
      const arr = [...lines];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      lines = arr;
      break;
    }
    case "asc":
    default:
      lines = [...lines].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
      );
      break;
  }
  return lines.join("\n");
}

/**
 * Sort / dedupe / reverse lines of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function sortLinesLast(kind = "asc") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to sort", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = sortLinesText(src, kind);
  if (!text) {
    notify("Sort produced empty text", { force: true });
    return { ok: false, error: "empty" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Encode/decode transforms for last transcript (dev helpers).
 * @param {"b64"|"b64d"|"url"|"urld"|"html"|"htmld"} kind
 */
function encodeText(raw, kind = "b64") {
  const t = String(raw || "");
  if (!t) return "";
  switch (String(kind || "b64")) {
    case "b64":
      return Buffer.from(t, "utf8").toString("base64");
    case "b64d": {
      try {
        const cleaned = t.replace(/\s+/g, "");
        return Buffer.from(cleaned, "base64").toString("utf8");
      } catch {
        return "";
      }
    }
    case "url":
      try {
        return encodeURIComponent(t);
      } catch {
        return "";
      }
    case "urld":
      try {
        return decodeURIComponent(t.replace(/\+/g, "%20"));
      } catch {
        return "";
      }
    case "html":
      return t
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    case "htmld":
      return t
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, "&");
    default:
      return Buffer.from(t, "utf8").toString("base64");
  }
}

/**
 * Encode/decode last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function encodeLast(kind = "b64") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to encode", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = encodeText(src, kind);
  if (!text && kind !== "b64d" && kind !== "urld" && kind !== "htmld") {
    notify("Encode produced empty text", { force: true });
    return { ok: false, error: "empty" };
  }
  if (!text) {
    notify("Decode failed — check input", { force: true });
    return { ok: false, error: "decode" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Parse JSON leniently (trim; single-line comments stripped).
 */
function parseJsonLoose(raw) {
  let s = String(raw || "").trim();
  if (!s) throw new Error("empty");
  // Strip // line comments outside strings (best-effort for notes)
  s = s.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(s);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      out[k] = sortKeysDeep(value[k]);
    }
    return out;
  }
  return value;
}

/**
 * JSON helpers on last transcript.
 * @param {"pretty"|"minify"|"sort-keys"|"keys"|"validate"} kind
 * @returns {{ text: string, info?: string }}
 */
function jsonFormatText(raw, kind = "pretty") {
  const parsed = parseJsonLoose(raw);
  switch (String(kind || "pretty")) {
    case "minify":
      return { text: JSON.stringify(parsed) };
    case "sort-keys":
      return { text: JSON.stringify(sortKeysDeep(parsed), null, 2) };
    case "keys": {
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { text: Object.keys(parsed).join("\n") };
      }
      if (Array.isArray(parsed)) {
        return { text: parsed.map((_, i) => String(i)).join("\n") };
      }
      return { text: String(parsed) };
    }
    case "validate":
      return {
        text: JSON.stringify(parsed, null, 2),
        info: Array.isArray(parsed)
          ? `valid array · ${parsed.length} items`
          : parsed && typeof parsed === "object"
            ? `valid object · ${Object.keys(parsed).length} keys`
            : `valid ${typeof parsed}`,
      };
    case "pretty":
    default:
      return { text: JSON.stringify(parsed, null, 2) };
  }
}

/**
 * Format last transcript as JSON and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function jsonFormatLast(kind = "pretty") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to format as JSON", { force: true });
    return { ok: false, error: "empty" };
  }
  let result;
  try {
    result = jsonFormatText(src, kind);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).slice(0, 120);
    notify(`Invalid JSON: ${msg}`, { force: true });
    return { ok: false, error: "invalid", detail: msg };
  }
  const text = result.text;
  if (!text && text !== "") {
    notify("JSON format produced empty text", { force: true });
    return { ok: false, error: "empty" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  if (result.info) {
    notify(result.info, { force: true });
  }
  const del = deliverText(text);
  if (del.mode === "paste" && !result.info) {
    notifyDeliver(text, "paste");
  } else if (del.mode === "paste" && result.info) {
    // still show brief paste confirm without flooding
    notifyDeliver(text, "paste");
  }
  return {
    ok: true,
    text,
    kind,
    deliver: del.mode,
    source: src,
    info: result.info || null,
  };
}

/**
 * Cryptographic digests of last transcript (utf-8).
 * @param {"sha256"|"sha1"|"md5"|"sha256-upper"|"sha256-lines"|"sha256-labeled"} kind
 */
function hashText(raw, kind = "sha256") {
  const crypto = require("crypto");
  const t = String(raw || "");
  if (!t) return "";
  const digest = (algo, data, upper = false) => {
    const hex = crypto.createHash(algo).update(data, "utf8").digest("hex");
    return upper ? hex.toUpperCase() : hex;
  };
  switch (String(kind || "sha256")) {
    case "sha1":
      return digest("sha1", t);
    case "md5":
      return digest("md5", t);
    case "sha256-upper":
      return digest("sha256", t, true);
    case "sha256-lines": {
      return t
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          return digest("sha256", line);
        })
        .join("\n");
    }
    case "sha256-labeled":
      return "sha256:" + digest("sha256", t);
    case "sha256":
    default:
      return digest("sha256", t);
  }
}

/**
 * Hash last transcript and paste. Updates lastTranscript + history[0] when matched.
 */
function hashLast(kind = "sha256") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to hash", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = hashText(src, kind);
  if (!text) {
    notify("Hash produced empty text", { force: true });
    return { ok: false, error: "empty" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Number / un-number lines of last transcript.
 * @param {"dot"|"paren"|"pad"|"plain"|"zero"|"strip"} kind
 */
function numberLinesText(raw, kind = "dot") {
  const t = String(raw || "").replace(/\r\n/g, "\n");
  if (!t.trim()) return "";
  let lines = t.split("\n");
  const hadTrailing = lines.length > 1 && lines[lines.length - 1] === "";
  if (hadTrailing) lines = lines.slice(0, -1);
  const stripNum = (line) =>
    line.replace(/^\s*(?:\d+[.)]\s+|\[\d+\]\s+|\d+\s+)/, "");
  if (String(kind || "dot") === "strip") {
    return lines.map(stripNum).join("\n");
  }
  // Only number non-empty lines; preserve blank separators
  let n = String(kind) === "zero" ? 0 : 1;
  const total = lines.filter((l) => l.trim()).length;
  const width = String(Math.max(total + (String(kind) === "zero" ? -1 : 0), 1)).length;
  const out = lines.map((line) => {
    if (!line.trim()) return line;
    const body = stripNum(line);
    let prefix;
    switch (String(kind || "dot")) {
      case "paren":
        prefix = n + ") ";
        break;
      case "pad":
        prefix = String(n).padStart(width, "0") + ". ";
        break;
      case "plain":
        prefix = n + "\t";
        break;
      case "zero":
        prefix = n + ". ";
        break;
      case "dot":
      default:
        prefix = n + ". ";
        break;
    }
    n += 1;
    return prefix + body;
  });
  return out.join("\n");
}

/**
 * Number lines of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function numberLinesLast(kind = "dot") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to number", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = numberLinesText(src, kind);
  if (!text) {
    notify("Number lines produced empty text", { force: true });
    return { ok: false, error: "empty" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Extract structured tokens from last transcript (one per line, unique order-preserved).
 * @param {"urls"|"emails"|"phones"|"hashtags"|"mentions"|"numbers"|"all"} kind
 */
function extractText(raw, kind = "urls") {
  const t = String(raw || "");
  if (!t.trim()) return "";
  const uniq = (arr) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = String(x).trim();
      if (!k) continue;
      const key = k.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(k);
    }
    return out;
  };
  const urls =
    t.match(
      /\bhttps?:\/\/[^\s<>"'`)\]]+/gi
    ) ||
    t.match(/\bwww\.[^\s<>"'`)\]]+/gi) ||
    [];
  const emails = t.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  ) || [];
  // Phones: loose international / US-style
  const phones = t.match(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}\b/g
  ) || [];
  const hashtags = t.match(/#[\p{L}\p{N}_]+/gu) || [];
  const mentions = t.match(/@[\p{L}\p{N}_.]+/gu) || [];
  // Numbers: integers/decimals (skip pure years-ish short? keep all 2+ digit)
  const numbers = t.match(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g) || [];
  let items;
  switch (String(kind || "urls")) {
    case "emails":
      items = emails;
      break;
    case "phones":
      items = phones;
      break;
    case "hashtags":
      items = hashtags;
      break;
    case "mentions":
      items = mentions;
      break;
    case "numbers":
      items = numbers;
      break;
    case "all": {
      const blocks = [];
      const u = uniq(urls.map((x) => x.replace(/[.,;:!?]+$/, "")));
      const e = uniq(emails);
      const p = uniq(phones);
      if (u.length) blocks.push("URLs:\n" + u.join("\n"));
      if (e.length) blocks.push("Emails:\n" + e.join("\n"));
      if (p.length) blocks.push("Phones:\n" + p.join("\n"));
      const h = uniq(hashtags);
      const m = uniq(mentions);
      if (h.length) blocks.push("Hashtags:\n" + h.join("\n"));
      if (m.length) blocks.push("Mentions:\n" + m.join("\n"));
      return blocks.join("\n\n");
    }
    case "urls":
    default:
      items = urls.map((x) => x.replace(/[.,;:!?]+$/, ""));
      break;
  }
  return uniq(items).join("\n");
}

/**
 * Extract tokens from last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function extractLast(kind = "urls") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to extract from", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = extractText(src, kind);
  if (!text) {
    notify("Nothing found to extract", { force: true });
    return { ok: false, error: "none" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Count words / chars / lines / sentences / reading time for last transcript.
 * @param {"full"|"words"|"chars"|"lines"|"sentences"|"compact"|"reading"} kind
 */
function statsText(raw, kind = "full") {
  const t = String(raw || "");
  const chars = t.length;
  const charsNoSpace = t.replace(/\s/g, "").length;
  const lines = t.length ? t.split(/\r\n|\r|\n/).length : 0;
  const nonEmptyLines = t
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim().length > 0).length;
  const wordsMatch = t.match(/[^\s]+/g);
  const words = wordsMatch ? wordsMatch.length : 0;
  const sentenceParts = t
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sentences = sentenceParts.length || (t.trim() ? 1 : 0);
  const readingMin = words > 0 ? Math.max(0.1, words / 200) : 0;
  const readingLabel =
    readingMin < 1
      ? `~${Math.max(1, Math.round(readingMin * 60))}s read`
      : `~${readingMin < 10 ? readingMin.toFixed(1) : Math.round(readingMin)} min read`;

  switch (String(kind || "full")) {
    case "words":
      return String(words);
    case "chars":
      return String(chars);
    case "lines":
      return String(lines);
    case "sentences":
      return String(sentences);
    case "reading":
      return readingLabel;
    case "compact":
      return `${words} words · ${chars} chars · ${lines} lines · ${readingLabel}`;
    case "full":
    default:
      return [
        `Words: ${words}`,
        `Characters: ${chars} (${charsNoSpace} no spaces)`,
        `Lines: ${lines} (${nonEmptyLines} non-empty)`,
        `Sentences: ${sentences}`,
        `Reading time: ${readingLabel}`,
      ].join("\n");
  }
}

/**
 * Stats for last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function statsLast(kind = "full") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to count", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = statsText(src, kind);
  if (!text) {
    notify("Nothing to count", { force: true });
    return { ok: false, error: "none" };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Filter / clean lines of last transcript.
 * @param {"drop-empty"|"drop-blank"|"trim"|"collapse"|"drop-short"|"keep-text"|"drop-comments"} kind
 */
function filterLinesText(raw, kind = "drop-blank") {
  const t = String(raw || "");
  if (!t.length) return "";
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";
  let lines = t.split(/\r\n|\r|\n/);
  switch (String(kind || "drop-blank")) {
    case "drop-empty":
      lines = lines.filter((l) => l.length > 0);
      break;
    case "trim":
      lines = lines.map((l) => l.trimEnd());
      // also trim leading common indent? keep left content — only trailing
      break;
    case "collapse": {
      const out = [];
      let blankRun = false;
      for (const l of lines) {
        const blank = !l.trim();
        if (blank) {
          if (!blankRun) out.push("");
          blankRun = true;
        } else {
          out.push(l);
          blankRun = false;
        }
      }
      // trim leading/trailing blank lines
      while (out.length && !out[0].trim()) out.shift();
      while (out.length && !out[out.length - 1].trim()) out.pop();
      lines = out;
      break;
    }
    case "drop-short":
      lines = lines.filter((l) => l.trim().length >= 3);
      break;
    case "keep-text":
      lines = lines.filter((l) => /[\p{L}\p{N}]/u.test(l));
      break;
    case "drop-comments":
      lines = lines.filter((l) => {
        const s = l.trim();
        if (!s) return true;
        if (s.startsWith("#") || s.startsWith("//") || s.startsWith(";"))
          return false;
        return true;
      });
      break;
    case "drop-blank":
    default:
      lines = lines.filter((l) => l.trim().length > 0);
      break;
  }
  return lines.join(eol);
}

/**
 * Filter lines of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function filterLinesLast(kind = "drop-blank") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to filter", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = filterLinesText(src, kind);
  if (!String(text || "").trim() && String(kind || "") !== "drop-empty") {
    // allow empty result for aggressive filters, but notify
    if (!text) {
      notify("Filter removed all lines", { force: true });
      return { ok: false, error: "none" };
    }
  }
  if (text === src) {
    notify("Filter made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Split last transcript into lines by delimiter / unit.
 * @param {"sentences"|"words"|"comma"|"semicolon"|"pipe"|"slash"|"tab"|"space"|"and"|"paragraphs"} kind
 */
function splitText(raw, kind = "sentences") {
  const t = String(raw || "");
  if (!t.length) return "";
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";
  let parts;
  switch (String(kind || "sentences")) {
    case "words":
      parts = t.match(/[^\s]+/g) || [];
      break;
    case "comma":
      parts = t.split(/\s*,\s*/);
      break;
    case "semicolon":
      parts = t.split(/\s*;\s*/);
      break;
    case "pipe":
      parts = t.split(/\s*\|\s*/);
      break;
    case "slash":
      parts = t.split(/\s*\/\s*/);
      break;
    case "tab":
      parts = t.split(/\t+/);
      break;
    case "space":
      parts = t.split(/ +/);
      break;
    case "and":
      // reverse of Oxford "and" join: split on ", and " / " and " / commas
      parts = t
        .split(/\s*,\s*and\s+|\s+and\s+|\s*,\s*/i)
        .map((p) => p.trim())
        .filter(Boolean);
      break;
    case "paragraphs":
      parts = t
        .split(/\r\n\s*\r\n|\r\s*\r|\n\s*\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      break;
    case "sentences":
    default: {
      // keep trailing punctuation with each sentence
      const re = /[^.!?…\r\n]+(?:[.!?…]+|$)/g;
      const found = t.match(re) || [];
      parts = found
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (!parts.length && t.trim()) parts = [t.trim()];
      break;
    }
  }
  parts = (parts || [])
    .map((p) => String(p || "").trim())
    .filter((p) => p.length > 0);
  return parts.join(eol);
}

/**
 * Split last transcript into lines and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function splitLast(kind = "sentences") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to split", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = splitText(src, kind);
  if (!text) {
    notify("Nothing to split", { force: true });
    return { ok: false, error: "none" };
  }
  if (text === src) {
    notify("Split made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Prefix / suffix / indent each non-empty line of last transcript.
 * @param {"bullet"|"star"|"blockquote"|"checkbox"|"arrow"|"dash"|"indent2"|"indent4"|"tab"|"outdent"|"period"|"comma"|"semicolon"|"strip-bullet"|"strip-indent"} kind
 */
function prefixSuffixLinesText(raw, kind = "bullet") {
  const t = String(raw || "");
  if (!t.length) return "";
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";
  const lines = t.split(/\r\n|\r|\n/);
  const k = String(kind || "bullet");
  const mapLine = (l) => {
    const blank = !String(l || "").trim();
    if (blank) return l;
    switch (k) {
      case "star":
        return l.replace(/^(\s*)/, "$1* ");
      case "blockquote":
        return l.replace(/^(\s*)/, "$1> ");
      case "checkbox":
        return l.replace(/^(\s*)/, "$1[ ] ");
      case "arrow":
        return l.replace(/^(\s*)/, "$1→ ");
      case "dash":
        return l.replace(/^(\s*)/, "$1— ");
      case "indent2":
        return `  ${l}`;
      case "indent4":
        return `    ${l}`;
      case "tab":
        return `\t${l}`;
      case "outdent":
        return l.replace(/^( {1,4}|\t)/, "");
      case "period":
        return /[.!?…]$/.test(l.trimEnd()) ? l : `${l.trimEnd()}.`;
      case "comma":
        return /[,;:]$/.test(l.trimEnd()) ? l : `${l.trimEnd()},`;
      case "semicolon":
        return /[;]$/.test(l.trimEnd()) ? l : `${l.trimEnd()};`;
      case "strip-bullet":
        return l.replace(
          /^(\s*)(?:[-*•—→]|\[[ xX]\]|>)\s+/,
          "$1"
        );
      case "strip-indent":
        return l.replace(/^(?: {1,4}|\t)+/, "");
      case "bullet":
      default:
        return l.replace(/^(\s*)/, "$1- ");
    }
  };
  return lines.map(mapLine).join(eol);
}

/**
 * Prefix/suffix/indent lines of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function prefixSuffixLinesLast(kind = "bullet") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to prefix/suffix", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = prefixSuffixLinesText(src, kind);
  if (!text) {
    notify("Nothing to change", { force: true });
    return { ok: false, error: "none" };
  }
  if (text === src) {
    notify("Prefix/suffix made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Pad / align lines of last transcript.
 * @param {"left2"|"left4"|"right2"|"right4"|"align-left"|"align-right"|"align-center"|"zero2"|"zero3"|"zero4"|"width40"|"width80"} kind
 */
function padLinesText(raw, kind = "align-left") {
  const t = String(raw || "");
  if (!t.length) return "";
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";
  const lines = t.split(/\r\n|\r|\n/);
  const k = String(kind || "align-left");

  const visible = lines.filter((l) => String(l || "").trim().length > 0);
  const maxLen = visible.reduce((m, l) => Math.max(m, l.length), 0);

  const padZeroNum = (l, width) => {
    const m = String(l).match(/^(\s*)([+-]?\d+)(.*)$/);
    if (!m) return l;
    const [, lead, num, rest] = m;
    const sign = num.startsWith("-") || num.startsWith("+") ? num[0] : "";
    const digits = sign ? num.slice(1) : num;
    if (digits.length >= width) return l;
    return `${lead}${sign}${digits.padStart(width, "0")}${rest}`;
  };

  return lines
    .map((l) => {
      const blank = !String(l || "").trim();
      if (blank) return l;
      switch (k) {
        case "left2":
          return `  ${l}`;
        case "left4":
          return `    ${l}`;
        case "right2":
          return `${l}  `;
        case "right4":
          return `${l}    `;
        case "align-right":
          return maxLen > 0 ? l.padStart(maxLen, " ") : l;
        case "align-center": {
          if (maxLen <= l.length) return l;
          const total = maxLen - l.length;
          const left = Math.floor(total / 2);
          return `${" ".repeat(left)}${l}${" ".repeat(total - left)}`;
        }
        case "zero2":
          return padZeroNum(l, 2);
        case "zero3":
          return padZeroNum(l, 3);
        case "zero4":
          return padZeroNum(l, 4);
        case "width40":
          return l.length >= 40 ? l : l.padEnd(40, " ");
        case "width80":
          return l.length >= 80 ? l : l.padEnd(80, " ");
        case "align-left":
        default:
          return maxLen > 0 ? l.padEnd(maxLen, " ") : l;
      }
    })
    .join(eol);
}

/**
 * Pad/align lines of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function padLinesLast(kind = "align-left") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to pad", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = padLinesText(src, kind);
  if (!text) {
    notify("Nothing to pad", { force: true });
    return { ok: false, error: "none" };
  }
  if (text === src) {
    notify("Pad made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Truncate last transcript by lines / words / chars.
 * @param {"first-line"|"last-line"|"first-3"|"first-5"|"first-10"|"last-3"|"last-5"|"drop-first"|"drop-last"|"words-50"|"words-100"|"chars-100"|"chars-280"|"chars-500"} kind
 */
function truncateText(raw, kind = "first-line") {
  const t = String(raw || "");
  if (!t.length) return "";
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";
  const lines = t.split(/\r\n|\r|\n/);
  const k = String(kind || "first-line");

  const takeWords = (n) => {
    const words = t.match(/[^\s]+/g) || [];
    if (!words.length) return "";
    if (words.length <= n) return t.trimEnd();
    // rebuild from original spacing roughly: first n word tokens joined by space
    return words.slice(0, n).join(" ");
  };

  const takeChars = (n) => {
    if (t.length <= n) return t;
    // avoid cutting mid-surrogate; slice is fine for BMP-heavy dictation
    let out = t.slice(0, n);
    // if we cut mid-word, trim back to last space when possible
    if (n < t.length && /\S/.test(t[n] || "") && /\S/.test(out[out.length - 1] || "")) {
      const sp = out.lastIndexOf(" ");
      if (sp > Math.floor(n * 0.5)) out = out.slice(0, sp);
    }
    return out.trimEnd();
  };

  switch (k) {
    case "last-line": {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (String(lines[i] || "").trim()) return lines[i];
      }
      return lines[lines.length - 1] || "";
    }
    case "first-3":
      return lines.slice(0, 3).join(eol);
    case "first-5":
      return lines.slice(0, 5).join(eol);
    case "first-10":
      return lines.slice(0, 10).join(eol);
    case "last-3":
      return lines.slice(-3).join(eol);
    case "last-5":
      return lines.slice(-5).join(eol);
    case "drop-first":
      return lines.length <= 1 ? "" : lines.slice(1).join(eol);
    case "drop-last":
      return lines.length <= 1 ? "" : lines.slice(0, -1).join(eol);
    case "words-50":
      return takeWords(50);
    case "words-100":
      return takeWords(100);
    case "chars-100":
      return takeChars(100);
    case "chars-280":
      return takeChars(280);
    case "chars-500":
      return takeChars(500);
    case "first-line":
    default:
      return lines[0] || "";
  }
}

/**
 * Truncate last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function truncateLast(kind = "first-line") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to truncate", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = truncateText(src, kind);
  if (text === "" && String(kind || "").startsWith("drop")) {
    // allow empty after drop when only one line
  } else if (!String(text || "").length) {
    notify("Nothing left after truncate", { force: true });
    return { ok: false, error: "none" };
  }
  if (text === src) {
    notify("Truncate made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Split a single delimited row. CSV supports basic double-quoted fields.
 * @param {string} line
 * @param {","|"\t"|"|"|";"} delim
 */
function splitDelimitedRow(line, delim) {
  const s = String(line || "");
  if (delim !== ",") {
    return s.split(delim);
  }
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Extract / convert columns of last transcript (CSV / TSV / pipe / semicolon).
 * @param {"csv1"|"csv2"|"csv3"|"csv-last"|"csv-rest"|"tsv1"|"tsv2"|"tsv-last"|"pipe1"|"pipe-last"|"semi1"|"semi-last"|"csv-to-tsv"|"tsv-to-csv"|"pipe-to-tsv"} kind
 */
function columnsText(raw, kind = "csv1") {
  const t = String(raw || "");
  if (!t.length) return "";
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";
  const lines = t.split(/\r\n|\r|\n/);
  const k = String(kind || "csv1");

  const mapCols = (delim, pick) =>
    lines
      .map((line) => {
        if (!String(line || "").trim()) return "";
        const cols = splitDelimitedRow(line, delim).map((c) => c.trim());
        if (!cols.length) return "";
        if (pick === "last") return cols[cols.length - 1] || "";
        if (pick === "rest") return cols.slice(1).join(delim === "\t" ? "\t" : delim === "|" ? " | " : delim === ";" ? "; " : ", ");
        const idx = Number(pick);
        return cols[idx] != null ? cols[idx] : "";
      })
      .join(eol)
      .replace(/(\r\n|\r|\n)+$/g, "");

  const convert = (from, to) =>
    lines
      .map((line) => {
        if (!String(line || "").trim()) return "";
        const cols = splitDelimitedRow(line, from).map((c) => c.trim());
        if (to === ",") {
          return cols
            .map((c) =>
              /[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c
            )
            .join(",");
        }
        return cols.join(to);
      })
      .join(eol);

  switch (k) {
    case "csv2":
      return mapCols(",", 1);
    case "csv3":
      return mapCols(",", 2);
    case "csv-last":
      return mapCols(",", "last");
    case "csv-rest":
      return mapCols(",", "rest");
    case "tsv1":
      return mapCols("\t", 0);
    case "tsv2":
      return mapCols("\t", 1);
    case "tsv-last":
      return mapCols("\t", "last");
    case "pipe1":
      return mapCols("|", 0);
    case "pipe-last":
      return mapCols("|", "last");
    case "semi1":
      return mapCols(";", 0);
    case "semi-last":
      return mapCols(";", "last");
    case "csv-to-tsv":
      return convert(",", "\t");
    case "tsv-to-csv":
      return convert("\t", ",");
    case "pipe-to-tsv":
      return convert("|", "\t");
    case "csv1":
    default:
      return mapCols(",", 0);
  }
}

/**
 * Extract/convert columns of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function columnsLast(kind = "csv1") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript for columns", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = columnsText(src, kind);
  if (!String(text || "").trim()) {
    notify("No columns extracted", { force: true });
    return { ok: false, error: "none" };
  }
  if (text === src) {
    notify("Columns made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Normalize whitespace of last transcript.
 * @param {"collapse-spaces"|"collapse-all"|"trim-lines"|"trim-all"|"trim-end"|"tabs-to-spaces2"|"tabs-to-spaces4"|"spaces-to-tabs"|"lf"|"crlf"|"strip-blank-edges"|"single-newline"} kind
 */
function whitespaceText(raw, kind = "collapse-spaces") {
  const t = String(raw || "");
  if (!t.length) return "";
  const k = String(kind || "collapse-spaces");
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";

  switch (k) {
    case "collapse-all":
      // all runs of whitespace → single space; trim ends
      return t.replace(/\s+/g, " ").trim();
    case "trim-lines":
      return t
        .split(/\r\n|\r|\n/)
        .map((l) => l.trim())
        .join(eol);
    case "trim-all":
      return t
        .split(/\r\n|\r|\n/)
        .map((l) => l.trim())
        .join(eol)
        .replace(/^(\r\n|\r|\n)+|(\r\n|\r|\n)+$/g, "");
    case "trim-end":
      return t
        .split(/\r\n|\r|\n/)
        .map((l) => l.replace(/[ \t]+$/g, ""))
        .join(eol);
    case "tabs-to-spaces2":
      return t.replace(/\t/g, "  ");
    case "tabs-to-spaces4":
      return t.replace(/\t/g, "    ");
    case "spaces-to-tabs":
      // leading runs of 2 or 4 spaces → tabs (prefer 4 then 2)
      return t
        .split(/\r\n|\r|\n/)
        .map((l) => {
          const m = l.match(/^( +)(.*)$/);
          if (!m) return l;
          let spaces = m[1].length;
          let tabs = "";
          while (spaces >= 4) {
            tabs += "\t";
            spaces -= 4;
          }
          while (spaces >= 2) {
            tabs += "\t";
            spaces -= 2;
          }
          return tabs + " ".repeat(spaces) + m[2];
        })
        .join(eol);
    case "lf":
      return t.replace(/\r\n|\r/g, "\n");
    case "crlf":
      return t.replace(/\r\n|\r|\n/g, "\r\n");
    case "strip-blank-edges": {
      const lines = t.split(/\r\n|\r|\n/);
      while (lines.length && !lines[0].trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      return lines.join(eol);
    }
    case "single-newline":
      // collapse 3+ blank lines to one blank line; keep single blanks
      return t
        .replace(/(?:\r\n|\r|\n){3,}/g, eol + eol)
        .replace(/^(\r\n|\r|\n)+|(\r\n|\r|\n)+$/g, "");
    case "collapse-spaces":
    default:
      // collapse runs of spaces/tabs on each line; keep newlines
      return t
        .split(/\r\n|\r|\n/)
        .map((l) => l.replace(/[ \t]+/g, " ").replace(/^ | $/g, ""))
        .join(eol);
  }
}

/**
 * Normalize whitespace of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function whitespaceLast(kind = "collapse-spaces") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to normalize", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = whitespaceText(src, kind);
  if (text === src) {
    notify("Whitespace made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Rotate / reorder lines of last transcript.
 * @param {"first-to-end"|"last-to-start"|"up"|"down"|"swap-halves"|"interleave"|"odds-first"|"evens-first"|"move-blank-end"|"move-blank-start"} kind
 */
function rotateLinesText(raw, kind = "first-to-end") {
  const t = String(raw || "");
  if (!t.length) return "";
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";
  const lines = t.split(/\r\n|\r|\n/);
  if (lines.length <= 1) return t;
  const k = String(kind || "first-to-end");
  let out = lines.slice();

  switch (k) {
    case "last-to-start": {
      const last = out.pop();
      out.unshift(last);
      break;
    }
    case "up": {
      // rotate toward start: each line moves up, first becomes last
      out.push(out.shift());
      break;
    }
    case "down": {
      // rotate toward end: each line moves down, last becomes first
      out.unshift(out.pop());
      break;
    }
    case "swap-halves": {
      const mid = Math.floor(out.length / 2);
      out = out.slice(mid).concat(out.slice(0, mid));
      break;
    }
    case "interleave": {
      // first half interleave with second half (A1 B1 A2 B2 …)
      const mid = Math.ceil(out.length / 2);
      const a = out.slice(0, mid);
      const b = out.slice(mid);
      const merged = [];
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (i < a.length) merged.push(a[i]);
        if (i < b.length) merged.push(b[i]);
      }
      out = merged;
      break;
    }
    case "odds-first": {
      // 1-based odds then evens (keep blanks in place by index)
      const odds = [];
      const evens = [];
      out.forEach((l, i) => ((i % 2 === 0 ? odds : evens).push(l)));
      out = odds.concat(evens);
      break;
    }
    case "evens-first": {
      const odds = [];
      const evens = [];
      out.forEach((l, i) => ((i % 2 === 0 ? odds : evens).push(l)));
      out = evens.concat(odds);
      break;
    }
    case "move-blank-end": {
      const non = out.filter((l) => String(l || "").trim().length > 0);
      const blank = out.filter((l) => !String(l || "").trim().length);
      out = non.concat(blank);
      break;
    }
    case "move-blank-start": {
      const non = out.filter((l) => String(l || "").trim().length > 0);
      const blank = out.filter((l) => !String(l || "").trim().length);
      out = blank.concat(non);
      break;
    }
    case "first-to-end":
    default: {
      const first = out.shift();
      out.push(first);
      break;
    }
  }
  return out.join(eol);
}

/**
 * Rotate/reorder lines of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function rotateLinesLast(kind = "first-to-end") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to rotate", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = rotateLinesText(src, kind);
  if (text === src) {
    notify("Rotate made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Soft-wrap text to a column width (break on spaces; hard-break overlong tokens).
 * @param {string} text
 * @param {number} width
 * @param {string} eol
 */
function softWrapParagraph(text, width, eol) {
  const w = Math.max(8, Number(width) || 80);
  const s = String(text || "").replace(/[ \t]+/g, " ").trim();
  if (!s) return "";
  const words = s.split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    if (!word) continue;
    if (!cur) {
      if (word.length <= w) {
        cur = word;
      } else {
        // hard-break long token
        for (let i = 0; i < word.length; i += w) {
          lines.push(word.slice(i, i + w));
        }
        cur = "";
      }
      continue;
    }
    if (cur.length + 1 + word.length <= w) {
      cur = `${cur} ${word}`;
    } else {
      lines.push(cur);
      if (word.length <= w) {
        cur = word;
      } else {
        for (let i = 0; i < word.length; i += w) {
          const chunk = word.slice(i, i + w);
          if (i + w < word.length) lines.push(chunk);
          else cur = chunk;
        }
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.join(eol);
}

/**
 * Soft wrap last transcript to fixed column widths.
 * @param {"w40"|"w60"|"w72"|"w80"|"w100"|"w120"|"unwrap"|"indent-w80"} kind
 */
function softWrapText(raw, kind = "w80") {
  const t = String(raw || "");
  if (!t.length) return "";
  const eol = t.includes("\r\n") ? "\r\n" : t.includes("\r") ? "\r" : "\n";
  const k = String(kind || "w80");

  if (k === "unwrap") {
    // join soft-wrapped paragraphs: blank line = paragraph break
    const paras = t.split(/\r\n\s*\r\n|\r\s*\r|\n\s*\n/);
    return paras
      .map((p) =>
        p
          .split(/\r\n|\r|\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .join(" ")
      )
      .filter(Boolean)
      .join(eol + eol);
  }

  let width = 80;
  let indent = "";
  switch (k) {
    case "w40":
      width = 40;
      break;
    case "w60":
      width = 60;
      break;
    case "w72":
      width = 72;
      break;
    case "w100":
      width = 100;
      break;
    case "w120":
      width = 120;
      break;
    case "indent-w80":
      width = 80;
      indent = "  ";
      break;
    case "w80":
    default:
      width = 80;
      break;
  }

  // preserve hard paragraph breaks (blank lines); wrap each non-empty paragraph
  const blocks = t.split(/(\r\n\s*\r\n|\r\s*\r|\n\s*\n)/);
  const out = [];
  for (const block of blocks) {
    if (/^(\r\n|\r|\n)+$/.test(block) || /^\s*$/.test(block) && block.includes("\n")) {
      // paragraph separator — normalize to single blank line later
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (!String(block || "").trim()) continue;
    // if block already has newlines, treat each non-empty line as its own unit
    // unless it looks like one long paragraph of soft-wrapped lines (no blank)
    const lines = block.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
    const asPara = lines.map((l) => l.trim()).join(" ");
    let wrapped = softWrapParagraph(asPara, width - indent.length, eol);
    if (indent && wrapped) {
      wrapped = wrapped
        .split(eol)
        .map((l) => (l ? indent + l : l))
        .join(eol);
    }
    out.push(wrapped);
  }
  // collapse consecutive blanks
  const flat = [];
  for (const part of out) {
    if (part === "") {
      if (flat.length && flat[flat.length - 1] !== "") flat.push("");
    } else {
      flat.push(part);
    }
  }
  return flat.join(eol);
}

/**
 * Soft wrap last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function softWrapLast(kind = "w80") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to wrap", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = softWrapText(src, kind);
  if (!String(text || "").length) {
    notify("Nothing to wrap", { force: true });
    return { ok: false, error: "none" };
  }
  if (text === src) {
    notify("Soft wrap made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
}

/**
 * Join non-empty lines of last transcript with a separator.
 * @param {"space"|"comma"|"comma-space"|"semicolon"|"pipe"|"slash"|"and"|"newline"|"concat"} kind
 */
function joinLinesText(raw, kind = "space") {
  const t = String(raw || "");
  if (!t.length) return "";
  const parts = t
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!parts.length) return "";
  let sep;
  switch (String(kind || "space")) {
    case "comma":
      sep = ",";
      break;
    case "comma-space":
      sep = ", ";
      break;
    case "semicolon":
      sep = "; ";
      break;
    case "pipe":
      sep = " | ";
      break;
    case "slash":
      sep = " / ";
      break;
    case "and": {
      if (parts.length === 1) return parts[0];
      if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
      return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
    }
    case "newline":
      sep = "\n";
      break;
    case "concat":
      sep = "";
      break;
    case "space":
    default:
      sep = " ";
      break;
  }
  return parts.join(sep);
}

/**
 * Join lines of last transcript and paste.
 * Updates lastTranscript + history[0] when matched.
 */
function joinLinesLast(kind = "space") {
  const src = getLatestTranscript();
  if (!src) {
    notify("No transcript to join", { force: true });
    return { ok: false, error: "empty" };
  }
  const text = joinLinesText(src, kind);
  if (!text) {
    notify("Nothing to join", { force: true });
    return { ok: false, error: "none" };
  }
  if (text === src) {
    notify("Join made no changes", { force: true });
    return { ok: true, text, kind, deliver: "none", source: src, unchanged: true };
  }
  lastTranscript = text;
  try {
    const hist = normalizeHistory(cfg?.history);
    if (hist.length && String(hist[0] || "").trim() === src) {
      hist[0] = text;
      cfg = { ...cfg, history: hist };
      saveConfig(cfg);
    } else {
      const pinned = normalizePinned(cfg?.pinnedHistory);
      if (pinned.length && String(pinned[0] || "").trim() === src) {
        pinned[0] = text;
        cfg = { ...cfg, pinnedHistory: pinned };
        saveConfig(cfg);
      }
    }
  } catch {
    /* ignore persist errors */
  }
  rebuildTrayMenu();
  const del = deliverText(text);
  if (del.mode === "paste") {
    notifyDeliver(text, "paste");
  }
  return { ok: true, text, kind, deliver: del.mode, source: src };
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
 * Ping NVIDIA NIM with a tiny polish request (does not paste / alter history).
 */
async function testNvidiaKey() {
  const key = (cfg?.nvidiaKey || "").trim();
  if (!key) {
    notify("Add an NVIDIA API key in Settings first", { force: true });
    return { ok: false, error: "no_key" };
  }
  notify("Testing NVIDIA NIM…", { force: true });
  const t0 = Date.now();
  try {
    const polished = await polishTextByoNVIDIA(
      "hello world this is a dictaste connection test"
    );
    const ms = Date.now() - t0;
    if (!polished) {
      notify("NVIDIA NIM failed — check key / model / network", { force: true });
      return { ok: false, error: "no_response", ms };
    }
    const preview =
      polished.length > 80 ? polished.slice(0, 77) + "…" : polished;
    notify(`NVIDIA OK · ${ms}ms · ${preview}`, { force: true });
    return {
      ok: true,
      ms,
      model: cfg?.nvidiaPolishModel || "nvidia/nemotron-mini-4b-instruct",
      sample: polished,
    };
  } catch (e) {
    notify(`NVIDIA test failed: ${e.message || e}`, { force: true });
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Ping OpenAI chat with a tiny polish request (does not paste / alter history).
 */
async function testOpenAIKey() {
  const key = (cfg?.openAIKey || "").trim();
  if (!key) {
    notify("Add an OpenAI API key in Settings first", { force: true });
    return { ok: false, error: "no_key" };
  }
  notify("Testing OpenAI…", { force: true });
  const t0 = Date.now();
  try {
    const polished = await polishTextByoOpenAI(
      "hello world this is a dictaste connection test"
    );
    const ms = Date.now() - t0;
    if (!polished) {
      notify("OpenAI failed — check key / network / billing", { force: true });
      return { ok: false, error: "no_response", ms };
    }
    const preview =
      polished.length > 80 ? polished.slice(0, 77) + "…" : polished;
    notify(`OpenAI OK · ${ms}ms · ${preview}`, { force: true });
    return { ok: true, ms, model: "gpt-4o-mini", sample: polished };
  } catch (e) {
    notify(`OpenAI test failed: ${e.message || e}`, { force: true });
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
    const cont = [
      cfg?.continuousDictation ? "continuous" : "",
      cfg?.appendDictation ? "append" : "",
    ]
      .filter(Boolean)
      .join("+");
    const contLabel = cont ? ` · ${cont}` : "";
    tray.setToolTip(`Dictaste — dictate ${d} · ${lang}${contLabel}`);
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

function savedHudOrigin() {
  const x = cfg?.hudPosX;
  const y = cfg?.hudPosY;
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
  return { x: Math.round(Number(x)), y: Math.round(Number(y)) };
}

function clampHudOrigin(x, y, width, height) {
  const { screen } = require("electron");
  const pt = { x: x + width / 2, y: y + 8 };
  const disp = screen.getDisplayNearestPoint(pt);
  const b = disp.workArea;
  const nx = Math.max(b.x + 4, Math.min(x, b.x + b.width - width - 4));
  const ny = Math.max(b.y + 4, Math.min(y, b.y + b.height - height - 4));
  return { x: Math.round(nx), y: Math.round(ny) };
}

function defaultHudOrigin(width, height) {
  const { screen } = require("electron");
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + 48),
  };
}

function applyHudPosition() {
  if (!hudWin || hudWin.isDestroyed()) return;
  const { width, height } = hudSize();
  const saved = savedHudOrigin();
  const origin = saved
    ? clampHudOrigin(saved.x, saved.y, width, height)
    : defaultHudOrigin(width, height);
  try {
    hudWin.setPosition(origin.x, origin.y);
  } catch {
    /* ignore */
  }
}

function persistHudPosition() {
  if (!hudWin || hudWin.isDestroyed()) return;
  try {
    const [x, y] = hudWin.getPosition();
    const { width, height } = hudWin.getBounds();
    const c = clampHudOrigin(x, y, width, height);
    cfg = { ...cfg, hudPosX: c.x, hudPosY: c.y };
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
}

function resetHudPosition() {
  cfg = { ...cfg, hudPosX: null, hudPosY: null };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  applyHudPosition();
  rebuildTrayMenu();
  notify("HUD position reset", { force: true });
  return { ok: true };
}

function setTtsRate(rate) {
  const n = Math.max(-10, Math.min(10, Math.round(Number(rate) || 0)));
  cfg = { ...cfg, ttsRate: n };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
  notify(`Speech rate ${n}`, { force: true });
  return { ok: true, ttsRate: n };
}

function setConfigFlag(key, on, label) {
  cfg = { ...cfg, [key]: !!on };
  try {
    saveConfig(cfg);
  } catch {
    /* ignore */
  }
  rebuildTrayMenu();
  setTrayLabel();
  notify(`${label}: ${on ? "on" : "off"}`, { force: true });
  return { ok: true, [key]: !!on };
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
    movable: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  hudWin.loadFile(path.join(__dirname, "hud.html"));
  // Persist after user drags the pill (electron emits moved when drag ends on some platforms; also poll via move)
  let moveSaveTimer = null;
  hudWin.on("moved", () => {
    if (moveSaveTimer) clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => persistHudPosition(), 200);
  });
  hudWin.on("closed", () => {
    hudWin = null;
  });
  applyHudPosition();
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
  applyHudPosition();
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
      continuousDictation: !!cfg.continuousDictation,
      appendDictation: !!cfg.appendDictation,
      appendJoiner: cfg.appendJoiner || "space",
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
  const items = flatHistory();
  if (!items.length) {
    notify("No transcripts to export yet", { force: true });
    return { ok: false, error: "empty" };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(app.getPath("documents"), `Dictaste-history-${stamp}.txt`);
  const body =
    `# Dictaste recent transcripts\n# ${new Date().toISOString()}\n\n` +
    items
      .map((x, i) => `${i + 1}.${x.pinned ? " ★" : ""} ${x.text}`)
      .join("\n\n") +
    "\n";
  try {
    fs.writeFileSync(dest, body, "utf8");
    shell.showItemInFolder(dest);
    notify(`Exported ${items.length} transcripts`, { force: true });
    return { ok: true, path: dest, count: items.length };
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
  // Kick a background plan refresh at most once per minute (non-blocking)
  if (cfg?.licenseKey && !planRefreshInFlight && Date.now() - lastPlanRefreshAt > 60_000) {
    const prev = cachedPlanLabel;
    refreshPlanCache({ rebuild: false, force: true }).then((label) => {
      if (label && label !== prev) {
        try {
          if (tray) rebuildTrayMenu();
        } catch {
          /* ignore */
        }
      }
    }).catch(() => {});
  }
  const stats = getUsageStats();
  const menu = Menu.buildFromTemplate([
    { label: `Dictaste ${appVersion()}`, enabled: false },
    {
      label: cachedPlanLabel
        ? `Plan · ${cachedPlanLabel}`
        : cfg?.licenseKey
          ? "Plan · checking…"
          : "Plan · no license",
      enabled: false,
    },
    {
      label: usageStatsLabel(),
      enabled: false,
    },
    {
      label: "Refresh plan / usage",
      click: () => {
        refreshPlanCache({ rebuild: true, force: true })
          .then((label) =>
            notify(label ? `Plan · ${label}` : "Plan refreshed", { force: true })
          )
          .catch(() => {});
      },
    },
    {
      label: "Reset today's local stats",
      enabled: stats.words > 0 || stats.dictations > 0,
      click: () => resetUsageStats(),
    },
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
      click: () => copyLastTranscript(0, { latest: true }),
    },
    {
      label: `Paste last transcript (${toDisplayHotkey(hotkeyPasteLastAccel())})`,
      enabled:
        !!String(lastTranscript || cfg?.history?.[0] || "").trim() &&
        !hotkeysPaused,
      click: () => pasteLastTranscript(0, { latest: true }),
    },
    {
      label: "Re-polish last",
      enabled:
        !!String(lastTranscript || cfg?.history?.[0] || "").trim() &&
        !hotkeysPaused,
      click: () => {
        repolishLast(0, { latest: true }).catch(() => {});
      },
    },
    {
      label: "Undo last dictation",
      enabled: !!String(lastTranscript || cfg?.history?.[0] || "").trim(),
      click: () => undoLastDictation(),
    },
    {
      label: "Copy support diagnostics",
      click: () => copySupportDiagnostics(),
    },
    {
      label: "Test voice",
      click: () => {
        testVoice().catch(() => {});
      },
    },
    {
      label: "Test NVIDIA key",
      enabled: !!(cfg?.nvidiaKey || "").trim(),
      click: () => {
        testNvidiaKey().catch(() => {});
      },
    },
    {
      label: "Test OpenAI key",
      enabled: !!(cfg?.openAIKey || "").trim(),
      click: () => {
        testOpenAIKey().catch(() => {});
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
      label: cfg?.continuousDictation
        ? "Continuous dictation ✓"
        : "Continuous dictation",
      type: "checkbox",
      checked: !!cfg?.continuousDictation,
      click: (item) =>
        setConfigFlag("continuousDictation", !!item.checked, "Continuous dictation"),
    },
    {
      label: cfg?.appendDictation ? "Append to last ✓" : "Append to last",
      type: "checkbox",
      checked: !!cfg?.appendDictation,
      click: (item) =>
        setConfigFlag("appendDictation", !!item.checked, "Append to last"),
    },
    {
      label: `Append joiner · ${cfg?.appendJoiner || "space"}`,
      enabled: !!cfg?.appendDictation,
      submenu: [
        {
          label: "Space",
          type: "radio",
          checked: (cfg?.appendJoiner || "space") === "space",
          click: () => setAppendJoiner("space"),
        },
        {
          label: "New line",
          type: "radio",
          checked: cfg?.appendJoiner === "newline",
          click: () => setAppendJoiner("newline"),
        },
        {
          label: "Paragraph (blank line)",
          type: "radio",
          checked: cfg?.appendJoiner === "paragraph",
          click: () => setAppendJoiner("paragraph"),
        },
      ],
    },
    {
      label: cfg?.autoPaste !== false ? "Auto-paste ✓" : "Auto-paste",
      type: "checkbox",
      checked: cfg?.autoPaste !== false,
      click: (item) => setConfigFlag("autoPaste", !!item.checked, "Auto-paste"),
    },
    {
      label: cfg?.clearClipboardAfter
        ? "Clear clipboard after paste ✓"
        : "Clear clipboard after paste",
      type: "checkbox",
      checked: !!cfg?.clearClipboardAfter,
      click: (item) =>
        setConfigFlag(
          "clearClipboardAfter",
          !!item.checked,
          "Clear clipboard after paste"
        ),
    },
    {
      label: cfg?.soundCues !== false ? "Sound cues ✓" : "Sound cues",
      type: "checkbox",
      checked: cfg?.soundCues !== false,
      click: (item) => setConfigFlag("soundCues", !!item.checked, "Sound cues"),
    },
    {
      label: cfg?.quietNotifications ? "Quiet notifications ✓" : "Quiet notifications",
      type: "checkbox",
      checked: !!cfg?.quietNotifications,
      click: (item) =>
        setConfigFlag("quietNotifications", !!item.checked, "Quiet notifications"),
    },
    {
      label: cfg?.hudCompact ? "HUD: compact ✓" : "HUD: compact",
      type: "checkbox",
      checked: !!cfg?.hudCompact,
      click: (item) => setHudCompact(!!item.checked),
    },
    {
      label: "Reset HUD position",
      click: () => resetHudPosition(),
    },
    {
      label: `Speech rate · ${Number.isFinite(Number(cfg?.ttsRate)) ? cfg.ttsRate : 0}`,
      submenu: [
        {
          label: "Slow (−5)",
          type: "radio",
          checked: Number(cfg?.ttsRate) === -5,
          click: () => setTtsRate(-5),
        },
        {
          label: "Normal (0)",
          type: "radio",
          checked: !Number(cfg?.ttsRate),
          click: () => setTtsRate(0),
        },
        {
          label: "Fast (+5)",
          type: "radio",
          checked: Number(cfg?.ttsRate) === 5,
          click: () => setTtsRate(5),
        },
        {
          label: "Faster (+8)",
          type: "radio",
          checked: Number(cfg?.ttsRate) === 8,
          click: () => setTtsRate(8),
        },
      ],
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
      label: `Recent transcripts (${flatTexts().length}/${historyMaxClamped()}${
        normalizePinned(cfg?.pinnedHistory).length
          ? ` · ${normalizePinned(cfg?.pinnedHistory).length}★`
          : ""
      })`,
      enabled: flatTexts().length > 0,
      submenu: (() => {
        const items = flatHistory();
        if (!items.length) {
          return [{ label: "(empty)", enabled: false }];
        }
        return [
          ...items.map((item, i) => {
            const t = item.text;
            const labelBase = (t.length > 40 ? t.slice(0, 37) + "…" : t).replace(
              /\s+/g,
              " "
            );
            return {
              label: (item.pinned ? "★ " : "") + labelBase,
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
                {
                  label: "Read aloud",
                  click: () => {
                    speakHistoryAt(i).catch(() => {});
                  },
                },
                {
                  label: item.pinned ? "Unpin" : "Pin to top",
                  click: () => pinHistoryAt(i),
                },
                {
                  label: "Move up",
                  click: () => moveHistoryAt(i, -1),
                },
                {
                  label: "Move down",
                  click: () => moveHistoryAt(i, 1),
                },
                {
                  label: "Move to top",
                  click: () => boostHistoryAt(i),
                },
                {
                  label: "Merge with next",
                  click: () => mergeHistoryWithNext(i),
                },
                {
                  label: "Duplicate",
                  click: () => duplicateHistoryAt(i),
                },
                {
                  label: "Save as snippet",
                  click: () => saveSnippetFromHistory(i),
                },
                {
                  label: "Edit in Settings…",
                  click: () => {
                    openSettings();
                    try {
                      if (settingsWin && !settingsWin.isDestroyed()) {
                        settingsWin.webContents.send("status", {
                          phase: "idle",
                          editHistoryIndex: i,
                          editHistoryText: t,
                        });
                      }
                    } catch {
                      /* ignore */
                    }
                  },
                },
                {
                  label: "Re-polish & paste",
                  enabled: !hotkeysPaused,
                  click: () => {
                    repolishLast(i).catch(() => {});
                  },
                },
                {
                  label: "Delete from history",
                  click: () => deleteHistoryAt(i),
                },
              ],
            };
          }),
          { type: "separator" },
          {
            label: "Paste latest",
            enabled: !hotkeysPaused,
            click: () => pasteLastTranscript(0, { latest: true }),
          },
          {
            label: "Copy all history",
            click: () => copyAllHistory(),
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
            label: "Undo last dictation",
            enabled: !!String(lastTranscript || cfg?.history?.[0] || "").trim(),
            click: () => undoLastDictation(),
          },
          {
            label: "Merge last two recents",
            enabled: normalizeHistory(cfg?.history).length >= 2,
            click: () => mergeLastTwoHistory(),
          },
          {
            label: "Clear recents (keep pins)",
            click: () => clearHistory({ includePins: false }),
          },
          {
            label: "Clear all history",
            click: () => clearHistory({ includePins: true }),
          },
        ];
      })(),
    },
    {
      label: `Snippets (${getSnippets().length}/${SNIPPETS_MAX})`,
      submenu: (() => {
        const snips = getSnippets();
        if (!snips.length) {
          return [
            {
              label: "(none — add in Settings or Save last as snippet)",
              enabled: false,
            },
            { type: "separator" },
            {
              label: "Save last transcript as snippet",
              enabled: !!String(lastTranscript || cfg?.history?.[0] || "").trim(),
              click: () => saveSnippetFromHistory(0, { latest: true }),
            },
            {
              label: "Edit snippets in Settings…",
              click: () => openSettings(),
            },
          ];
        }
        return [
          ...snips.map((t, i) => ({
            label: (t.length > 48 ? t.slice(0, 45) + "…" : t).replace(/\s+/g, " "),
            enabled: !hotkeysPaused,
            click: () => pasteSnippetAt(i),
          })),
          { type: "separator" },
          {
            label: "Save last transcript as snippet",
            enabled: !!String(lastTranscript || cfg?.history?.[0] || "").trim(),
            click: () => saveSnippetFromHistory(0, { latest: true }),
          },
          {
            label: "Edit snippets in Settings…",
            click: () => openSettings(),
          },
        ];
      })(),
    },
    {
      label: "Paste date / time",
      enabled: !hotkeysPaused,
      submenu: [
        {
          label: `Date + time · ${formatNow("datetime")}`,
          click: () => pasteDateTime("datetime"),
        },
        {
          label: `Local · ${formatNow("local")}`,
          click: () => pasteDateTime("local"),
        },
        {
          label: `Date · ${formatNow("date")}`,
          click: () => pasteDateTime("date"),
        },
        {
          label: `Time · ${formatNow("time")}`,
          click: () => pasteDateTime("time"),
        },
        {
          label: `ISO · ${formatNow("iso")}`,
          click: () => pasteDateTime("iso"),
        },
        {
          label: `Filename · ${formatNow("filename")}`,
          click: () => pasteDateTime("filename"),
        },
      ],
    },
    {
      label: "Paste UUID / ID",
      enabled: !hotkeysPaused,
      submenu: [
        {
          label: `UUID · ${generateId("uuid")}`,
          click: () => pasteId("uuid"),
        },
        {
          label: `UUID upper · ${generateId("uuid-upper")}`,
          click: () => pasteId("uuid-upper"),
        },
        {
          label: `Compact · ${generateId("compact")}`,
          click: () => pasteId("compact"),
        },
        {
          label: `Short · ${generateId("short")}`,
          click: () => pasteId("short"),
        },
      ],
    },
    {
      label: "Reformat last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        {
          label: "Single line",
          click: () => reformatLast("single"),
        },
        {
          label: "Bullets",
          click: () => reformatLast("bullets"),
        },
        {
          label: "Numbered list",
          click: () => reformatLast("numbered"),
        },
        {
          label: "Paragraphs",
          click: () => reformatLast("paragraphs"),
        },
        {
          label: "Trim lines",
          click: () => reformatLast("trim"),
        },
      ],
    },
    {
      label: "Wrap last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Quotes", click: () => wrapLast("quotes") },
        { label: "Single quotes", click: () => wrapLast("single-quotes") },
        { label: "Parens", click: () => wrapLast("parens") },
        { label: "Brackets", click: () => wrapLast("brackets") },
        { label: "Braces", click: () => wrapLast("braces") },
        { label: "Inline code", click: () => wrapLast("code") },
        { label: "Code block", click: () => wrapLast("codeblock") },
        { label: "Blockquote", click: () => wrapLast("blockquote") },
      ],
    },
    {
      label: "Slugify last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "slug-case", click: () => slugifyLast("slug") },
        { label: "snake_case", click: () => slugifyLast("snake") },
        { label: "camelCase", click: () => slugifyLast("camel") },
        { label: "PascalCase", click: () => slugifyLast("pascal") },
        { label: "CONSTANT_CASE", click: () => slugifyLast("constant") },
        { label: "lower case", click: () => slugifyLast("lower") },
        { label: "UPPER CASE", click: () => slugifyLast("upper") },
      ],
    },
    {
      label: "Sort lines last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "A → Z", click: () => sortLinesLast("asc") },
        { label: "Z → A", click: () => sortLinesLast("desc") },
        { label: "Reverse", click: () => sortLinesLast("reverse") },
        { label: "Dedupe", click: () => sortLinesLast("dedupe") },
        { label: "Dedupe + sort", click: () => sortLinesLast("dedupe-sort") },
        { label: "Shuffle", click: () => sortLinesLast("shuffle") },
      ],
    },
    {
      label: "Encode last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Base64 encode", click: () => encodeLast("b64") },
        { label: "Base64 decode", click: () => encodeLast("b64d") },
        { label: "URL encode", click: () => encodeLast("url") },
        { label: "URL decode", click: () => encodeLast("urld") },
        { label: "HTML escape", click: () => encodeLast("html") },
        { label: "HTML unescape", click: () => encodeLast("htmld") },
      ],
    },
    {
      label: "JSON last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Pretty print", click: () => jsonFormatLast("pretty") },
        { label: "Minify", click: () => jsonFormatLast("minify") },
        { label: "Sort keys", click: () => jsonFormatLast("sort-keys") },
        { label: "Extract keys", click: () => jsonFormatLast("keys") },
        { label: "Validate + pretty", click: () => jsonFormatLast("validate") },
      ],
    },
    {
      label: "Hash last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "SHA-256", click: () => hashLast("sha256") },
        { label: "SHA-256 upper", click: () => hashLast("sha256-upper") },
        { label: "SHA-256 labeled", click: () => hashLast("sha256-labeled") },
        { label: "SHA-256 per line", click: () => hashLast("sha256-lines") },
        { label: "SHA-1", click: () => hashLast("sha1") },
        { label: "MD5", click: () => hashLast("md5") },
      ],
    },
    {
      label: "Number lines last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "1. 2. 3.", click: () => numberLinesLast("dot") },
        { label: "1) 2) 3)", click: () => numberLinesLast("paren") },
        { label: "01. 02. 03.", click: () => numberLinesLast("pad") },
        { label: "1 [tab] …", click: () => numberLinesLast("plain") },
        { label: "0. 1. 2.", click: () => numberLinesLast("zero") },
        { label: "Strip numbers", click: () => numberLinesLast("strip") },
      ],
    },
    {
      label: "Extract last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "URLs", click: () => extractLast("urls") },
        { label: "Emails", click: () => extractLast("emails") },
        { label: "Phones", click: () => extractLast("phones") },
        { label: "Hashtags", click: () => extractLast("hashtags") },
        { label: "Mentions", click: () => extractLast("mentions") },
        { label: "Numbers", click: () => extractLast("numbers") },
        { label: "All (grouped)", click: () => extractLast("all") },
      ],
    },
    {
      label: "Stats last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Full summary", click: () => statsLast("full") },
        { label: "Compact one-liner", click: () => statsLast("compact") },
        { label: "Words only", click: () => statsLast("words") },
        { label: "Chars only", click: () => statsLast("chars") },
        { label: "Lines only", click: () => statsLast("lines") },
        { label: "Sentences only", click: () => statsLast("sentences") },
        { label: "Reading time", click: () => statsLast("reading") },
      ],
    },
    {
      label: "Filter lines last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Drop blank lines", click: () => filterLinesLast("drop-blank") },
        { label: "Drop empty lines", click: () => filterLinesLast("drop-empty") },
        { label: "Trim trailing space", click: () => filterLinesLast("trim") },
        { label: "Collapse blank runs", click: () => filterLinesLast("collapse") },
        { label: "Drop short lines (<3)", click: () => filterLinesLast("drop-short") },
        { label: "Keep lines with text", click: () => filterLinesLast("keep-text") },
        { label: "Drop comments (# // ;)", click: () => filterLinesLast("drop-comments") },
      ],
    },
    {
      label: "Join lines last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Space", click: () => joinLinesLast("space") },
        { label: "Comma + space", click: () => joinLinesLast("comma-space") },
        { label: "Comma", click: () => joinLinesLast("comma") },
        { label: "Semicolon", click: () => joinLinesLast("semicolon") },
        { label: "Pipe |", click: () => joinLinesLast("pipe") },
        { label: "Slash /", click: () => joinLinesLast("slash") },
        { label: "Oxford and", click: () => joinLinesLast("and") },
        { label: "Newline (trim)", click: () => joinLinesLast("newline") },
        { label: "Concat (no sep)", click: () => joinLinesLast("concat") },
      ],
    },
    {
      label: "Split last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Sentences → lines", click: () => splitLast("sentences") },
        { label: "Words → lines", click: () => splitLast("words") },
        { label: "Commas → lines", click: () => splitLast("comma") },
        { label: "Semicolons → lines", click: () => splitLast("semicolon") },
        { label: "Pipes → lines", click: () => splitLast("pipe") },
        { label: "Slashes → lines", click: () => splitLast("slash") },
        { label: "Tabs → lines", click: () => splitLast("tab") },
        { label: "Spaces → lines", click: () => splitLast("space") },
        { label: "Oxford and → lines", click: () => splitLast("and") },
        { label: "Paragraphs → lines", click: () => splitLast("paragraphs") },
      ],
    },
    {
      label: "Prefix/suffix lines last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Prefix - bullet", click: () => prefixSuffixLinesLast("bullet") },
        { label: "Prefix * star", click: () => prefixSuffixLinesLast("star") },
        { label: "Prefix > quote", click: () => prefixSuffixLinesLast("blockquote") },
        { label: "Prefix [ ] checkbox", click: () => prefixSuffixLinesLast("checkbox") },
        { label: "Prefix → arrow", click: () => prefixSuffixLinesLast("arrow") },
        { label: "Prefix — dash", click: () => prefixSuffixLinesLast("dash") },
        { label: "Indent 2 spaces", click: () => prefixSuffixLinesLast("indent2") },
        { label: "Indent 4 spaces", click: () => prefixSuffixLinesLast("indent4") },
        { label: "Indent tab", click: () => prefixSuffixLinesLast("tab") },
        { label: "Outdent", click: () => prefixSuffixLinesLast("outdent") },
        { label: "Suffix period", click: () => prefixSuffixLinesLast("period") },
        { label: "Suffix comma", click: () => prefixSuffixLinesLast("comma") },
        { label: "Suffix semicolon", click: () => prefixSuffixLinesLast("semicolon") },
        { label: "Strip bullets/quotes", click: () => prefixSuffixLinesLast("strip-bullet") },
        { label: "Strip indent", click: () => prefixSuffixLinesLast("strip-indent") },
      ],
    },
    {
      label: "Pad lines last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Align left (pad end)", click: () => padLinesLast("align-left") },
        { label: "Align right (pad start)", click: () => padLinesLast("align-right") },
        { label: "Align center", click: () => padLinesLast("align-center") },
        { label: "Left pad 2 spaces", click: () => padLinesLast("left2") },
        { label: "Left pad 4 spaces", click: () => padLinesLast("left4") },
        { label: "Right pad 2 spaces", click: () => padLinesLast("right2") },
        { label: "Right pad 4 spaces", click: () => padLinesLast("right4") },
        { label: "Zero-pad numbers 2", click: () => padLinesLast("zero2") },
        { label: "Zero-pad numbers 3", click: () => padLinesLast("zero3") },
        { label: "Zero-pad numbers 4", click: () => padLinesLast("zero4") },
        { label: "Pad end to width 40", click: () => padLinesLast("width40") },
        { label: "Pad end to width 80", click: () => padLinesLast("width80") },
      ],
    },
    {
      label: "Truncate last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "First line", click: () => truncateLast("first-line") },
        { label: "Last line", click: () => truncateLast("last-line") },
        { label: "First 3 lines", click: () => truncateLast("first-3") },
        { label: "First 5 lines", click: () => truncateLast("first-5") },
        { label: "First 10 lines", click: () => truncateLast("first-10") },
        { label: "Last 3 lines", click: () => truncateLast("last-3") },
        { label: "Last 5 lines", click: () => truncateLast("last-5") },
        { label: "Drop first line", click: () => truncateLast("drop-first") },
        { label: "Drop last line", click: () => truncateLast("drop-last") },
        { label: "First 50 words", click: () => truncateLast("words-50") },
        { label: "First 100 words", click: () => truncateLast("words-100") },
        { label: "First 100 chars", click: () => truncateLast("chars-100") },
        { label: "First 280 chars", click: () => truncateLast("chars-280") },
        { label: "First 500 chars", click: () => truncateLast("chars-500") },
      ],
    },
    {
      label: "Columns last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "CSV · column 1", click: () => columnsLast("csv1") },
        { label: "CSV · column 2", click: () => columnsLast("csv2") },
        { label: "CSV · column 3", click: () => columnsLast("csv3") },
        { label: "CSV · last column", click: () => columnsLast("csv-last") },
        { label: "CSV · all but first", click: () => columnsLast("csv-rest") },
        { label: "TSV · column 1", click: () => columnsLast("tsv1") },
        { label: "TSV · column 2", click: () => columnsLast("tsv2") },
        { label: "TSV · last column", click: () => columnsLast("tsv-last") },
        { label: "Pipe · column 1", click: () => columnsLast("pipe1") },
        { label: "Pipe · last column", click: () => columnsLast("pipe-last") },
        { label: "Semicolon · column 1", click: () => columnsLast("semi1") },
        { label: "Semicolon · last column", click: () => columnsLast("semi-last") },
        { label: "CSV → TSV", click: () => columnsLast("csv-to-tsv") },
        { label: "TSV → CSV", click: () => columnsLast("tsv-to-csv") },
        { label: "Pipe → TSV", click: () => columnsLast("pipe-to-tsv") },
      ],
    },
    {
      label: "Whitespace last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Collapse spaces (per line)", click: () => whitespaceLast("collapse-spaces") },
        { label: "Collapse all → one line", click: () => whitespaceLast("collapse-all") },
        { label: "Trim each line", click: () => whitespaceLast("trim-lines") },
        { label: "Trim lines + edges", click: () => whitespaceLast("trim-all") },
        { label: "Trim trailing spaces", click: () => whitespaceLast("trim-end") },
        { label: "Tabs → 2 spaces", click: () => whitespaceLast("tabs-to-spaces2") },
        { label: "Tabs → 4 spaces", click: () => whitespaceLast("tabs-to-spaces4") },
        { label: "Leading spaces → tabs", click: () => whitespaceLast("spaces-to-tabs") },
        { label: "Newlines → LF", click: () => whitespaceLast("lf") },
        { label: "Newlines → CRLF", click: () => whitespaceLast("crlf") },
        { label: "Strip blank edges", click: () => whitespaceLast("strip-blank-edges") },
        { label: "Collapse blank runs", click: () => whitespaceLast("single-newline") },
      ],
    },
    {
      label: "Rotate lines last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "First → end", click: () => rotateLinesLast("first-to-end") },
        { label: "Last → start", click: () => rotateLinesLast("last-to-start") },
        { label: "Rotate up", click: () => rotateLinesLast("up") },
        { label: "Rotate down", click: () => rotateLinesLast("down") },
        { label: "Swap halves", click: () => rotateLinesLast("swap-halves") },
        { label: "Interleave halves", click: () => rotateLinesLast("interleave") },
        { label: "Odds first", click: () => rotateLinesLast("odds-first") },
        { label: "Evens first", click: () => rotateLinesLast("evens-first") },
        { label: "Blanks → end", click: () => rotateLinesLast("move-blank-end") },
        { label: "Blanks → start", click: () => rotateLinesLast("move-blank-start") },
      ],
    },
    {
      label: "Soft wrap last",
      enabled: !hotkeysPaused && !!getLatestTranscript(),
      submenu: [
        { label: "Width 40", click: () => softWrapLast("w40") },
        { label: "Width 60", click: () => softWrapLast("w60") },
        { label: "Width 72", click: () => softWrapLast("w72") },
        { label: "Width 80", click: () => softWrapLast("w80") },
        { label: "Width 100", click: () => softWrapLast("w100") },
        { label: "Width 120", click: () => softWrapLast("w120") },
        { label: "Indent + width 80", click: () => softWrapLast("indent-w80") },
        { label: "Unwrap paragraphs", click: () => softWrapLast("unwrap") },
      ],
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
  // Warm plan/usage for tray (non-blocking)
  setTimeout(() => {
    refreshPlanCache({ rebuild: true, force: true }).catch(() => {});
  }, 2500);
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
    if (next?.snippets != null) {
      cfg.snippets = normalizeSnippets(next.snippets);
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
  ipcMain.handle("test-nvidia-key", async () => testNvidiaKey());
  ipcMain.handle("test-openai-key", async () => testOpenAIKey());
  ipcMain.handle("get-usage-stats", () => getUsageStats());
  ipcMain.handle("reset-usage-stats", () => resetUsageStats());
  ipcMain.handle("paste-date-time", (_e, kind) =>
    pasteDateTime(String(kind || "datetime"))
  );
  ipcMain.handle("format-now", (_e, kind) => ({
    ok: true,
    kind: String(kind || "datetime"),
    text: formatNow(kind),
  }));
  ipcMain.handle("paste-id", (_e, kind) => pasteId(String(kind || "uuid")));
  ipcMain.handle("generate-id", (_e, kind) => ({
    ok: true,
    kind: String(kind || "uuid"),
    text: generateId(kind),
  }));
  ipcMain.handle("reformat-last", (_e, kind) =>
    reformatLast(String(kind || "single"))
  );
  ipcMain.handle("reformat-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "single"),
      text: reformatText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("wrap-last", (_e, kind) => wrapLast(String(kind || "quotes")));
  ipcMain.handle("wrap-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "quotes"),
      text: wrapText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("slugify-last", (_e, kind) =>
    slugifyLast(String(kind || "slug"))
  );
  ipcMain.handle("slugify-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "slug"),
      text: slugifyText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("sort-lines-last", (_e, kind) =>
    sortLinesLast(String(kind || "asc"))
  );
  ipcMain.handle("sort-lines-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "asc"),
      text: sortLinesText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("encode-last", (_e, kind) =>
    encodeLast(String(kind || "b64"))
  );
  ipcMain.handle("encode-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "b64"),
      text: encodeText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("json-format-last", (_e, kind) =>
    jsonFormatLast(String(kind || "pretty"))
  );
  ipcMain.handle("json-format-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    try {
      const r = jsonFormatText(src, kind);
      return {
        ok: true,
        kind: String(kind || "pretty"),
        text: r.text,
        info: r.info || null,
        source: src,
      };
    } catch (e) {
      return {
        ok: false,
        error: "invalid",
        detail: String(e && e.message ? e.message : e),
      };
    }
  });
  ipcMain.handle("hash-last", (_e, kind) => hashLast(String(kind || "sha256")));
  ipcMain.handle("hash-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "sha256"),
      text: hashText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("number-lines-last", (_e, kind) =>
    numberLinesLast(String(kind || "dot"))
  );
  ipcMain.handle("number-lines-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "dot"),
      text: numberLinesText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("extract-last", (_e, kind) =>
    extractLast(String(kind || "urls"))
  );
  ipcMain.handle("extract-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "urls"),
      text: extractText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("stats-last", (_e, kind) =>
    statsLast(String(kind || "full"))
  );
  ipcMain.handle("stats-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "full"),
      text: statsText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("filter-lines-last", (_e, kind) =>
    filterLinesLast(String(kind || "drop-blank"))
  );
  ipcMain.handle("filter-lines-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "drop-blank"),
      text: filterLinesText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("join-lines-last", (_e, kind) =>
    joinLinesLast(String(kind || "space"))
  );
  ipcMain.handle("join-lines-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "space"),
      text: joinLinesText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("split-last", (_e, kind) =>
    splitLast(String(kind || "sentences"))
  );
  ipcMain.handle("split-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "sentences"),
      text: splitText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("prefix-suffix-lines-last", (_e, kind) =>
    prefixSuffixLinesLast(String(kind || "bullet"))
  );
  ipcMain.handle("prefix-suffix-lines-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "bullet"),
      text: prefixSuffixLinesText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("pad-lines-last", (_e, kind) =>
    padLinesLast(String(kind || "align-left"))
  );
  ipcMain.handle("pad-lines-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "align-left"),
      text: padLinesText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("truncate-last", (_e, kind) =>
    truncateLast(String(kind || "first-line"))
  );
  ipcMain.handle("truncate-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "first-line"),
      text: truncateText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("columns-last", (_e, kind) =>
    columnsLast(String(kind || "csv1"))
  );
  ipcMain.handle("columns-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "csv1"),
      text: columnsText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("whitespace-last", (_e, kind) =>
    whitespaceLast(String(kind || "collapse-spaces"))
  );
  ipcMain.handle("whitespace-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "collapse-spaces"),
      text: whitespaceText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("rotate-lines-last", (_e, kind) =>
    rotateLinesLast(String(kind || "first-to-end"))
  );
  ipcMain.handle("rotate-lines-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "first-to-end"),
      text: rotateLinesText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("soft-wrap-last", (_e, kind) =>
    softWrapLast(String(kind || "w80"))
  );
  ipcMain.handle("soft-wrap-preview", (_e, kind) => {
    const src = getLatestTranscript();
    if (!src) return { ok: false, error: "empty" };
    return {
      ok: true,
      kind: String(kind || "w80"),
      text: softWrapText(src, kind),
      source: src,
    };
  });
  ipcMain.handle("copy-last-transcript", (_e, index, opts) =>
    copyLastTranscript(
      Number(index) || 0,
      opts && typeof opts === "object" ? opts : {}
    )
  );
  ipcMain.handle("paste-last-transcript", (_e, index, opts) =>
    pasteLastTranscript(
      Number(index) || 0,
      opts && typeof opts === "object" ? opts : {}
    )
  );
  ipcMain.handle("cancel-dictation", () => cancelDictation());
  ipcMain.handle("get-history", () => flatHistory());
  ipcMain.handle("copy-all-history", () => copyAllHistory());
  ipcMain.handle("pin-history-at", (_e, index) =>
    pinHistoryAt(Number(index) || 0)
  );
  ipcMain.handle("move-history-at", (_e, index, delta) =>
    moveHistoryAt(Number(index) || 0, Number(delta) || -1)
  );
  ipcMain.handle("boost-history-at", (_e, index) =>
    boostHistoryAt(Number(index) || 0)
  );
  ipcMain.handle("merge-history-with-next", (_e, index) =>
    mergeHistoryWithNext(Number(index) || 0)
  );
  ipcMain.handle("merge-last-two-history", () => mergeLastTwoHistory());
  ipcMain.handle("duplicate-history-at", (_e, index) =>
    duplicateHistoryAt(Number(index) || 0)
  );
  ipcMain.handle("get-snippets", () => getSnippets());
  ipcMain.handle("set-snippets", (_e, list) => setSnippets(list));
  ipcMain.handle("paste-snippet-at", (_e, index) =>
    pasteSnippetAt(Number(index) || 0)
  );
  ipcMain.handle("save-snippet-from-history", (_e, index, opts) =>
    saveSnippetFromHistory(
      Number(index) || 0,
      opts && typeof opts === "object" ? opts : {}
    )
  );
  ipcMain.handle("refresh-plan", async () => {
    const label = await refreshPlanCache({ rebuild: true, force: true });
    return { ok: true, label: cachedPlanLabel, planLabel: label };
  });
  ipcMain.handle("export-history", () => exportHistory());
  ipcMain.handle("import-history", async () => importHistory());
  ipcMain.handle("open-user-data", () => openUserDataFolder());
  ipcMain.handle("reset-hotkeys", () => resetHotkeys());
  ipcMain.handle("set-stt-lang", (_e, lang) => setSttLang(lang));
  ipcMain.handle("set-case-mode", (_e, mode) => setCaseMode(mode));
  ipcMain.handle("set-hud-compact", (_e, on) => setHudCompact(!!on));
  ipcMain.handle("reset-hud-position", () => resetHudPosition());
  ipcMain.handle("set-tts-rate", (_e, rate) => setTtsRate(rate));
  ipcMain.handle("set-append-joiner", (_e, mode) => setAppendJoiner(mode));
  ipcMain.handle("set-config-flag", (_e, key, on) => {
    const labels = {
      continuousDictation: "Continuous dictation",
      appendDictation: "Append to last",
      autoPaste: "Auto-paste",
      clearClipboardAfter: "Clear clipboard after paste",
      soundCues: "Sound cues",
      quietNotifications: "Quiet notifications",
    };
    if (!labels[key]) return { ok: false, error: "unknown" };
    return setConfigFlag(key, on, labels[key]);
  });
  ipcMain.handle("clear-history", (_e, opts) =>
    clearHistory(opts && typeof opts === "object" ? opts : {})
  );
  ipcMain.handle("reread-last", async () => rereadLast());
  ipcMain.handle("undo-last-dictation", () => undoLastDictation());
  ipcMain.handle("delete-history-at", (_e, index) =>
    deleteHistoryAt(Number(index) || 0)
  );
  ipcMain.handle("update-history-at", (_e, index, text) =>
    updateHistoryAt(Number(index) || 0, text)
  );
  ipcMain.handle("speak-history-at", async (_e, index) =>
    speakHistoryAt(Number(index) || 0)
  );
  ipcMain.handle("repolish-last", async (_e, index) =>
    repolishLast(Number(index) || 0)
  );
  ipcMain.handle("copy-support-diagnostics", () => copySupportDiagnostics());
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
    let polished = await finalizeTranscript(raw);
    if (cfg?.appendDictation) {
      const prev = String(lastTranscript || normalizeHistory(cfg?.history)[0] || "").trim();
      if (prev && polished) {
        const j = appendJoinerText();
        // Avoid double separators if prev already ends with whitespace
        const needsJoin = j === " " ? !/\s$/.test(prev) : !prev.endsWith(j);
        polished = (prev + (needsJoin ? j : "") + polished).replace(/[ \t]+\n/g, "\n").trim();
      }
    }
    pushHistory(polished);
    const del = deliverText(polished);
    broadcastStatus({ phase: "idle", last: polished, appended: !!cfg?.appendDictation });
    if (del.mode === "paste") {
      notifyDeliver(polished, "paste");
    } else if (del.mode === "clipboard") {
      // deliverText already notified via notifyDeliver
    }
    // Continuous dictation: auto-restart listening after successful delivery
    if (cfg?.continuousDictation && !hotkeysPaused && polished) {
      setTimeout(() => {
        if (hotkeysPaused || listening || reading) return;
        if (!cfg?.continuousDictation) return;
        startListening().catch(() => {});
      }, 450);
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
