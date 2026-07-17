import { describe, expect, it } from "vitest";
import { courses } from "../data/courses";
import { freshProgress } from "./storage";
import {
  getAllCoursesCompletedSpeech,
  getCompletionSpeech,
  getGoalSpeech,
  getHomeSpeech,
  getQuestionSpeech,
  getTeachingParts,
} from "./audioText";

describe("唯一语音文案来源", () => {
  it("基础目标和全部课程完成使用规定文案", () => {
    const progress = freshProgress();
    expect(getCompletionSpeech(courses[0], progress)).toBe(
      "今天的三个字已经认识了。您可以今天学到这里，也可以再学三个新字。",
    );
    expect(
      getHomeSpeech({ ...progress, allNewCoursesCompleted: true }),
    ).toBe(getAllCoursesCompletedSpeech());
    expect(getAllCoursesCompletedSpeech()).toBe(
      "新字课程已经全部学完。以后每天复习几个字，记得更牢。",
    );
  });

  it("课程开场、教学分段和题目均由统一函数生成", () => {
    const course = courses[15];
    const item = course.characters[0];
    expect(getGoalSpeech(course)).toContain(course.goal);
    expect(getTeachingParts(item)).toEqual({
      intro: "这个字念",
      character: "件",
      explanation: "快递件的件",
      example: item.example,
    });
    expect(item.example.length).toBeGreaterThan(0);
    expect(getQuestionSpeech(item)).toBe("请找出件字。");
  });
});
