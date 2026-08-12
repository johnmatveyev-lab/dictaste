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
if (/^0\.1\.\d+$/.test(pkg.version)) {
  pass(`package version ${pkg.version}`);
} else {
  fail(`unexpected version ${pkg.version}`);
}

if (/waitlist/i.test(main)) fail("waitlist copy still in main.js");
else pass("no waitlist copy in main.js");

if (/FlowDictate|flowdictate/.test(main)) fail("FlowDictate leak in main.js");
else pass("no FlowDictate in main.js");

if (/FlowDictate|flowdictate/.test(hud)) fail("FlowDictate leak in hud.html");
else pass("no FlowDictate in hud.html");

console.log(`\n=== ${bad === 0 ? "OK" : "FAILED"} (${bad} issues) ===\n`);
process.exit(bad > 0 ? 1 : 0);
