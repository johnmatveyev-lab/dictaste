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
  getHistory: () => ipcRenderer.invoke("get-history"),
  exportHistory: () => ipcRenderer.invoke("export-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
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
