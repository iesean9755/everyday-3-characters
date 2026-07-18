import { chromium } from "playwright-core";
import { createServer } from "vite";

const url = process.argv.find((value) => /^https?:\/\//.test(value)) ??
  "http://127.0.0.1:5173";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
const [{ courses }, { SYSTEM_AUDIO_PATHS }] = await Promise.all([
  vite.ssrLoadModule("/src/data/courses.ts"),
  vite.ssrLoadModule("/src/lib/audioText.ts"),
]);
await vite.close();

const courseAudioPaths = (course) => [
  course.openingAudio,
  ...course.characters.flatMap((item) => [
    item.teachingAudio,
    item.characterAudio,
    item.explanationAudio,
    item.exampleAudio,
    item.questionAudio,
    item.successAudio,
    item.retryAudio,
  ]),
];
const groups = {
  system: [...Object.values(SYSTEM_AUDIO_PATHS), "/audio/lessons/intro.mp3"],
  day1: courseAudioPaths(courses[0]),
  day8: courseAudioPaths(courses[7]),
  day29: courseAudioPaths(courses[28]),
  day30: courseAudioPaths(courses[29]),
};

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto(url, { waitUntil: "networkidle" });
const manifestCount = await page.evaluate(async () => {
  const response = await fetch("/audio/manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
  return (await response.json()).length;
});

const results = {};
for (const [name, paths] of Object.entries(groups)) {
  const uniquePaths = [...new Set(paths)];
  const checks = await page.evaluate(async (audioPaths) => {
    const validHeader = (bytes) =>
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    const loadMetadata = (audioPath) =>
      new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = "metadata";
        const finish = (loaded, detail = "") => {
          clearTimeout(timer);
          audio.removeAttribute("src");
          audio.load();
          resolve({ loaded, detail });
        };
        const timer = window.setTimeout(
          () => finish(false, "metadata-timeout"),
          8000,
        );
        audio.onloadedmetadata = () =>
          finish(
            Number.isFinite(audio.duration) && audio.duration > 0,
            `duration=${audio.duration}`,
          );
        audio.onerror = () => finish(false, "audio-decode-error");
        audio.src = `${audioPath}?qa=${Date.now()}`;
        audio.load();
      });

    return Promise.all(
      audioPaths.map(async (audioPath) => {
        try {
          const response = await fetch(`${audioPath}?qa-fetch=${Date.now()}`, {
            cache: "no-store",
          });
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer.slice(0, 3));
          const metadata = await loadMetadata(audioPath);
          const ok =
            response.status === 200 &&
            buffer.byteLength > 1000 &&
            validHeader(bytes) &&
            metadata.loaded;
          return {
            audioPath,
            ok,
            status: response.status,
            bytes: buffer.byteLength,
            header: [...bytes],
            metadata: metadata.detail,
          };
        } catch (error) {
          return { audioPath, ok: false, error: String(error) };
        }
      }),
    );
  }, uniquePaths);
  results[name] = {
    checked: checks.length,
    failed: checks.filter((check) => !check.ok),
  };
}

const failed = Object.values(results).flatMap((group) => group.failed);
console.log(JSON.stringify({ manifestCount, groups: results, consoleErrors }));
await browser.close();

if (manifestCount !== 656 || failed.length || consoleErrors.length) {
  process.exitCode = 1;
}
