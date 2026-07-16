import { chromium } from "playwright-core";
const mode = process.argv[2] ?? "read";
const profile =
  "C:/Users/18756/Documents/Codex/2026-07-15/files-mentioned-by-the-user-c/work/qa-persistence-profile";
const context = await chromium.launchPersistentContext(profile, {
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  viewport: { width: 390, height: 780 },
});
const page = context.pages()[0] ?? (await context.newPage());
if (mode === "write") {
  await page.addInitScript(() => {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const old = JSON.parse(
      localStorage.getItem("everyday-3-characters-v1") || "{}",
    );
    localStorage.setItem(
      "everyday-3-characters-v1",
      JSON.stringify({
        ...old,
        version: 1,
        date,
        stage: "home",
        dailyBaseGoalCompleted: true,
        completedToday: true,
        todayLearnedCharacterIds: [
          "d1-1",
          "d1-2",
          "d1-3",
          "d2-1",
          "d2-2",
          "d2-3",
        ],
        todayNewCharacterCount: 6,
        todayExtraGroupCount: 1,
        totalLearnedCharacterIds: [
          "d1-1",
          "d1-2",
          "d1-3",
          "d2-1",
          "d2-2",
          "d2-3",
        ],
        learnedIds: ["d1-1", "d1-2", "d1-3", "d2-1", "d2-2", "d2-3"],
        nextCourseIndex: 2,
        currentExtraGroupProgress: 1,
        settings: {
          dailyCount: 3,
          speechRate: 0.78,
          voiceName: "",
          introPauseMs: 600,
          characterPauseMs: 900,
          autoPlay: false,
          fontScale: 1,
          optionCount: 2,
          reminderTime: "09:00",
          difficulty: 1,
          maxDailyCharacters: null,
          enabledThemes: { 防骗: true, 医院: true, 手机: true },
        },
      }),
    );
  });
}
await page.goto("http://127.0.0.1:5173");
await page.waitForTimeout(400);
const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("everyday-3-characters-v1")),
);
console.log(
  JSON.stringify({
    mode,
    count: saved.todayNewCharacterCount,
    next: saved.nextCourseIndex,
    stage: saved.stage,
    heading: await page.locator("h1").innerText(),
  }),
);
await context.close();
