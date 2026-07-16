import { beforeEach, describe, expect, it } from "vitest";
import {
  findNextCourseIndex,
  freshProgress,
  loadProgress,
  migrateProgress,
  rollToToday,
  saveProgress,
} from "./storage";

describe("学习记录容错与迁移", () => {
  beforeEach(() => localStorage.clear());

  it("损坏数据会恢复成安全的新记录", () => {
    localStorage.setItem("everyday-3-characters-v1", "{坏数据");
    expect(loadProgress().version).toBe(1);
  });

  it("保存后可恢复到原学习位置", () => {
    const progress = {
      ...freshProgress(),
      stage: "quiz" as const,
      characterIndex: 2,
    };
    expect(saveProgress(progress)).toBe(true);
    expect(loadProgress()).toMatchObject({ stage: "quiz", characterIndex: 2 });
  });

  it("旧版完成记录会迁移为基础目标和总课程进度", () => {
    const fresh = freshProgress();
    const migrated = migrateProgress({
      version: 1,
      date: fresh.date,
      settings: fresh.settings,
      completedToday: true,
      learnedIds: ["d1-1", "d1-2", "d1-3"],
      courseIndex: 0,
    });
    expect(migrated.dailyBaseGoalCompleted).toBe(true);
    expect(migrated.todayNewCharacterCount).toBe(3);
    expect(migrated.totalLearnedCharacterIds).toEqual(["d1-1", "d1-2", "d1-3"]);
    expect(migrated.nextCourseIndex).toBe(1);
  });

  it("跨日只清空今日统计并保留下一课程和昨日复习", () => {
    const progress = {
      ...freshProgress(),
      date: "2026-07-15",
      nextCourseIndex: 3,
      dailyBaseGoalCompleted: true,
      todayLearnedCharacterIds: ["d1-1", "d1-2", "d1-3"],
      todayNewCharacterCount: 3,
    };
    const rolled = rollToToday(progress);
    expect(rolled.todayNewCharacterCount).toBe(0);
    expect(rolled.reviewIds).toEqual(["d1-1", "d1-2", "d1-3"]);
    expect(rolled.courseIndex).toBe(3);
    expect(rolled.dailyBaseGoalCompleted).toBe(false);
  });

  it("下一课程会跳过已经完成的组", () => {
    expect(findNextCourseIndex(["d1-1", "d1-2", "d1-3"], 0)).toBe(1);
  });
});
