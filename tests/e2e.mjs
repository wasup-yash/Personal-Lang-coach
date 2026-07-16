import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = process.cwd();
const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["scripts/serve.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore"
});
await waitForServer(url);
mkdirSync("tmp", { recursive: true });

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) {
  launchOptions.executablePath = process.env.CHROME_PATH;
}
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(url);
  await expectText(page, "Personal Lang Coach");
  assert.equal(await page.locator("#analyze").isEnabled(), false);
  assert.equal(await page.locator("#model-consent-row").isVisible(), false);
  assert.equal(await page.locator("#detailed-feedback").isDisabled(), true);
  await page.locator("#language").selectOption("hindi");
  assert.match(await page.locator("#transcript").getAttribute("placeholder"), /हिंदी/);
  await page.locator("#language").selectOption("english");

  await page.locator("#audio-file").setInputFiles({
    name: "assessment-sample.wav",
    mimeType: "audio/wav",
    buffer: makeWav(35)
  });
  await page.locator("#transcript").fill("The learner reads a short English paragraph with steady pacing and clear consonants.");
  await page.locator("#consent").check();
  await page.locator("#analyze").click();
  await page.waitForFunction(() => document.querySelector("#score")?.textContent !== "--");

  const score = Number(await page.locator("#score").textContent());
  assert.ok(score >= 50, `Expected a usable score, received ${score}`);
  assert.ok(await page.locator(".word").count() > 5);
  await page.screenshot({ path: "tmp/browser-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "tmp/browser-mobile.png", fullPage: true });
  console.log(`E2E passed at ${url} with score ${score}.`);
} finally {
  await browser.close();
  app.kill();
}

async function expectText(page, text) {
  await page.waitForFunction((value) => document.body.textContent.includes(value), text);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Development server did not start.");
}

function makeWav(durationSeconds) {
  const sampleRate = 16000;
  const samples = Math.floor(durationSeconds * sampleRate);
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples; i += 1) {
    const time = i / sampleRate;
    const paused = (time > 11 && time < 12.3) || (time > 24 && time < 25.2);
    const envelope = paused ? 0 : 0.22 + 0.08 * Math.sin(2 * Math.PI * 3.1 * time);
    const sample = Math.sin(2 * Math.PI * 180 * time) * envelope +
      Math.sin(2 * Math.PI * 540 * time) * envelope * 0.35;
    buffer.writeInt16LE(Math.max(-1, Math.min(1, sample)) * 32767, 44 + i * 2);
  }

  return buffer;
}
