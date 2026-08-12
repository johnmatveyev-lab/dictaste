#!/usr/bin/env node
/**
 * Static sanity check for Dictaste Windows MVP (no Electron required).
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const need = [
  "src/main.js",
  "src/preload.js",
  "src/settings.html",
  "src/hud.html",
  "package.json",
  "build/icon.ico",
  "build/icon.png",
];
let bad = 0;

function pass(m) {
  console.log("  ✓", m);
}
function fail(m) {
  console.log("  ✗", m);
  bad++;
}

console.log("\nDictaste Windows MVP verify\n");

for (const f of need) {
  if (existsSync(resolve(root, f))) pass(f);
  else fail(`missing ${f}`);
}

const main = readFileSync(resolve(root, "src/main.js"), "utf8");
const settings = readFileSync(resolve(root, "src/settings.html"), "utf8");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

if (pkg.productName === "Dictaste" || pkg.build?.productName === "Dictaste") pass("productName Dictaste");
else fail("productName not Dictaste");

if (pkg.build?.appId === "com.dictaste.windows") pass("appId com.dictaste.windows");
else fail("appId wrong");

if (pkg.build?.icon || pkg.build?.win?.icon) pass("package icon configured");
else fail("package icon not configured");

for (const s of [
  "dictaste.vercel.app",
  "Ctrl+Shift+Space",
  "CommandOrControl+Shift+Space",
  "CommandOrControl+Shift+R",
  "toggleFlowRead",
  "speakTextSapi",
  "speakTextManaged",
  "speakTextByoOpenAI",
  "playMp3File",
  "applyLaunchAtLogin",
  "/api/v1/tts",
  "captureSelectionText",
  "Read selection",
  "ttsEngine",
  "launchAtLogin",
  "registerHotkeys",
  "hotkeyDictate",
  "hotkeyRead",
  "toAccelerator",
  "fetchLicenseStatus",
  "/api/v1/me",
  "license-status",
  "checkForUpdates",
  "cmpSemver",
  "upgradeUrl",
  "quietNotifications",
  "transcribeOpenAI",
  "transcribeWhisperCli",
  "session-complete",
  "/api/v1/polish",
  "Help / Issues",
  "Unlock free Developer plan",
  "/developers/setup",
  "/pricing",
  "Star on GitHub",
  "Check for updates",
  "seenWelcome",
  "ttsRate",
  "ttsVoice",
  "ttsSapiVoice",
  "listSapiVoices",
  "copyLastTranscript",
  "Copy last transcript",
  "pushHistory",
  "Recent transcripts",
  "get-history",
  "clear-history",
  "sttLang",
  "pasteSuffix",
  "applyPasteSuffix",
  "testVoice",
  "test-voice",
  "soundCues",
  "exportHistory",
  "export-history",
  "applyReplacements",
  "applyAutoCapitalize",
  "finalizeTranscript",
  "replacements",
  "autoCapitalize",
  "polishSelection",
  "hotkeyPolish",
  "CommandOrControl+Shift+P",
  "Polish selection",
  "deliverText",
  "hotkeysPaused",
  "setHotkeysPaused",
  "exportSettings",
  "importSettings",
  "Pause hotkeys",
  "silent: true",
]) {
  if (main.includes(s)) pass(`main.js has ${s}`);
  else fail(`main.js missing ${s}`);
}

if (/Ctrl\+Shift\+R|Read selection|highlight-to-speak/i.test(settings)) {
  pass("settings.html documents highlight-to-speak");
} else {
  fail("settings.html missing highlight-to-speak copy");
}
if (/id="ttsEngine"|ttsEngine/i.test(settings)) {
  pass("settings.html has ttsEngine control");
} else {
  fail("settings.html missing ttsEngine control");
}
if (/id="ttsRate"/i.test(settings)) {
  pass("settings.html has ttsRate control");
} else {
  fail("settings.html missing ttsRate control");
}
if (/id="ttsVoice"/i.test(settings)) {
  pass("settings.html has ttsVoice control");
} else {
  fail("settings.html missing ttsVoice control");
}
if (/id="ttsSapiVoice"/i.test(settings)) {
  pass("settings.html has ttsSapiVoice control");
} else {
  fail("settings.html missing ttsSapiVoice control");
}
if (/Copy last transcript/i.test(settings)) {
  pass("settings.html has copy last transcript");
} else {
  fail("settings.html missing copy last transcript");
}
if (/id="history"|Recent transcripts/i.test(settings)) {
  pass("settings.html has recent history UI");
} else {
  fail("settings.html missing recent history UI");
}
if (/id="sttLang"/i.test(settings)) {
  pass("settings.html has sttLang control");
} else {
  fail("settings.html missing sttLang control");
}
if (/id="pasteSuffix"/i.test(settings)) {
  pass("settings.html has pasteSuffix control");
} else {
  fail("settings.html missing pasteSuffix control");
}
if (/id="testVoice"|Test voice/i.test(settings)) {
  pass("settings.html has test voice");
} else {
  fail("settings.html missing test voice");
}
if (/id="soundCues"/i.test(settings)) {
  pass("settings.html has soundCues");
} else {
  fail("settings.html missing soundCues");
}
if (/id="exportHistory"|Export history/i.test(settings)) {
  pass("settings.html has export history");
} else {
  fail("settings.html missing export history");
}
if (/id="replacements"/i.test(settings)) {
  pass("settings.html has replacements");
} else {
  fail("settings.html missing replacements");
}
if (/id="autoCapitalize"/i.test(settings)) {
  pass("settings.html has autoCapitalize");
} else {
  fail("settings.html missing autoCapitalize");
}
if (/id="hotkeyPolish"|Polish selection/i.test(settings)) {
  pass("settings.html has polish selection hotkey");
} else {
  fail("settings.html missing polish selection hotkey");
}
if (/id="pauseHotkeys"|Pause hotkeys/i.test(settings)) {
  pass("settings.html has pause hotkeys");
} else {
  fail("settings.html missing pause hotkeys");
}
if (/id="exportSettings"|Import settings/i.test(settings)) {
  pass("settings.html has export/import settings");
} else {
  fail("settings.html missing export/import settings");
}
if (/id="spokenPunctuation"|Spoken punctuation/i.test(settings)) {
  pass("settings.html has spoken punctuation");
} else {
  fail("settings.html missing spoken punctuation");
}
if (/id="stripFillers"|Strip fillers/i.test(settings)) {
  pass("settings.html has strip fillers");
} else {
  fail("settings.html missing strip fillers");
}
if (/id="hotkeyCancel"|Cancel dictation/i.test(settings)) {
  pass("settings.html has cancel dictation");
} else {
  fail("settings.html missing cancel dictation");
}
if (/id="hotkeyPasteLast"|Paste last transcript/i.test(settings)) {
  pass("settings.html has paste last");
} else {
  fail("settings.html missing paste last");
}
if (/id="silenceTimeout"|Silence auto-stop/i.test(settings)) {
  pass("settings.html has silence auto-stop");
} else {
  fail("settings.html missing silence auto-stop");
}
if (/id="pasteDelay"|Paste delay/i.test(settings)) {
  pass("settings.html has paste delay");
} else {
  fail("settings.html missing paste delay");
}
if (/id="doubleSpacePeriod"|Double-space/i.test(settings)) {
  pass("settings.html has double-space period");
} else {
  fail("settings.html missing double-space period");
}
if (/id="maxDictation"|Max dictation/i.test(settings)) {
  pass("settings.html has max dictation");
} else {
  fail("settings.html missing max dictation");
}
if (/id="persistPauseHotkeys"|Remember pause/i.test(settings)) {
  pass("settings.html has persist pause");
} else {
  fail("settings.html missing persist pause");
}
if (/id="pause5"|Pause 5 min/i.test(settings)) {
  pass("settings.html has timed pause buttons");
} else {
  fail("settings.html missing timed pause buttons");
}
if (/id="historyMax"|History size/i.test(settings)) {
  pass("settings.html has history size");
} else {
  fail("settings.html missing history size");
}
if (/pasteLastTranscript|Shift-click|click = paste/i.test(settings)) {
  pass("settings.html has history paste");
} else {
  fail("settings.html missing history paste");
}
if (/id="caseMode"|Case mode/i.test(settings)) {
  pass("settings.html has case mode");
} else {
  fail("settings.html missing case mode");
}
if (/id="smartQuotes"|Smart quotes/i.test(settings)) {
  pass("settings.html has smart quotes");
} else {
  fail("settings.html missing smart quotes");
}
if (/id="hudCompact"|Compact HUD/i.test(settings)) {
  pass("settings.html has compact HUD");
} else {
  fail("settings.html missing compact HUD");
}
if (/id="showWordCount"|word count/i.test(settings)) {
  pass("settings.html has word count");
} else {
  fail("settings.html missing word count");
}
if (/id="importHistory"|Import history/i.test(settings)) {
  pass("settings.html has import history");
} else {
  fail("settings.html missing import history");
}
if (/id="minWordsForPolish"|Min words for AI polish/i.test(settings)) {
  pass("settings.html has min words for polish");
} else {
  fail("settings.html missing min words for polish");
}
if (/id="openData"|Open data folder/i.test(settings)) {
  pass("settings.html has open data folder");
} else {
  fail("settings.html missing open data folder");
}
if (/id="resetHotkeys"|Reset hotkeys/i.test(settings)) {
  pass("settings.html has reset hotkeys");
} else {
  fail("settings.html missing reset hotkeys");
}
const hud = readFileSync(resolve(root, "src/hud.html"), "utf8");
if (/sttLang|msg\.sttLang/i.test(hud)) {
  pass("hud.html accepts sttLang");
} else {
  fail("hud.html missing sttLang wiring");
}
if (/playCue|soundCues/i.test(hud)) {
  pass("hud.html has sound cues");
} else {
  fail("hud.html missing sound cues");
}
if (/action === ['"]cancel['"]|discard:\s*true/i.test(hud)) {
  pass("hud.html has cancel/discard");
} else {
  fail("hud.html missing cancel/discard");
}
if (/armSilenceTimer|silenceTimeoutMs/i.test(hud)) {
  pass("hud.html has silence auto-stop");
} else {
  fail("hud.html missing silence auto-stop");
}
if (/maxDictationMs|armMaxDurationTimer/i.test(hud)) {
  pass("hud.html has max dictation duration");
} else {
  fail("hud.html missing max dictation duration");
}
if (/body\.compact|applyCompact|hudCompact/i.test(hud)) {
  pass("hud.html has compact style");
} else {
  fail("hud.html missing compact style");
}
if (/^0\.1\.\d+$/.test(pkg.version)) {
  pass(`package version ${pkg.version}`);
} else {
  fail(`unexpected version ${pkg.version}`);
}

if (/waitlist/i.test(main)) fail("waitlist copy still in main.js");
else pass("no waitlist copy in main.js");

if (/applySpokenPunctuation|spokenPunctuation/.test(main)) pass("main spoken punctuation");
else fail("main missing spoken punctuation");
if (/applyStripFillers|stripFillers/.test(main)) pass("main strip fillers");
else fail("main missing strip fillers");
if (/cancelDictation|hotkeyCancel/.test(main)) pass("main cancel dictation");
else fail("main missing cancel dictation");
if (/pasteLastTranscript|hotkeyPasteLast/.test(main)) pass("main paste last");
else fail("main missing paste last");
if (/silenceTimeoutMs/.test(main)) pass("main silence auto-stop config");
else fail("main missing silence auto-stop");
if (/pasteDelayMs|pasteDelayMsClamped/.test(main)) pass("main paste delay");
else fail("main missing paste delay");
if (/doubleSpacePeriod|applyDoubleSpacePeriod/.test(main)) pass("main double-space period");
else fail("main missing double-space period");
if (/maxDictationMs|maxDictationMsClamped/.test(main)) pass("main max dictation");
else fail("main missing max dictation");
if (/persistPauseHotkeys|pauseResumeAt|pauseHotkeysFor|Pause 15 minutes/.test(main)) pass("main timed/persist pause");
else fail("main missing timed/persist pause");
if (/historyMax|historyMaxClamped|Paste into focused app/.test(main)) pass("main paste from history");
else fail("main missing paste from history");
if (/setSttLang|STT_LANG_LABELS|Language ·/.test(main)) pass("main tray language switcher");
else fail("main missing tray language switcher");
if (/caseMode|applyCaseMode|setCaseMode/.test(main)) pass("main case modes");
else fail("main missing case modes");
if (/smartQuotes|applySmartQuotes/.test(main)) pass("main smart quotes");
else fail("main missing smart quotes");
if (/hudCompact|setHudCompact|applyHudSize/.test(main)) pass("main compact HUD");
else fail("main missing compact HUD");
if (/showWordCount|notifyDeliver|countWords/.test(main)) pass("main word-count toast");
else fail("main missing word-count toast");
if (/importHistory|Import history/.test(main)) pass("main import history");
else fail("main missing import history");
if (/minWordsForPolish|minWordsForPolishClamped/.test(main)) pass("main skip polish under N words");
else fail("main missing skip polish under N words");
if (/openUserDataFolder|Open data folder/.test(main)) pass("main open data folder");
else fail("main missing open data folder");
if (/resetHotkeys|Reset hotkeys/.test(main)) pass("main reset hotkeys");
else fail("main missing reset hotkeys");
if (/rereadLast|Re-read last|speakReadText/.test(main)) pass("main re-read last");
else fail("main missing re-read last");
if (/function clearHistory|Clear history/.test(main)) pass("main clear history");
else fail("main missing clear history");
if (/minWordsForRead|minWordsForReadClamped/.test(main)) pass("main skip short reads");
else fail("main missing skip short reads");
if (/liveWordLabel|countWords/.test(hud)) pass("hud live word count");
else fail("hud missing live word count");
if (/FlowDictate|flowdictate/.test(main)) fail("FlowDictate leak in main.js");
else pass("no FlowDictate in main.js");

if (/FlowDictate|flowdictate/.test(hud)) fail("FlowDictate leak in hud.html");
else pass("no FlowDictate in hud.html");

console.log(`\n=== ${bad === 0 ? "OK" : "FAILED"} (${bad} issues) ===\n`);
process.exit(bad > 0 ? 1 : 0);
