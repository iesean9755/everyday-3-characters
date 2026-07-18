import { beforeEach, describe, expect, it } from "vitest";
import {
  completeCourseGroup,
  completeLongTermReview,
  findNextCourseIndex,
  freshProgress,
  getDueReviewKeys,
  hasDueReview,
  loadProgress,
  migrateProgress,
  recordCharacterAnswer,
  rollToToday,
  saveProgress,
  selectLongTermReviewKeys,
} from "./storage";
import { courses } from "../data/courses";
import { addDays, todayKey } from "./date";

describe("学习记录容错与迁移", () => {
  beforeEach(() => localStorage.clear());

  it("旧默认停顿迁移为iPhone短停顿并保留家人自定义值", () => {
    const fresh = freshProgress();
    const migratedDefaults = migrateProgress({
      ...fresh,
      settings: {
        ...fresh.settings,
        introPauseMs: 600,
        characterPauseMs: 900,
      },
    });
    expect(migratedDefaults.settings).toMatchObject({
      introPauseMs: 300,
      characterPauseMs: 400,
      explanationPauseMs: 300,
    });

    const migratedCustom = migrateProgress({
      ...fresh,
      settings: {
        ...fresh.settings,
        introPauseMs: 500,
        characterPauseMs: 700,
        explanationPauseMs: 200,
      },
    });
    expect(migratedCustom.settings).toMatchObject({
      introPauseMs: 500,
      characterPauseMs: 700,
      explanationPauseMs: 200,
    });
  });

  it("损坏数据会恢复成安全的新记录", () => {
    localStorage.setItem("everyday-3-characters-v1", "{坏数据");
    expect(loadProgress().version).toBe(3);
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
    expect(migrated.version).toBe(3);
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

  it("跨日只清空今日统计并保留下一课程和历史答题", () => {
    const today = todayKey();
    const progress = {
      ...freshProgress(),
      date: addDays(today, -1),
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
      lifetimeAnswerStats: {
        药: { correct: 1, wrong: 2, lastAnsweredDate: addDays(today, -1) },
      },
    };
    const rolled = rollToToday(progress);
    expect(rolled.todayNewCharacterCount).toBe(0);
    expect(rolled.todayAnswerStats).toEqual({});
    expect(rolled.lifetimeAnswerStats.药.wrong).toBe(2);
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

    expect(migrated.version).toBe(3);
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

  it("昨天完成后今天完成连续天数从1变2", () => {
    const progress = {
      ...freshProgress(),
      date: "2026-07-17",
      streak: 1,
      lastCompletedDate: "2026-07-16",
      completedDates: ["2026-07-16"],
    };
    expect(completeCourseGroup(progress, courses[0]).streak).toBe(2);
  });

  it("隔三天完成重置为1，同一天完成三组只增加一次", () => {
    const progress = {
      ...freshProgress(),
      date: "2026-07-17",
      streak: 6,
      lastCompletedDate: "2026-07-14",
      completedDates: ["2026-07-14"],
    };
    const first = completeCourseGroup(progress, courses[0]);
    const second = completeCourseGroup(
      { ...first, courseIndex: 1 },
      courses[1],
    );
    const third = completeCourseGroup(
      { ...second, courseIndex: 2 },
      courses[2],
    );
    expect(first.streak).toBe(1);
    expect(second.streak).toBe(1);
    expect(third.streak).toBe(1);
    expect(third.completedDates.filter((date) => date === "2026-07-17"))
      .toHaveLength(1);
  });

  it("新字会在第1、3、7天进入复习队列", () => {
    let progress = completeCourseGroup(
      { ...freshProgress(), date: "2026-07-10" },
      courses[0],
    );
    const key = courses[0].characters[0].characterKey;
    expect(progress.reviewPlan[key].dueDates).toEqual([
      "2026-07-11",
      "2026-07-13",
      "2026-07-17",
    ]);
    expect(getDueReviewKeys(progress.reviewPlan, "2026-07-11")).toContain(key);

    progress = recordCharacterAnswer(
      { ...progress, date: "2026-07-11" },
      key,
      true,
      undefined,
      "scheduled",
    );
    expect(getDueReviewKeys(progress.reviewPlan, "2026-07-12")).not.toContain(key);
    expect(getDueReviewKeys(progress.reviewPlan, "2026-07-13")).toContain(key);
    progress = recordCharacterAnswer(
      { ...progress, date: "2026-07-13" },
      key,
      true,
      undefined,
      "scheduled",
    );
    expect(getDueReviewKeys(progress.reviewPlan, "2026-07-17")).toContain(key);
  });

  it("跨日连续答对三次后标记为mastered", () => {
    const key = courses[0].characters[0].characterKey;
    let progress = completeCourseGroup(
      { ...freshProgress(), date: "2026-07-10" },
      courses[0],
    );
    for (const date of ["2026-07-11", "2026-07-13", "2026-07-17"]) {
      progress = recordCharacterAnswer(
        { ...progress, date },
        key,
        true,
        undefined,
        "scheduled",
      );
    }
    expect(progress.reviewPlan[key].correctStreak).toBe(3);
    expect(progress.reviewPlan[key].mastered).toBe(true);
  });

  it("答错后第二天再次出现且同一汉字不会重复入队", () => {
    const key = courses[0].characters[0].characterKey;
    let progress = recordCharacterAnswer(
      { ...freshProgress(), date: "2026-07-10" },
      key,
      false,
    );
    progress = recordCharacterAnswer(progress, key, false);
    expect(progress.reviewPlan[key].dueDates).toEqual(["2026-07-11"]);
    expect(getDueReviewKeys(progress.reviewPlan, "2026-07-11")).toEqual([key]);
  });

  it("未到期的长期普通练习答对不会消耗未来计划复习", () => {
    const key = courses[0].characters[0].characterKey;
    const progress = {
      ...freshProgress(),
      date: "2026-07-10",
      totalLearnedCharacterKeys: [key],
      reviewPlan: {
        [key]: {
          dueDates: ["2026-07-11", "2026-07-13", "2026-07-17"],
          completedDates: [],
          correctStreak: 0,
          wrongCount: 0,
          mastered: false,
        },
      },
    };

    expect(hasDueReview(undefined, progress.date)).toBe(false);
    expect(hasDueReview(progress.reviewPlan[key], progress.date)).toBe(false);
    const answered = recordCharacterAnswer(
      progress,
      key,
      true,
      undefined,
      "practice",
    );

    expect(answered.reviewPlan[key].completedDates).toEqual([]);
    expect(answered.reviewPlan[key].correctStreak).toBe(0);
    expect(getDueReviewKeys(answered.reviewPlan, "2026-07-11")).toContain(key);
  });

  it("真正到期的计划复习答对后推进到下一条到期日", () => {
    const key = courses[0].characters[0].characterKey;
    const progress = {
      ...freshProgress(),
      date: "2026-07-11",
      totalLearnedCharacterKeys: [key],
      reviewPlan: {
        [key]: {
          dueDates: ["2026-07-11", "2026-07-13", "2026-07-17"],
          completedDates: [],
          correctStreak: 0,
          wrongCount: 0,
          mastered: false,
        },
      },
    };

    expect(hasDueReview(progress.reviewPlan[key], progress.date)).toBe(true);
    const answered = recordCharacterAnswer(
      progress,
      key,
      true,
      undefined,
      "scheduled",
    );

    expect(answered.reviewPlan[key].completedDates).toEqual(["2026-07-11"]);
    expect(getDueReviewKeys(answered.reviewPlan, "2026-07-12")).not.toContain(key);
    expect(getDueReviewKeys(answered.reviewPlan, "2026-07-13")).toContain(key);
  });

  it("未到期的普通练习答错只安排一次明日复习并清零连续答对", () => {
    const key = courses[0].characters[0].characterKey;
    const progress = {
      ...freshProgress(),
      date: "2026-07-10",
      totalLearnedCharacterKeys: [key],
      reviewPlan: {
        [key]: {
          dueDates: ["2026-07-13", "2026-07-17"],
          completedDates: [],
          correctStreak: 2,
          wrongCount: 0,
          mastered: false,
        },
      },
    };

    const first = recordCharacterAnswer(
      progress,
      key,
      false,
      undefined,
      "practice",
    );
    const second = recordCharacterAnswer(
      first,
      key,
      false,
      undefined,
      "practice",
    );

    expect(second.reviewPlan[key].completedDates).toEqual([]);
    expect(second.reviewPlan[key].correctStreak).toBe(0);
    expect(
      second.reviewPlan[key].dueDates.filter((date) => date === "2026-07-11"),
    ).toHaveLength(1);
  });

  it("长期复习混合到期、易错和随机字时只有到期字推进计划", () => {
    const [dueKey, difficultKey, randomKey] = courses[0].characters.map(
      (item) => item.characterKey,
    );
    let progress = {
      ...freshProgress(),
      date: "2026-07-11",
      totalLearnedCharacterKeys: [dueKey, difficultKey, randomKey],
      reviewPlan: Object.fromEntries(
        [dueKey, difficultKey, randomKey].map((key, index) => [
          key,
          {
            dueDates: [index === 0 ? "2026-07-11" : "2026-07-13"],
            completedDates: [] as string[],
            correctStreak: 0,
            wrongCount: index === 1 ? 4 : 0,
            mastered: false,
          },
        ]),
      ),
    };

    for (const key of [dueKey, difficultKey, randomKey]) {
      const mode = hasDueReview(progress.reviewPlan[key], progress.date)
        ? "scheduled"
        : "practice";
      progress = recordCharacterAnswer(progress, key, true, undefined, mode);
    }

    expect(progress.reviewPlan[dueKey].completedDates).toEqual(["2026-07-11"]);
    expect(progress.reviewPlan[difficultKey].completedDates).toEqual([]);
    expect(progress.reviewPlan[randomKey].completedDates).toEqual([]);
    expect(Object.keys(progress.todayAnswerStats)).toEqual(
      expect.arrayContaining([dueKey, difficultKey, randomKey]),
    );
  });

  it("同一天到期超过三个字时只返回三个且全部去重", () => {
    const plan = Object.fromEntries(
      ["药", "钱", "骗", "早"].map((key) => [
        key,
        {
          dueDates: ["2026-07-11", "2026-07-11"],
          completedDates: [],
          correctStreak: 0,
          wrongCount: 0,
          mastered: false,
        },
      ]),
    );
    const queue = getDueReviewKeys(plan, "2026-07-11");
    expect(queue).toHaveLength(3);
    expect(new Set(queue).size).toBe(3);
  });

  it("version 2数据会升级并把条目答题记录合并到汉字历史", () => {
    const fresh = freshProgress();
    const migrated = migrateProgress({
      version: 2,
      date: fresh.date,
      answerStats: {
        "d1-1": { correct: 1, wrong: 2 },
        "d30-1": { correct: 3, wrong: 1 },
      },
      totalLearnedCharacterIds: ["d1-1", "d30-1"],
      todayLearnedCharacterIds: ["d1-1"],
    });
    const key = courses[0].characters[0].characterKey;
    expect(migrated.version).toBe(3);
    expect(migrated.lifetimeAnswerStats[key]).toMatchObject({
      correct: 4,
      wrong: 3,
      lastAnsweredDate: fresh.date,
    });
    expect(migrated.answerStats["d1-1"]).toEqual({ correct: 1, wrong: 2 });
  });

  it("学完全部新字课程后指针保持courses.length并标记完成", () => {
    const newCourses = courses.filter((course) => course.courseType === "new");
    const lastCourse = newCourses.at(-1)!;
    const previousIds = newCourses
      .slice(0, -1)
      .flatMap((course) => course.characters.map((item) => item.id));
    const progress = completeCourseGroup(
      {
        ...freshProgress(),
        courseIndex: lastCourse.id - 1,
        totalLearnedCharacterIds: previousIds,
        learnedIds: previousIds,
      },
      lastCourse,
    );

    expect(progress.nextCourseIndex).toBe(courses.length);
    expect(progress.allNewCoursesCompleted).toBe(true);
    expect(
      findNextCourseIndex(
        newCourses.flatMap((course) =>
          course.characters.map((item) => item.id),
        ),
      ),
    ).toBe(courses.length);
  });

  it("全部新字完成后跨日进入首页而不是重复最后一课", () => {
    const today = todayKey();
    const lastNewCourse = courses.filter(
      (course) => course.courseType === "new",
    ).at(-1)!;
    const key = lastNewCourse.characters[0].characterKey;
    const rolled = rollToToday({
      ...freshProgress(),
      date: addDays(today, -1),
      stage: "complete",
      courseIndex: lastNewCourse.id - 1,
      nextCourseIndex: courses.length,
      allNewCoursesCompleted: true,
      totalLearnedCharacterKeys: [key],
    });

    expect(rolled.stage).toBe("home");
    expect(rolled.nextCourseIndex).toBe(courses.length);
    expect(rolled.allNewCoursesCompleted).toBe(true);
  });

  it("长期复习不增加新字和总认识字数", () => {
    const keys = courses[0].characters.map((item) => item.characterKey);
    const progress = {
      ...freshProgress(),
      allNewCoursesCompleted: true,
      nextCourseIndex: courses.length,
      totalLearnedCharacterKeys: keys,
    };
    const completed = completeLongTermReview(progress, keys);

    expect(completed.todayNewCharacterKeys).toEqual([]);
    expect(completed.todayNewCharacterCount).toBe(0);
    expect(completed.totalLearnedCharacterKeys).toEqual(keys);
    expect(completed.todayPracticedCharacterKeys).toEqual(keys);
  });

  it("长期复习完成后仍完成每日目标并增加连续天数", () => {
    const key = courses[0].characters[0].characterKey;
    const completed = completeLongTermReview(
      {
        ...freshProgress(),
        date: "2026-07-17",
        streak: 1,
        lastCompletedDate: "2026-07-16",
        completedDates: ["2026-07-16"],
        allNewCoursesCompleted: true,
        nextCourseIndex: courses.length,
        totalLearnedCharacterKeys: [key],
      },
      [key],
    );

    expect(completed.dailyBaseGoalCompleted).toBe(true);
    expect(completed.completedToday).toBe(true);
    expect(completed.streak).toBe(2);
    expect(completed.completedDates).toContain("2026-07-17");
  });

  it("长期复习支持1个字、空记录和无到期队列回退", () => {
    const keys = courses[0].characters.map((item) => item.characterKey);
    expect(
      selectLongTermReviewKeys(
        { ...freshProgress(), totalLearnedCharacterKeys: [keys[0]] },
      ),
    ).toEqual([keys[0]]);
    expect(selectLongTermReviewKeys(freshProgress())).toEqual([]);
    const fallback = selectLongTermReviewKeys(
      { ...freshProgress(), totalLearnedCharacterKeys: keys },
      "2026-07-17",
      3,
      () => 0.5,
    );
    expect(new Set(fallback)).toEqual(new Set(keys));
  });

  it("长期复习优先选择到期字，再选择错误率高的字", () => {
    const [dueKey, hardKey, otherKey] = courses[1].characters.map(
      (item) => item.characterKey,
    );
    const progress = {
      ...freshProgress(),
      date: "2026-07-17",
      totalLearnedCharacterKeys: [dueKey, hardKey, otherKey],
      reviewPlan: {
        [dueKey]: {
          dueDates: ["2026-07-17"],
          completedDates: [],
          correctStreak: 0,
          wrongCount: 0,
          mastered: false,
        },
      },
      lifetimeAnswerStats: {
        [hardKey]: {
          correct: 0,
          wrong: 4,
          lastAnsweredDate: "2026-07-16",
        },
        [otherKey]: {
          correct: 4,
          wrong: 1,
          lastAnsweredDate: "2026-07-15",
        },
      },
    };
    const selected = selectLongTermReviewKeys(
      progress,
      progress.date,
      3,
      () => 0.5,
    );
    expect(selected[0]).toBe(dueKey);
    expect(selected[1]).toBe(hardKey);
  });

  it("清空全部记录会恢复第一课和未完成状态", () => {
    const restored = freshProgress();
    expect(restored.nextCourseIndex).toBe(0);
    expect(restored.courseIndex).toBe(0);
    expect(restored.allNewCoursesCompleted).toBe(false);
    expect(restored.totalLearnedCharacterKeys).toEqual([]);
  });
});
