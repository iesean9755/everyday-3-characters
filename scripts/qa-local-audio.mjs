import { chromium } from "playwright-core";

const url = process.argv.find((value) => /^https?:\/\//.test(value)) ??
  "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const errors = [];
const audioResponses = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("response", (response) => {
  if (response.url().endsWith(".mp3")) {
    audioResponses.push({ url: response.url(), status: response.status() });
  }
});

await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
const manifestCount = await page.evaluate(async () => {
  const response = await fetch("/audio/manifest.json");
  return (await response.json()).length;
});
await page.getByRole("button", { name: "听一听" }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "开始今天的学习" }).click();
await page.waitForTimeout(700);
const goalCopy = await page.getByRole("heading").innerText();
await page.getByRole("button", { name: "开始学习" }).click();
await page.waitForTimeout(700);
const teachingCopy = await page.locator(".example").innerText();
await page.getByRole("button", { name: "再听一遍" }).click();
await page.waitForTimeout(3500);

const failedAudio = audioResponses.filter((entry) => entry.status >= 400);
const result = {
  manifestCount,
  goalCopy,
  teachingCopy,
  localAudioRequests: audioResponses.length,
  failedAudio,
  errors,
};
console.log(JSON.stringify(result));
await browser.close();

if (
  manifestCount < 1 ||
  !goalCopy.startsWith("今天我们学习") ||
  !teachingCopy ||
  audioResponses.length < 1 ||
  failedAudio.length ||
  errors.length
) {
  process.exitCode = 1;
}
