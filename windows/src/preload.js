const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dictaste", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (c) => ipcRenderer.invoke("save-config", c),
  polishAndPaste: (t) => ipcRenderer.invoke("polish-and-paste", t),
  licenseStatus: () => ipcRenderer.invoke("license-status"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  listSapiVoices: () => ipcRenderer.invoke("list-sapi-voices"),
  testVoice: () => ipcRenderer.invoke("test-voice"),
  testNvidiaKey: () => ipcRenderer.invoke("test-nvidia-key"),
  testOpenAIKey: () => ipcRenderer.invoke("test-openai-key"),
  getUsageStats: () => ipcRenderer.invoke("get-usage-stats"),
  resetUsageStats: () => ipcRenderer.invoke("reset-usage-stats"),
  pasteDateTime: (kind) => ipcRenderer.invoke("paste-date-time", kind),
  formatNow: (kind) => ipcRenderer.invoke("format-now", kind),
  pasteId: (kind) => ipcRenderer.invoke("paste-id", kind),
  generateId: (kind) => ipcRenderer.invoke("generate-id", kind),
  reformatLast: (kind) => ipcRenderer.invoke("reformat-last", kind),
  reformatPreview: (kind) => ipcRenderer.invoke("reformat-preview", kind),
  wrapLast: (kind) => ipcRenderer.invoke("wrap-last", kind),
  wrapPreview: (kind) => ipcRenderer.invoke("wrap-preview", kind),
  slugifyLast: (kind) => ipcRenderer.invoke("slugify-last", kind),
  slugifyPreview: (kind) => ipcRenderer.invoke("slugify-preview", kind),
  sortLinesLast: (kind) => ipcRenderer.invoke("sort-lines-last", kind),
  sortLinesPreview: (kind) => ipcRenderer.invoke("sort-lines-preview", kind),
  encodeLast: (kind) => ipcRenderer.invoke("encode-last", kind),
  encodePreview: (kind) => ipcRenderer.invoke("encode-preview", kind),
  jsonFormatLast: (kind) => ipcRenderer.invoke("json-format-last", kind),
  jsonFormatPreview: (kind) => ipcRenderer.invoke("json-format-preview", kind),
  hashLast: (kind) => ipcRenderer.invoke("hash-last", kind),
  hashPreview: (kind) => ipcRenderer.invoke("hash-preview", kind),
  numberLinesLast: (kind) => ipcRenderer.invoke("number-lines-last", kind),
  numberLinesPreview: (kind) =>
    ipcRenderer.invoke("number-lines-preview", kind),
  extractLast: (kind) => ipcRenderer.invoke("extract-last", kind),
  extractPreview: (kind) => ipcRenderer.invoke("extract-preview", kind),
  statsLast: (kind) => ipcRenderer.invoke("stats-last", kind),
  statsPreview: (kind) => ipcRenderer.invoke("stats-preview", kind),
  filterLinesLast: (kind) => ipcRenderer.invoke("filter-lines-last", kind),
  filterLinesPreview: (kind) => ipcRenderer.invoke("filter-lines-preview", kind),
  copyLastTranscript: (index, opts) =>
    ipcRenderer.invoke("copy-last-transcript", index, opts || {}),
  pasteLastTranscript: (index, opts) =>
    ipcRenderer.invoke("paste-last-transcript", index, opts || {}),
  cancelDictation: () => ipcRenderer.invoke("cancel-dictation"),
  setSttLang: (lang) => ipcRenderer.invoke("set-stt-lang", lang),
  setCaseMode: (mode) => ipcRenderer.invoke("set-case-mode", mode),
  setHudCompact: (on) => ipcRenderer.invoke("set-hud-compact", on),
  resetHudPosition: () => ipcRenderer.invoke("reset-hud-position"),
  setTtsRate: (rate) => ipcRenderer.invoke("set-tts-rate", rate),
  setConfigFlag: (key, on) => ipcRenderer.invoke("set-config-flag", key, on),
  setAppendJoiner: (mode) => ipcRenderer.invoke("set-append-joiner", mode),
  getHistory: () => ipcRenderer.invoke("get-history"),
  copyAllHistory: () => ipcRenderer.invoke("copy-all-history"),
  refreshPlan: () => ipcRenderer.invoke("refresh-plan"),
  exportHistory: () => ipcRenderer.invoke("export-history"),
  importHistory: () => ipcRenderer.invoke("import-history"),
  openUserData: () => ipcRenderer.invoke("open-user-data"),
  resetHotkeys: () => ipcRenderer.invoke("reset-hotkeys"),
  clearHistory: (opts) => ipcRenderer.invoke("clear-history", opts || {}),
  rereadLast: () => ipcRenderer.invoke("reread-last"),
  undoLastDictation: () => ipcRenderer.invoke("undo-last-dictation"),
  deleteHistoryAt: (index) => ipcRenderer.invoke("delete-history-at", index),
  updateHistoryAt: (index, text) =>
    ipcRenderer.invoke("update-history-at", index, text),
  speakHistoryAt: (index) => ipcRenderer.invoke("speak-history-at", index),
  pinHistoryAt: (index) => ipcRenderer.invoke("pin-history-at", index),
  moveHistoryAt: (index, delta) =>
    ipcRenderer.invoke("move-history-at", index, delta),
  boostHistoryAt: (index) => ipcRenderer.invoke("boost-history-at", index),
  mergeHistoryWithNext: (index) =>
    ipcRenderer.invoke("merge-history-with-next", index),
  mergeLastTwoHistory: () => ipcRenderer.invoke("merge-last-two-history"),
  duplicateHistoryAt: (index) =>
    ipcRenderer.invoke("duplicate-history-at", index),
  getSnippets: () => ipcRenderer.invoke("get-snippets"),
  setSnippets: (list) => ipcRenderer.invoke("set-snippets", list),
  pasteSnippetAt: (index) => ipcRenderer.invoke("paste-snippet-at", index),
  saveSnippetFromHistory: (index, opts) =>
    ipcRenderer.invoke("save-snippet-from-history", index, opts || {}),
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
