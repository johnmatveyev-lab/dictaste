/**
 * Dictaste Windows MVP
 * - Tray app + lime brand icon
 * - Global shortcut Ctrl+Shift+Space starts/stops mic capture
 * - Web Speech STT in always-on-top HUD
 * - Auto polish via /api/v1/polish + paste (Ctrl+V) on stop
 * - Highlight-to-speak (Flow Read free): Ctrl+Shift+R → selection/clipboard + SAPI
 * - Settings for license key + API base
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
    /** webspeech | openai | whisper-cli */
    sttMode: "webspeech",
    openAIKey: "",
    /** Absolute path to whisper.cpp `whisper-cli` or `main` binary (optional offline) */
    whisperBin: "",
    whisperModel: "",
    /** First-run welcome notification shown once */
    seenWelcome: false,
    /** Highlight-to-speak rate: -10..10 (SAPI) */
    ttsRate: 0,
  };
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
    const b64 = Buffer.from(trimmed, "utf8").toString("base64");
    const ps1 = path.join(app.getPath("temp"), `dictaste-speak-${Date.now()}.ps1`);
    const script = [
      "Add-Type -AssemblyName System.Speech",
      `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer`,
      `$s.Rate = ${rate}`,
      `$bytes = [Convert]::FromBase64String('${b64}')`,
      `$t = [Text.Encoding]::UTF8.GetString($bytes)`,
      `$s.Speak($t)`,
      "",
    ].join("\r\n");
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

/** Toggle highlight-to-speak (Flow Read free path). */
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
    notify("Highlight text (or copy) then press Ctrl+Shift+R");
    return;
  }
  const preview = text.length > 60 ? text.slice(0, 57) + "…" : text;
  notify(`Reading · ${preview}`);
  try {
    await speakTextSapi(text);
  } catch (e) {
    notify(`Read failed: ${e.message || e}`);
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

async function polishText(text) {
  if (!cfg.polish || !text.trim()) return text;
  if (!cfg.licenseKey) return text;
  const base = (cfg.apiBase || DEFAULT_API).replace(/\/$/, "");
  try {
    const { status, json } = await requestJson(`${base}/api/v1/polish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.licenseKey}` },
      body: { text },
    });
    if (status === 200 && json.text) return json.text;
  } catch {
    /* keep raw */
  }
  return text;
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
    const preamble =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n` +
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

function pasteText(text) {
  if (!text) return;
  const prev = clipboard.readText();
  clipboard.writeText(text);
  // Windows: SendKeys Ctrl+V into focused window
  exec(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 80; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
    () => {
      setTimeout(() => clipboard.writeText(prev), 500);
    }
  );
}

function notify(body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title: "Dictaste", body }).show();
    }
  } catch {
    /* ignore */
  }
}

function setTrayLabel() {
  if (!tray) return;
  if (listening) {
    tray.setToolTip("Dictaste — listening (Ctrl+Shift+Space to stop)");
  } else if (reading) {
    tray.setToolTip("Dictaste — reading (Ctrl+Shift+R to stop)");
  } else {
    tray.setToolTip(
      "Dictaste — dictate Ctrl+Shift+Space · read selection Ctrl+Shift+R"
    );
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

function ensureHud() {
  if (hudWin && !hudWin.isDestroyed()) return hudWin;
  hudWin = new BrowserWindow({
    width: 360,
    height: 120,
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

function showHud() {
  const w = ensureHud();
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
    hudWin.webContents.send("dictate-control", { action: "stop" });
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

function createTray() {
  const img = makeTrayIcon();
  tray = new Tray(img);
  const base = () => (cfg.apiBase || DEFAULT_API).replace(/\/$/, "");
  const menu = Menu.buildFromTemplate([
    { label: `Dictaste ${appVersion()}`, enabled: false },
    { type: "separator" },
    {
      label: "Toggle dictation (Ctrl+Shift+Space)",
      click: () => toggleListen(),
    },
    {
      label: "Read selection (Ctrl+Shift+R)",
      click: () => {
        toggleFlowRead().catch(() => {});
      },
    },
    {
      label: "Stop reading",
      click: () => stopSpeaking(),
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
        notify(`Dictaste ${appVersion()} · opening download page for latest Mac/Windows builds`);
        shell.openExternal(`${base()}/download`);
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
  setTrayLabel();
  tray.on("click", () => openSettings());
}

app.whenReady().then(() => {
  cfg = loadConfig();
  createTray();
  ensureHud();
  globalShortcut.register("CommandOrControl+Shift+Space", () => toggleListen());
  globalShortcut.register("CommandOrControl+Shift+R", () => {
    toggleFlowRead().catch(() => {});
  });

  ipcMain.handle("get-config", () => cfg);
  ipcMain.handle("save-config", (_e, next) => {
    cfg = { ...cfg, ...next };
    saveConfig(cfg);
    return cfg;
  });
  ipcMain.handle("polish-and-paste", async (_e, text) => {
    const polished = await polishText(String(text || ""));
    if (cfg.autoPaste !== false) pasteText(polished);
    return polished;
  });
  ipcMain.handle("read-selection", async () => {
    await toggleFlowRead();
    return { reading };
  });
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
    const polished = await polishText(raw);
    if (cfg.autoPaste !== false) pasteText(polished);
    broadcastStatus({ phase: "idle", last: polished });
    notify(polished.length > 80 ? polished.slice(0, 77) + "…" : polished);
    return { polished };
  });

  // First-run: open settings so license can be pasted + welcome toast
  if (!cfg.licenseKey) {
    setTimeout(() => openSettings(), 400);
  }
  if (!cfg.seenWelcome) {
    setTimeout(() => {
      notify(
        `Welcome · Dictaste ${appVersion()}. Dictate Ctrl+Shift+Space · Read selection Ctrl+Shift+R. Paste license in Settings.`
      );
      cfg.seenWelcome = true;
      saveConfig(cfg);
    }, 1200);
  }
});

app.on("will-quit", () => {
  stopSpeaking();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", (e) => {
  e.preventDefault?.();
});
