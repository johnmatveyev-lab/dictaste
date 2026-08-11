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
  "playMp3File",
  "/api/v1/tts",
  "captureSelectionText",
  "Read selection",
  "ttsEngine",
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
if (/^0\.1\.\d+$/.test(pkg.version)) {
  pass(`package version ${pkg.version}`);
} else {
  fail(`unexpected version ${pkg.version}`);
}

if (/waitlist/i.test(main)) fail("waitlist copy still in main.js");
else pass("no waitlist copy in main.js");

if (/FlowDictate|flowdictate/.test(main)) fail("FlowDictate leak in main.js");
else pass("no FlowDictate in main.js");

const hud = readFileSync(resolve(root, "src/hud.html"), "utf8");
if (/FlowDictate|flowdictate/.test(hud)) fail("FlowDictate leak in hud.html");
else pass("no FlowDictate in hud.html");

console.log(`\n=== ${bad === 0 ? "OK" : "FAILED"} (${bad} issues) ===\n`);
process.exit(bad > 0 ? 1 : 0);
