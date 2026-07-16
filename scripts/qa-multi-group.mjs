import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
page.setDefaultTimeout(6000);
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
await page.addInitScript(() => {
  if (!sessionStorage.getItem("qa-started")) {
    localStorage.clear();
    sessionStorage.setItem("qa-started", "1");
  }
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
  const voices = [
    {
      name: "Microsoft Xiaoxiao Online (Natural)",
      lang: "zh-CN",
      localService: false,
    },
  ];
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    value: U,
    configurable: true,
  });
  Object.defineProperty(window, "speechSynthesis", {
    value: {
      cancel() {},
      getVoices() {
        return voices;
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
});
await page.goto("http://127.0.0.1:5173");

const state = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("everyday-3-characters-v1")),
  );
const pause = (ms = 720) => page.waitForTimeout(ms);
async function click(name) {
  await page.getByRole("button", { name }).click();
  await pause();
}
async function completeGroup() {
  await click(/开始学习|先复习昨天/);
  const group = [];
  for (let index = 0; index < 3; index++) {
    const character = (
      await page.locator(".character-card strong").innerText()
    ).trim();
    group.push(character);
    await click("我看清了");
    await page.getByRole("button", { name: `选择${character}字` }).click();
    await pause(1150);
  }
  for (const character of group) {
    await page.getByRole("button", { name: `选择${character}字` }).click();
    await pause(1150);
  }
  await page.getByRole("heading", { name: "这3个字学会了" }).waitFor();
  return group;
}
async function longPressFamily() {
  await pause(750);
  const entry = page.locator(".family-entry");
  const box = await entry.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await pause(3100);
  await page.mouse.up();
  await page.getByRole("heading", { name: "家人设置" }).waitFor();
}
const results = {};
await click("开始今天的学习");
const first = await completeGroup();
let saved = await state();
results.base = {
  count: saved.todayNewCharacterCount,
  base: saved.dailyBaseGoalCompleted,
  streak: saved.streak,
  next: saved.nextCourseIndex,
};

await click("再学3个新字");
const second = await completeGroup();
saved = await state();
results.second = {
  count: saved.todayNewCharacterCount,
  extra: saved.todayExtraGroupCount,
  newCharacters: second.filter((char) => !first.includes(char)),
};

await click("今天到这里，返回首页");
results.home = {
  url: page.url(),
  heading: await page.locator("h1").innerText(),
  text: (await page.locator("main").innerText()).includes(
    "今天已经认识 6 个字",
  ),
};
await click("继续学3个");
const thirdFirst = (await page.locator(".scene-art").count()) > 0;
const courseBeforeRefresh = (await state()).courseIndex;
await page.reload();
await pause(500);
results.refresh = {
  stage: (await state()).stage,
  courseIndex: (await state()).courseIndex,
  sameCourse: (await state()).courseIndex === courseBeforeRefresh,
};
const third = await completeGroup();
saved = await state();
results.third = {
  count: saved.todayNewCharacterCount,
  extra: saved.todayExtraGroupCount,
  newCharacters: third.filter(
    (char) => !first.includes(char) && !second.includes(char),
  ),
  thirdFirst,
};

await click("再学3个新字");
results.rest = {
  shown: await page.getByRole("heading", { name: "今天学了不少" }).isVisible(),
  stage: (await state()).stage,
};
await click("今天到这里");
const beforeReview = await state();
await click("复习今天学过的字");
const learnedCharacters = [...first, ...second, ...third];
for (const character of learnedCharacters) {
  await page.getByRole("button", { name: `选择${character}字` }).click();
  await pause(1000);
}
const afterReview = await state();
results.review = {
  returnedHome: afterReview.stage === "home",
  sameNext: afterReview.nextCourseIndex === beforeReview.nextCourseIndex,
  sameCount:
    afterReview.todayNewCharacterCount === beforeReview.todayNewCharacterCount,
};

await longPressFamily();
const beforeReplay = await state();
await click("重新体验今天课程");
const afterReplay = await state();
results.replay = {
  stage: afterReplay.stage,
  sameTotal:
    afterReplay.totalLearnedCharacterIds.length ===
    beforeReplay.totalLearnedCharacterIds.length,
  sameNext: afterReplay.nextCourseIndex === beforeReplay.nextCourseIndex,
};

await longPressFamily();
page.once("dialog", (dialog) => dialog.accept());
await click("清除今日学习记录");
const afterClear = await state();
results.clearToday = {
  count: afterClear.todayNewCharacterCount,
  base: afterClear.dailyBaseGoalCompleted,
  settingsKept: afterClear.settings.voiceName.includes("Xiaoxiao"),
};

await longPressFamily();
await click("跳到下一组课程");
results.skip = {
  stage: (await state()).stage,
  courseIndex: (await state()).courseIndex,
};

await longPressFamily();
await page.getByLabel("每天最多学习量").selectOption("6");
page.once("dialog", (dialog) => dialog.accept());
await click("恢复全部课程");
const restored = await state();
results.restore = {
  total: restored.totalLearnedCharacterIds.length,
  max: restored.settings.maxDailyCharacters,
  stage: restored.stage,
};
results.consoleErrors = consoleErrors;
console.log(JSON.stringify(results));
await browser.close();
