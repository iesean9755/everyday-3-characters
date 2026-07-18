import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
});
const [{ courses }, audioText] = await Promise.all([
  vite.ssrLoadModule("/src/data/courses.ts"),
  vite.ssrLoadModule("/src/lib/audioText.ts"),
]);
await vite.close();

const audioRoot = path.join(root, "public/audio");
const existingFiles = [];

async function scan(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(full);
    else if (entry.name.toLowerCase().endsWith(".mp3")) {
      const stat = await fs.stat(full);
      if (stat.size > 0) {
        existingFiles.push(
          `/audio/${path.relative(audioRoot, full).replaceAll("\\", "/")}`,
        );
      }
    }
  }
}

await scan(audioRoot);
const existing = new Set(existingFiles);
const rowsByPath = new Map();

function add({
  id,
  category,
  day = 0,
  character = "",
  text,
  pause = "无",
  rate = "-15%",
  file,
}) {
  const previous = rowsByPath.get(file);
  if (previous) {
    if (previous.fullText !== text) {
      throw new Error(`同一路径存在冲突文案：${file}`);
    }
    return;
  }
  rowsByPath.set(file, {
    id,
    category,
    courseDay: day,
    targetCharacter: character,
    fullText: text,
    suggestedPause: pause,
    suggestedRate: rate,
    suggestedFileName: path.posix.basename(file),
    saveDirectory: path.posix.dirname(file),
    audioPath: file,
    exists: existing.has(file),
  });
}

const baseProgress = {
  allNewCoursesCompleted: false,
  dailyBaseGoalCompleted: false,
};
const completedProgress = { ...baseProgress, dailyBaseGoalCompleted: true };

add({
  id: "system-welcome",
  category: "system",
  text: audioText.getHomeSpeech(baseProgress),
  file: audioText.SYSTEM_AUDIO_PATHS.welcome,
});
add({
  id: "system-home-completed",
  category: "system",
  text: audioText.getHomeSpeech(completedProgress),
  file: audioText.SYSTEM_AUDIO_PATHS.homeCompleted,
});
add({
  id: "completion-base",
  category: "completion",
  text: audioText.getCompletionSpeech(courses[0], completedProgress),
  file: audioText.SYSTEM_AUDIO_PATHS.baseCompleted,
});
add({
  id: "completion-review",
  category: "completion",
  text: audioText.getReviewCompletedSpeech(),
  file: audioText.SYSTEM_AUDIO_PATHS.reviewCompleted,
});
add({
  id: "completion-all-courses",
  category: "completion",
  text: audioText.getAllCoursesCompletedSpeech(),
  file: audioText.SYSTEM_AUDIO_PATHS.allCoursesCompleted,
});
add({
  id: "system-rest",
  category: "system",
  text: audioText.getRestSpeech(),
  file: audioText.SYSTEM_AUDIO_PATHS.rest,
});
add({
  id: "system-idle",
  category: "system",
  text: audioText.getIdleSpeech(),
  file: audioText.SYSTEM_AUDIO_PATHS.idle,
});
add({
  id: "lesson-intro",
  category: "intro",
  text: audioText.getTeachingParts(courses[0].characters[0]).intro,
  pause: "结束后停顿300ms",
  file: "/audio/lessons/intro.mp3",
});

for (const course of courses) {
  const day = course.id;
  add({
    id: `day-${day}-opening`,
    category: "opening",
    day,
    text: audioText.getGoalSpeech(course),
    file: course.openingAudio,
  });

  for (const item of course.characters) {
    const suffix = item.id.split("-").at(-1);
    const prefix = `day-${day}-${suffix}`;
    const parts = audioText.getTeachingParts(item);
    add({
      id: `character-${item.characterKey}`,
      category: "character",
      day,
      character: item.characterKey,
      text: parts.character,
      pause: "结束后停顿400ms",
      file: item.characterAudio,
    });
    add({
      id: `${prefix}-explanation`,
      category: "explanation",
      day,
      character: item.characterKey,
      text: parts.explanation,
      pause: "结束后停顿300ms",
      file: item.explanationAudio,
    });
    add({
      id: `${prefix}-example`,
      category: "example",
      day,
      character: item.characterKey,
      text: parts.example,
      file: item.exampleAudio,
    });
    add({
      id: `${prefix}-question`,
      category: "question",
      day,
      character: item.characterKey,
      text: audioText.getQuestionSpeech(item),
      file: item.questionAudio,
    });
    add({
      id: `success-${item.characterKey}`,
      category: "success",
      day,
      character: item.characterKey,
      text: audioText.getSuccessSpeech(item),
      file: item.successAudio,
    });
    add({
      id: `retry-${item.characterKey}`,
      category: "retry",
      day,
      character: item.characterKey,
      text: audioText.getRetrySpeech(item),
      file: item.retryAudio,
    });
  }
}

const rows = [...rowsByPath.values()];
const missing = rows.filter((row) => !row.exists);
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

await Promise.all([
  fs.writeFile(
    path.join(root, "scripts/audio-script.json"),
    `${JSON.stringify(rows, null, 2)}\n`,
    "utf8",
  ),
  fs.writeFile(
    path.join(root, "scripts/audio-script.csv"),
    `\uFEFF${csv}\r\n`,
    "utf8",
  ),
  fs.writeFile(
    path.join(root, "scripts/audio-missing.json"),
    `${JSON.stringify(missing, null, 2)}\n`,
    "utf8",
  ),
  fs.writeFile(
    path.join(audioRoot, "manifest.json"),
    `${JSON.stringify(existingFiles.sort(), null, 2)}\n`,
    "utf8",
  ),
]);

console.log(
  `Generated ${rows.length} unique script rows; ${existingFiles.length} non-empty MP3 files exist; ${missing.length} remain.`,
);
