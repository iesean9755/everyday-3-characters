import { chromium } from "playwright-core";

const url =
  process.argv.find((value) => /^https?:\/\//.test(value)) ??
  "http://127.0.0.1:4175/everyday-3-characters/";
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto(url, { waitUntil: "networkidle" });
const result = await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready;
  const manifestUrl = new URL("manifest.webmanifest", location.href).href;
  const teachingUrl = new URL(
    "audio/lessons/day-01-1-teaching.mp3?v=20260718c",
    location.href,
  ).href;
  const manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
  const audioWarmResponse = await fetch(teachingUrl);
  if (!audioWarmResponse.ok) throw new Error("audio cache warm failed");

  await new Promise((resolve, reject) => {
    const audio = new Audio(teachingUrl);
    const timeout = window.setTimeout(
      () => reject(new Error("audio playback timeout")),
      15_000,
    );
    audio.onplaying = () => {
      window.clearTimeout(timeout);
      audio.pause();
      resolve(undefined);
    };
    audio.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("audio playback failed"));
    };
    void audio.play().catch(reject);
  });

  const cacheNames = await caches.keys();
  const audioCacheName = cacheNames.find((name) =>
    name.includes("audio-runtime-20260718c"),
  );
  const audioCache = audioCacheName ? await caches.open(audioCacheName) : null;
  const cachedTeaching = audioCache
    ? Boolean(await audioCache.match(teachingUrl))
    : false;
  const precacheNames = cacheNames.filter((name) => name.includes("precache"));
  const precachedMp3Count = (
    await Promise.all(
      precacheNames.map(async (name) => {
        const requests = await (await caches.open(name)).keys();
        return requests.filter((request) =>
          new URL(request.url).pathname.endsWith(".mp3"),
        ).length;
      }),
    )
  ).reduce((sum, count) => sum + count, 0);

  return {
    pageUrl: location.href,
    serviceWorkerScope: registration.scope,
    manifestStatus: manifestResponse.status,
    audioCacheName,
    cachedTeaching,
    precachedMp3Count,
  };
});

console.log(JSON.stringify({ ...result, consoleErrors }));
await browser.close();

if (
  result.manifestStatus !== 200 ||
  !result.cachedTeaching ||
  result.precachedMp3Count !== 0 ||
  consoleErrors.length
) {
  process.exitCode = 1;
}
