const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dictaste", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (c) => ipcRenderer.invoke("save-config", c),
  polishAndPaste: (t) => ipcRenderer.invoke("polish-and-paste", t),
  licenseStatus: () => ipcRenderer.invoke("license-status"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  listSapiVoices: () => ipcRenderer.invoke("list-sapi-voices"),
  testVoice: () => ipcRenderer.invoke("test-voice"),
  copyLastTranscript: (index) => ipcRenderer.invoke("copy-last-transcript", index),
  pasteLastTranscript: (index) => ipcRenderer.invoke("paste-last-transcript", index),
  cancelDictation: () => ipcRenderer.invoke("cancel-dictation"),
  setSttLang: (lang) => ipcRenderer.invoke("set-stt-lang", lang),
  setCaseMode: (mode) => ipcRenderer.invoke("set-case-mode", mode),
  setHudCompact: (on) => ipcRenderer.invoke("set-hud-compact", on),
  resetHudPosition: () => ipcRenderer.invoke("reset-hud-position"),
  setTtsRate: (rate) => ipcRenderer.invoke("set-tts-rate", rate),
  setConfigFlag: (key, on) => ipcRenderer.invoke("set-config-flag", key, on),
  getHistory: () => ipcRenderer.invoke("get-history"),
  exportHistory: () => ipcRenderer.invoke("export-history"),
  importHistory: () => ipcRenderer.invoke("import-history"),
  openUserData: () => ipcRenderer.invoke("open-user-data"),
  resetHotkeys: () => ipcRenderer.invoke("reset-hotkeys"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  rereadLast: () => ipcRenderer.invoke("reread-last"),
  repolishLast: (index) => ipcRenderer.invoke("repolish-last", index),
  copySupportDiagnostics: () => ipcRenderer.invoke("copy-support-diagnostics"),
  getHotkeysPaused: () => ipcRenderer.invoke("get-hotkeys-paused"),
  setHotkeysPaused: (paused, opts) =>
    ipcRenderer.invoke("set-hotkeys-paused", paused, opts || {}),
  pauseHotkeysFor: (minutes) => ipcRenderer.invoke("pause-hotkeys-for", minutes),
  exportSettings: (opts) => ipcRenderer.invoke("export-settings", opts),
  importSettings: () => ipcRenderer.invoke("import-settings"),
  readSelection: () => ipcRenderer.invoke("read-selection"),
  polishSelection: () => ipcRenderer.invoke("polish-selection"),
  stopReading: () => ipcRenderer.invoke("stop-reading"),
  openExternal: (u) => ipcRenderer.invoke("open-external", u),
  setListening: (on) => ipcRenderer.invoke("set-listening", on),
  sessionComplete: (payload) => ipcRenderer.invoke("session-complete", payload),
  onStatus: (cb) => {
    const handler = (_e, s) => cb(s);
    ipcRenderer.on("status", handler);
    return () => ipcRenderer.removeListener("status", handler);
  },
  onDictateControl: (cb) => {
    const handler = (_e, s) => cb(s);
    ipcRenderer.on("dictate-control", handler);
    return () => ipcRenderer.removeListener("dictate-control", handler);
  },
});
