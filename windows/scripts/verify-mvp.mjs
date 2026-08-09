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
  "transcribeOpenAI",
  "transcribeWhisperCli",
  "session-complete",
  "/api/v1/polish",
]) {
  if (main.includes(s)) pass(`main.js has ${s}`);
  else fail(`main.js missing ${s}`);
}

if (/FlowDictate|flowdictate/.test(main)) fail("FlowDictate leak in main.js");
else pass("no FlowDictate in main.js");

const hud = readFileSync(resolve(root, "src/hud.html"), "utf8");
if (/FlowDictate|flowdictate/.test(hud)) fail("FlowDictate leak in hud.html");
else pass("no FlowDictate in hud.html");

console.log(`\n=== ${bad === 0 ? "OK" : "FAILED"} (${bad} issues) ===\n`);
process.exit(bad > 0 ? 1 : 0);
