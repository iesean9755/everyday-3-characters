import { describe, expect, it } from "vitest";
import { courses } from "../data/courses";
import { SYSTEM_AUDIO_PATHS } from "./audioText";
import audioManifest from "../../public/audio/manifest.json";

const manifest = audioManifest as string[];
const manifestSet = new Set(manifest);

describe("本地自然语音资源", () => {
  it("manifest非空、无重复且只列出MP3", () => {
    expect(manifest.length).toBeGreaterThan(0);
    expect(new Set(manifest).size).toBe(manifest.length);
    for (const audioPath of manifest) {
      expect(audioPath.endsWith(".mp3")).toBe(true);
    }
  });

  it("全部系统提示和前7天分段教学音频已生成", () => {
    const required = new Set<string>([
      ...Object.values(SYSTEM_AUDIO_PATHS),
      "/audio/lessons/intro.mp3",
    ]);
    for (const course of courses.slice(0, 7)) {
      required.add(course.openingAudio);
      for (const item of course.characters) {
        required.add(item.characterAudio);
        required.add(item.explanationAudio);
        required.add(item.questionAudio);
        required.add(item.successAudio);
        required.add(item.retryAudio);
      }
    }
    for (const audioPath of required) {
      expect(manifestSet.has(audioPath), audioPath).toBe(true);
    }
  });

  it("相同汉字只生成一份单字音频", () => {
    expect(manifest.filter((entry) => entry === "/audio/characters/药.mp3"))
      .toHaveLength(1);
  });
});
