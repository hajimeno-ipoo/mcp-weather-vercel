import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readJson(p) {
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw);
}

const rootManifestPath = path.resolve(__dirname, "..", "manifest.json");
const publicManifestPath = path.resolve(__dirname, "..", "public", "manifest.json");

const [rootManifest, publicManifest] = await Promise.all([
  readJson(rootManifestPath),
  readJson(publicManifestPath),
]);

assert.deepEqual(
  publicManifest,
  rootManifest,
  "`public/manifest.json` が `manifest.json` と一致してないよ（どっちかが更新漏れ）"
);

const widget = rootManifest?.widgets?.["weather-widget"];
assert.ok(widget, "manifest.json に widgets.weather-widget がないよ");

assert.equal(widget.uri, "ui://widget/weather-v23.html", "widgets.weather-widget.uri が想定と違うよ");
assert.ok(
  typeof widget.csp === "string" && widget.csp.includes("connect-src https://geocoding-api.open-meteo.com https://api.open-meteo.com"),
  "widgets.weather-widget.csp の connect-src が想定と違うよ"
);
assert.ok(
  typeof widget.csp === "string" && widget.csp.includes("frame-src https://www.openstreetmap.org"),
  "widgets.weather-widget.csp の frame-src が想定と違うよ（地図iframe用）"
);

console.log("✅ manifest.json / public/manifest.json: OK");
