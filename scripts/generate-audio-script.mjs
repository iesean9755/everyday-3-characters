import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const vite = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });
const { courses } = await vite.ssrLoadModule("/src/data/courses.ts");
await vite.close();
const audioRoot = path.join(root, "public/audio");
const existingFiles = [];
async function scan(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(full);
    else if (entry.name.toLowerCase().endsWith(".mp3"))
      existingFiles.push(
        `/audio/${path.relative(audioRoot, full).replaceAll("\\", "/")}`,
      );
  }
}
await scan(audioRoot);
const existing = new Set(existingFiles);
const rows = [];
const add = ({
  id,
  category,
  day,
  character = "",
  text,
  pause = "无",
  rate = 0.8,
  file,
}) =>
  rows.push({
    id,
    category,
    courseDay: day,
    targetCharacter: character,
    fullText: text,
    suggestedPause: pause,
    suggestedRate: rate,
    suggestedFileName: path.basename(file),
    saveDirectory: path.posix.dirname(file),
    audioPath: file,
    exists: existing.has(file),
  });

add({
  id: "system-welcome",
  category: "system",
  day: 0,
  text: "您好，今天我们认识三个字。请点一下屏幕中间的大圆按钮。",
  file: "/audio/system/welcome.mp3",
});
for (const course of courses) {
  const day = course.id;
  add({
    id: `day-${day}-opening`,
    category: "system",
    day,
    text: course.openingSpeech,
    file: course.openingAudio,
  });
  add({
    id: `day-${day}-completion`,
    category: "system",
    day,
    text: course.completionSpeech,
    file: course.completionAudio,
  });
  for (const item of course.characters) {
    const prefix = `day-${day}-${item.id.split("-").at(-1)}`;
    const explanation =
      item.speech
        .replace(new RegExp(`^这个字念${item.char}[。！!，,]?`), "")
        .replace(/[。！!]$/, "") || item.meaning;
    add({
      id: `${prefix}-teaching-combined`,
      category: "lesson-combined",
      day,
      character: item.char,
      text: `这个字念……${item.char}……${explanation}`,
      pause: "目标字前600ms；目标字后900ms",
      rate: 0.8,
      file: item.teachingAudio,
    });
    add({
      id: `${prefix}-intro`,
      category: "lesson-intro",
      day,
      character: item.char,
      text: "这个字念",
      pause: "结束后600ms",
      rate: 0.8,
      file: item.introAudio,
    });
    add({
      id: `${prefix}-character`,
      category: "character",
      day,
      character: item.char,
      text: item.char,
      pause: "结束后900ms",
      rate: 0.68,
      file: item.characterAudio,
    });
    add({
      id: `${prefix}-explanation`,
      category: "lesson-explanation",
      day,
      character: item.char,
      text: explanation,
      file: item.explanationAudio,
    });
    add({
      id: `${prefix}-example`,
      category: "lesson-example",
      day,
      character: item.char,
      text: item.example,
      file: item.exampleAudio,
    });
    add({
      id: `${prefix}-question`,
      category: "question",
      day,
      character: item.char,
      text: `请找出${item.char}字。`,
      file: item.questionAudio,
    });
    add({
      id: `${prefix}-success`,
      category: "feedback-success",
      day,
      character: item.char,
      text: `找对了，这个字念${item.char}。`,
      file: item.successAudio,
    });
    add({
      id: `${prefix}-retry`,
      category: "feedback-retry",
      day,
      character: item.char,
      text: `没关系，我们再看一次。这个字念${item.char}。`,
      file: item.retryAudio,
    });
  }
}
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const headers = [
  "id",
  "category",
  "courseDay",
  "targetCharacter",
  "fullText",
  "suggestedPause",
  "suggestedRate",
  "suggestedFileName",
  "saveDirectory",
  "audioPath",
  "exists",
];
const csv = [
  headers.map(quote).join(","),
  ...rows.map((row) => headers.map((key) => quote(row[key])).join(",")),
].join("\r\n");
await fs.writeFile(
  path.join(root, "scripts/audio-script.json"),
  `${JSON.stringify(rows, null, 2)}\n`,
  "utf8",
);
await fs.writeFile(
  path.join(root, "scripts/audio-script.csv"),
  `\uFEFF${csv}\r\n`,
  "utf8",
);
await fs.writeFile(
  path.join(audioRoot, "manifest.json"),
  `${JSON.stringify(existingFiles.sort(), null, 2)}\n`,
  "utf8",
);
console.log(
  `Generated ${rows.length} script rows; ${existingFiles.length} MP3 files currently exist.`,
);
