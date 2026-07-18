// @ts-expect-error Node APIs are used only by the Vitest resource audit.
import fs from "node:fs";
// @ts-expect-error Node APIs are used only by the Vitest resource audit.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { courses } from "../data/courses";
import { SYSTEM_AUDIO_PATHS } from "./audioText";
import audioManifest from "../../public/audio/manifest.json";
import missingAudio from "../../scripts/audio-missing.json";

const manifest = audioManifest as string[];
const manifestSet = new Set(manifest);
const processValue = globalThis as typeof globalThis & {
  process: { cwd(): string };
};
const publicRoot = path.resolve(processValue.process.cwd(), "public");

const courseAudioPaths = (course: (typeof courses)[number]) => [
  course.openingAudio,
  ...course.characters.flatMap((item) => [
    item.characterAudio,
    item.explanationAudio,
    item.exampleAudio,
    item.questionAudio,
    item.successAudio,
    item.retryAudio,
  ]),
];

const required = new Set<string>([
  ...Object.values(SYSTEM_AUDIO_PATHS),
  "/audio/lessons/intro.mp3",
  ...courses.flatMap(courseAudioPaths),
]);

const hasMp3Header = (buffer: Uint8Array) =>
  (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
  (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);

describe("本地自然语音资源", () => {
  it("manifest完整覆盖全部30天运行时音频且无重复", () => {
    expect(courses).toHaveLength(30);
    expect(manifest.length).toBeGreaterThan(0);
    expect(manifestSet.size).toBe(manifest.length);
    expect([...manifest].sort()).toEqual([...required].sort());
  });

  it("manifest中的每个MP3真实存在、大小合理且头部有效", () => {
    for (const audioPath of manifest) {
      expect(audioPath.endsWith(".mp3"), audioPath).toBe(true);
      const relativePath = audioPath.replace(/^\/+/, "");
      const filePath = path.resolve(publicRoot, relativePath);
      expect(filePath.startsWith(publicRoot), audioPath).toBe(true);
      expect(fs.existsSync(filePath), audioPath).toBe(true);
      expect(fs.statSync(filePath).isFile(), audioPath).toBe(true);
      expect(fs.statSync(filePath).size, audioPath).toBeGreaterThan(1000);
      const header = new Uint8Array(3);
      const descriptor = fs.openSync(filePath, "r");
      try {
        fs.readSync(descriptor, header, 0, header.length, 0);
      } finally {
        fs.closeSync(descriptor);
      }
      expect(hasMp3Header(header), audioPath).toBe(true);
    }
  });

  it("全部系统提示和公共教学引导音频存在", () => {
    for (const audioPath of [
      ...Object.values(SYSTEM_AUDIO_PATHS),
      "/audio/lessons/intro.mp3",
    ]) {
      expect(manifestSet.has(audioPath), audioPath).toBe(true);
    }
  });

  it("第8天和第30天仍有完整本地音频覆盖", () => {
    for (const course of [courses[7], courses[29]]) {
      expect(new Set(courseAudioPaths(course)).size).toBe(19);
      for (const audioPath of courseAudioPaths(course)) {
        expect(manifestSet.has(audioPath), audioPath).toBe(true);
      }
    }
  });

  it("相同汉字复用单字和反馈音频", () => {
    expect(manifest.filter((entry) => entry === "/audio/characters/药.mp3"))
      .toHaveLength(1);
    expect(manifest.filter((entry) => entry === "/audio/feedback/药-success.mp3"))
      .toHaveLength(1);
    expect(manifest.filter((entry) => entry === "/audio/feedback/药-retry.mp3"))
      .toHaveLength(1);
  });

  it("音频缺失报告为空数组", () => {
    expect(missingAudio).toEqual([]);
  });
});
