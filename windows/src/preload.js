const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dictaste", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (c) => ipcRenderer.invoke("save-config", c),
  polishAndPaste: (t) => ipcRenderer.invoke("polish-and-paste", t),
  licenseStatus: () => ipcRenderer.invoke("license-status"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  listSapiVoices: () => ipcRenderer.invoke("list-sapi-voices"),
  copyLastTranscript: (index) => ipcRenderer.invoke("copy-last-transcript", index),
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  readSelection: () => ipcRenderer.invoke("read-selection"),
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
