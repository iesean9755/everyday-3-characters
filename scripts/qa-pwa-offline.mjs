import { chromium } from "playwright-core";

const url = process.argv.find((value) => /^https?:\/\//.test(value)) ??
  "http://127.0.0.1:4174";
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker 不可用");
  await navigator.serviceWorker.ready;
});
await context.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
const visibleText = (await page.locator("body").innerText()).trim();
console.log(JSON.stringify({ offlineReloaded: visibleText.length > 0, errors }));
await browser.close();
