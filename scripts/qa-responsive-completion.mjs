import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const results = [];
for (const width of [360, 390, 430]) {
  const page = await browser.newPage({ viewport: { width, height: 780 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    class U {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.voice = null;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: U,
      configurable: true,
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel() {},
        getVoices() {
          return [];
        },
        speak(u) {
          setTimeout(() => u.onend?.(), 5);
        },
        pending: false,
        addEventListener() {},
        removeEventListener() {},
      },
      configurable: true,
    });
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    localStorage.setItem(
      "everyday-3-characters-v1",
      JSON.stringify({
        version: 1,
        date,
        courseIndex: 0,
        stage: "complete",
        characterIndex: 2,
        reviewIndex: 0,
        answerStats: {},
        learnedIds: ["d1-1", "d1-2", "d1-3"],
        reviewIds: [],
        streak: 1,
        lastOpenDate: date,
        completedToday: true,
        completedDates: [date],
        dailyBaseGoalCompleted: true,
        todayLearnedCharacterIds: ["d1-1", "d1-2", "d1-3"],
        todayNewCharacterCount: 3,
        todayExtraGroupCount: 0,
        totalLearnedCharacterIds: ["d1-1", "d1-2", "d1-3"],
        nextCourseIndex: 1,
        currentExtraGroupProgress: 0,
        lastCompletedDate: date,
        dailyStats: {},
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
  await page.goto("http://127.0.0.1:5173");
  await page.waitForTimeout(400);
  const primary = await page
    .getByRole("button", { name: "再学3个新字" })
    .boundingBox();
  const secondary = await page
    .getByRole("button", { name: "今天到这里，返回首页" })
    .boundingBox();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  results.push({
    width,
    horizontalOverflow: dimensions.scrollWidth > dimensions.clientWidth,
    primaryVisible: primary.y + primary.height <= 780,
    secondaryVisible: secondary.y + secondary.height <= 780,
    errors,
  });
  await page.screenshot({
    path: `C:/Users/18756/Documents/Codex/2026-07-15/files-mentioned-by-the-user-c/work/completion-${width}.png`,
    fullPage: true,
  });
  await page.close();
}
console.log(JSON.stringify(results));
await browser.close();
