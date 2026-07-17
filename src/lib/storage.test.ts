import { beforeEach, describe, expect, it } from "vitest";
import {
  completeCourseGroup,
  findNextCourseIndex,
  freshProgress,
  loadProgress,
  migrateProgress,
  rollToToday,
  saveProgress,
} from "./storage";
import { courses } from "../data/courses";

describe("学习记录容错与迁移", () => {
  beforeEach(() => localStorage.clear());

  it("损坏数据会恢复成安全的新记录", () => {
    localStorage.setItem("everyday-3-characters-v1", "{坏数据");
    expect(loadProgress().version).toBe(2);
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
    expect(migrated.version).toBe(2);
    expect(migrated.todayNewCharacterCount).toBe(3);
    const firstCourseKeys = courses[0].characters.map(
      (item) => item.characterKey,
    );
    expect(migrated.todayNewCharacterKeys).toEqual(firstCourseKeys);
    expect(migrated.todayPracticedCharacterKeys).toEqual(firstCourseKeys);
    expect(migrated.totalLearnedCharacterIds).toEqual(["d1-1", "d1-2", "d1-3"]);
    expect(migrated.totalLearnedCharacterKeys).toEqual(firstCourseKeys);
    expect(migrated.nextCourseIndex).toBe(1);
  });

  it("跨日只清空今日统计并保留下一课程和昨日复习", () => {
    const progress = {
      ...freshProgress(),
      date: "2026-07-15",
      nextCourseIndex: 3,
      dailyBaseGoalCompleted: true,
      todayLearnedCharacterIds: ["d1-1", "d1-2", "d1-3"],
      todayNewCharacterKeys: courses[0].characters.map(
        (item) => item.characterKey,
      ),
      todayPracticedCharacterKeys: courses[0].characters.map(
        (item) => item.characterKey,
      ),
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

  it("同一个停字出现在两个课程时只统计为一个不同汉字", () => {
    const stopCourses = courses.filter((course) =>
      course.characters.some((item) => item.characterKey === "停"),
    );
    expect(stopCourses.length).toBeGreaterThanOrEqual(2);

    let progress = freshProgress();
    progress = completeCourseGroup(
      { ...progress, courseIndex: stopCourses[0].id - 1 },
      stopCourses[0],
    );
    progress = completeCourseGroup(
      { ...progress, courseIndex: stopCourses[1].id - 1 },
      stopCourses[1],
    );

    expect(progress.totalLearnedCharacterKeys.filter((key) => key === "停"))
      .toHaveLength(1);
  });

  it("轻量复习的药钱险只增加练习数，不增加新字数", () => {
    const reviewCourse = courses.find(
      (course) => course.name === "轻量复习",
    )!;
    const progress = completeCourseGroup(freshProgress(), reviewCourse);

    expect(reviewCourse.courseType).toBe("review");
    expect(progress.todayPracticedCharacterKeys).toEqual(["药", "钱", "险"]);
    expect(progress.todayNewCharacterKeys).toEqual([]);
    expect(progress.totalLearnedCharacterKeys).toEqual([]);
    expect(progress.todayNewCharacterCount).toBe(0);
  });

  it("完成复习课程仍会完成当天基础任务", () => {
    const reviewCourse = courses.find(
      (course) => course.courseType === "review",
    )!;
    const progress = completeCourseGroup(freshProgress(), reviewCourse);

    expect(progress.dailyBaseGoalCompleted).toBe(true);
    expect(progress.completedToday).toBe(true);
    expect(progress.completedDates).toContain(progress.date);
  });

  it("version 1重复条目ID会迁移成去重的characterKey并保留旧ID", () => {
    const stopIds = courses
      .flatMap((course) => course.characters)
      .filter((item) => item.characterKey === "停")
      .map((item) => item.id);
    const fresh = freshProgress();
    const migrated = migrateProgress({
      version: 1,
      date: fresh.date,
      totalLearnedCharacterIds: stopIds,
      learnedIds: stopIds,
      todayLearnedCharacterIds: stopIds,
    });

    expect(migrated.version).toBe(2);
    expect(migrated.totalLearnedCharacterIds).toEqual(stopIds);
    expect(migrated.totalLearnedCharacterKeys).toEqual(["停"]);
    expect(migrated.todayPracticedCharacterKeys).toEqual(["停"]);
  });

  it("刷新后新字数量和练习数量保持正确", () => {
    const completed = completeCourseGroup(freshProgress(), courses[0]);
    saveProgress(completed);

    const loaded = loadProgress();
    expect(loaded.todayNewCharacterKeys).toEqual(
      completed.todayNewCharacterKeys,
    );
    expect(loaded.todayPracticedCharacterKeys).toEqual(
      completed.todayPracticedCharacterKeys,
    );
    expect(loaded.todayNewCharacterCount).toBe(3);
  });

  it("继续学习下一组时会合并统计而不是覆盖", () => {
    const first = completeCourseGroup(freshProgress(), courses[0]);
    const second = completeCourseGroup(
      { ...first, courseIndex: 1 },
      courses[1],
    );

    expect(second.todayNewCharacterKeys).toEqual([
      ...first.todayNewCharacterKeys,
      ...courses[1].characters.map((item) => item.characterKey),
    ]);
    expect(second.todayPracticedCharacterKeys).toHaveLength(6);
    expect(second.todayLearnedCharacterIds).toHaveLength(6);
    expect(second.todayExtraGroupCount).toBe(1);
  });
});
