import { courses } from "../data/courses";
import type {
  CharacterAnswerStat,
  Course,
  Progress,
  ReviewPlanEntry,
  Settings,
} from "../types";
import {
  addDays,
  calculateNextStreak,
  isDue,
  todayKey,
} from "./date";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const KEY = "everyday-3-characters-v1";

export const defaultSettings: Settings = {
  dailyCount: 3,
  speechRate: 0.78,
  voiceName: "",
  introPauseMs: 600,
  characterPauseMs: 900,
  autoPlay: true,
  fontScale: 1,
  optionCount: 2,
  reminderTime: "09:00",
  difficulty: 1,
  maxDailyCharacters: null,
  enabledThemes: { 防骗: true, 医院: true, 手机: true },
};

export const unique = <T,>(items: T[]) => [...new Set(items)];

const itemById = new Map(
  courses.flatMap((course) =>
    course.characters.map((item) => [item.id, item] as const),
  ),
);
const firstItemIdByCharacterKey = new Map<string, string>();
for (const item of itemById.values()) {
  if (!firstItemIdByCharacterKey.has(item.characterKey))
    firstItemIdByCharacterKey.set(item.characterKey, item.id);
}
const newCourseItemIds = new Set(
  courses
    .filter((course) => course.courseType === "new")
    .flatMap((course) => course.characters.map((item) => item.id)),
);

export function idsToCharacterKeys(ids: string[]): string[] {
  return unique(
    ids
      .map((id) => itemById.get(id)?.characterKey)
      .filter((key): key is string => Boolean(key)),
  );
}

function newCourseIdsToCharacterKeys(ids: string[]): string[] {
  return idsToCharacterKeys(ids.filter((id) => newCourseItemIds.has(id)));
}

const emptyReviewPlan = (): ReviewPlanEntry => ({
  dueDates: [],
  completedDates: [],
  correctStreak: 0,
  wrongCount: 0,
  mastered: false,
});

const normalizeAnswerStats = (
  value: Record<string, Partial<CharacterAnswerStat>> | undefined,
  fallbackDate: string,
): Record<string, CharacterAnswerStat> =>
  Object.fromEntries(
    Object.entries(value ?? {}).map(([key, stat]) => [
      itemById.get(key)?.characterKey ?? key,
      {
        correct: Number(stat.correct ?? 0),
        wrong: Number(stat.wrong ?? 0),
        lastAnsweredDate: stat.lastAnsweredDate ?? fallbackDate,
      },
    ]),
  );

function legacyAnswerStatsToCharacterKeys(
  value: Progress["answerStats"] | undefined,
  fallbackDate: string,
): Record<string, CharacterAnswerStat> {
  const result: Record<string, CharacterAnswerStat> = {};
  for (const [id, stat] of Object.entries(value ?? {})) {
    const key = itemById.get(id)?.characterKey ?? id;
    const previous = result[key] ?? {
      correct: 0,
      wrong: 0,
      lastAnsweredDate: fallbackDate,
    };
    result[key] = {
      correct: previous.correct + stat.correct,
      wrong: previous.wrong + stat.wrong,
      lastAnsweredDate: fallbackDate,
    };
  }
  return result;
}

export function getDueReviewKeys(
  reviewPlan: Progress["reviewPlan"],
  today: string,
  limit = 3,
): string[] {
  const firstOutstanding = (entry: ReviewPlanEntry) =>
    [...entry.dueDates].sort()[entry.completedDates.length] ?? "9999-12-31";
  return Object.entries(reviewPlan)
    .filter(([, entry]) => isDue(firstOutstanding(entry), today))
    .sort(
      (a, b) =>
        firstOutstanding(a[1]).localeCompare(firstOutstanding(b[1])) ||
        b[1].wrongCount - a[1].wrongCount,
    )
    .map(([key]) => key)
    .slice(0, limit);
}

export function findNextCourseIndex(learnedIds: string[], start = 0): number {
  const learned = new Set(learnedIds);
  for (let offset = 0; offset < courses.length; offset += 1) {
    const index = (Math.max(0, start) + offset) % courses.length;
    if (courses[index].characters.some((item) => !learned.has(item.id)))
      return index;
  }
  return courses.length;
}

export const freshProgress = (): Progress => {
  const date = todayKey();
  return {
    version: 3,
    updatedAt: Date.now(),
    date,
    courseIndex: 0,
    stage: "welcome",
    characterIndex: 0,
    reviewIndex: 0,
    answerStats: {},
    todayAnswerStats: {},
    lifetimeAnswerStats: {},
    reviewPlan: {},
    reviewQueue: [],
    learnedIds: [],
    reviewIds: [],
    streak: 0,
    lastOpenDate: date,
    completedToday: false,
    completedDates: [],
    dailyBaseGoalCompleted: false,
    todayLearnedCharacterIds: [],
    todayNewCharacterKeys: [],
    todayPracticedCharacterKeys: [],
    todayNewCharacterCount: 0,
    todayExtraGroupCount: 0,
    totalLearnedCharacterIds: [],
    totalLearnedCharacterKeys: [],
    nextCourseIndex: 0,
    currentExtraGroupProgress: 0,
    lastCompletedDate: "",
    dailyStats: {},
    settings: { ...defaultSettings },
  };
};

const valid = (
  value: unknown,
): value is Record<string, unknown> & { version: 1 | 2 | 3; date: string } =>
  !!value &&
  typeof value === "object" &&
  ((value as { version?: number }).version === 1 ||
    (value as { version?: number }).version === 2 ||
    (value as { version?: number }).version === 3) &&
  typeof (value as { date?: unknown }).date === "string";

/** 将旧版记录补齐为新版结构，不删除任何长期学习数据。 */
export function migrateProgress(value: unknown): Progress {
  const fresh = freshProgress();
  if (!valid(value)) return fresh;
  const old = value as unknown as Partial<Omit<Progress, "version">> & {
    version: 1 | 2 | 3;
  };
  const settings = { ...defaultSettings, ...(old.settings ?? {}) };
  const total = unique(old.totalLearnedCharacterIds ?? old.learnedIds ?? []);
  const oldCourseIndex = Math.max(
    0,
    Math.min(old.courseIndex ?? 0, courses.length - 1),
  );
  const inferredToday =
    old.todayLearnedCharacterIds ??
    (old.completedToday
      ? courses[oldCourseIndex].characters.map((item) => item.id)
      : []);
  const todayIds = unique(inferredToday);
  const totalKeys = unique(
    old.totalLearnedCharacterKeys ?? idsToCharacterKeys(total),
  );
  const todayPracticedKeys = unique(
    old.todayPracticedCharacterKeys ?? idsToCharacterKeys(todayIds),
  );
  const todayNewKeys = unique(
    old.todayNewCharacterKeys ?? newCourseIdsToCharacterKeys(todayIds),
  );
  const inferredNext =
    old.nextCourseIndex ?? findNextCourseIndex(total, oldCourseIndex);
  const dailyStats = Object.fromEntries(
    Object.entries(old.dailyStats ?? {}).map(([date, stat]) => {
      const learnedCharacterIds = unique(stat.learnedCharacterIds ?? []);
      const practicedCharacterKeys = unique(
        stat.practicedCharacterKeys ?? idsToCharacterKeys(learnedCharacterIds),
      );
      const newCharacterKeys = unique(
        stat.newCharacterKeys ??
          newCourseIdsToCharacterKeys(learnedCharacterIds),
      );
      return [
        date,
        {
          ...stat,
          learnedCharacterIds,
          practicedCharacterKeys,
          newCharacterKeys,
          newCharacterCount: newCharacterKeys.length,
        },
      ];
    }),
  );
  const legacyStats = legacyAnswerStatsToCharacterKeys(
    old.answerStats,
    old.date ?? fresh.date,
  );
  const todayAnswerStats = old.todayAnswerStats
    ? normalizeAnswerStats(old.todayAnswerStats, old.date ?? fresh.date)
    : legacyStats;
  const lifetimeAnswerStats = old.lifetimeAnswerStats
    ? normalizeAnswerStats(old.lifetimeAnswerStats, old.date ?? fresh.date)
    : legacyStats;
  const reviewPlan: Progress["reviewPlan"] = Object.fromEntries(
    Object.entries(old.reviewPlan ?? {}).map(([key, entry]) => [
      key,
      {
        dueDates: unique(entry.dueDates ?? []).sort(),
        completedDates: unique(entry.completedDates ?? []).sort(),
        correctStreak: entry.correctStreak ?? 0,
        wrongCount: entry.wrongCount ?? 0,
        mastered: entry.mastered ?? false,
      },
    ]),
  );
  const learnedByDate = {
    ...Object.fromEntries(
      Object.entries(dailyStats).map(([date, stat]) => [
        date,
        stat.newCharacterKeys,
      ]),
    ),
    [old.date ?? fresh.date]: todayNewKeys,
  };
  for (const [learnedDate, keys] of Object.entries(learnedByDate)) {
    for (const key of keys) {
      const entry = reviewPlan[key] ?? emptyReviewPlan();
      reviewPlan[key] = {
        ...entry,
        dueDates: unique([
          ...entry.dueDates,
          ...[1, 3, 7].map((days) => addDays(learnedDate, days)),
        ]).sort(),
      };
    }
  }
  const migrated: Progress = {
    ...fresh,
    ...old,
    version: 3,
    settings,
    courseIndex: old.courseIndex ?? Math.min(inferredNext, courses.length - 1),
    learnedIds: total,
    totalLearnedCharacterIds: total,
    totalLearnedCharacterKeys: totalKeys,
    todayLearnedCharacterIds: todayIds,
    todayNewCharacterKeys: todayNewKeys,
    todayPracticedCharacterKeys: todayPracticedKeys,
    todayAnswerStats,
    lifetimeAnswerStats,
    reviewPlan,
    reviewQueue: [],
    todayNewCharacterCount: todayNewKeys.length,
    todayExtraGroupCount:
      old.todayExtraGroupCount ??
      Math.max(0, Math.floor(todayIds.length / 3) - 1),
    dailyBaseGoalCompleted:
      old.dailyBaseGoalCompleted ?? old.completedToday ?? false,
    completedToday: old.dailyBaseGoalCompleted ?? old.completedToday ?? false,
    nextCourseIndex: inferredNext,
    currentExtraGroupProgress: old.currentExtraGroupProgress ?? 0,
    lastCompletedDate:
      old.lastCompletedDate ?? (old.completedToday ? (old.date ?? "") : ""),
    dailyStats,
    updatedAt: old.updatedAt ?? Date.now(),
  };
  migrated.reviewQueue = unique(
    old.reviewQueue ?? getDueReviewKeys(reviewPlan, migrated.date),
  ).slice(0, 3);
  return migrated;
}

export function recordCharacterAnswer(
  progress: Progress,
  characterKey: string,
  correct: boolean,
  lessonItemId?: string,
  scheduledReview = false,
): Progress {
  const increment = (
    stats: Record<string, CharacterAnswerStat>,
  ): Record<string, CharacterAnswerStat> => {
    const previous = stats[characterKey] ?? {
      correct: 0,
      wrong: 0,
      lastAnsweredDate: progress.date,
    };
    return {
      ...stats,
      [characterKey]: {
        correct: previous.correct + (correct ? 1 : 0),
        wrong: previous.wrong + (correct ? 0 : 1),
        lastAnsweredDate: progress.date,
      },
    };
  };
  const reviewPlan = { ...progress.reviewPlan };
  if (scheduledReview || !correct) {
    const entry = reviewPlan[characterKey] ?? emptyReviewPlan();
    const alreadyReviewedToday = entry.completedDates.includes(progress.date);
    const completedDates = scheduledReview
      ? unique([...entry.completedDates, progress.date]).sort()
      : entry.completedDates;
    const correctStreak = correct
      ? alreadyReviewedToday
        ? entry.correctStreak
        : entry.correctStreak + 1
      : 0;
    reviewPlan[characterKey] = {
      ...entry,
      dueDates: correct
        ? entry.dueDates
        : unique([...entry.dueDates, addDays(progress.date, 1)]).sort(),
      completedDates,
      correctStreak,
      wrongCount: entry.wrongCount + (correct ? 0 : 1),
      mastered: correctStreak >= 3,
    };
  }
  const legacy = lessonItemId
    ? {
        ...progress.answerStats,
        [lessonItemId]: {
          correct:
            (progress.answerStats[lessonItemId]?.correct ?? 0) +
            (correct ? 1 : 0),
          wrong:
            (progress.answerStats[lessonItemId]?.wrong ?? 0) +
            (correct ? 0 : 1),
        },
      }
    : progress.answerStats;
  return {
    ...progress,
    answerStats: legacy,
    todayAnswerStats: increment(progress.todayAnswerStats),
    lifetimeAnswerStats: increment(progress.lifetimeAnswerStats),
    reviewPlan,
  };
}

/**
 * 完成一个课程组。课程条目 ID 继续负责定位；真正的识字统计只使用
 * characterKey，复习课程只增加练习记录。
 */
export function completeCourseGroup(
  progress: Progress,
  course: Course,
  answerStats: Progress["answerStats"] = progress.answerStats,
): Progress {
  const groupIds = course.characters.map((item) => item.id);
  const practicedKeys = unique(
    course.characters.map((item) => item.characterKey),
  );
  const historicalKeys = new Set(progress.totalLearnedCharacterKeys);
  const groupNewKeys =
    course.courseType === "review"
      ? []
      : practicedKeys.filter((key) => !historicalKeys.has(key));

  const totalIds = unique([...progress.totalLearnedCharacterIds, ...groupIds]);
  const todayIds = unique([...progress.todayLearnedCharacterIds, ...groupIds]);
  const totalKeys = unique([
    ...progress.totalLearnedCharacterKeys,
    ...groupNewKeys,
  ]);
  const todayNewKeys = unique([
    ...progress.todayNewCharacterKeys,
    ...groupNewKeys,
  ]);
  const todayPracticedKeys = unique([
    ...progress.todayPracticedCharacterKeys,
    ...practicedKeys,
  ]);
  const firstBaseCompletion = !progress.dailyBaseGoalCompleted;
  const isExtraGroup = progress.dailyBaseGoalCompleted;
  const extraGroups =
    progress.todayExtraGroupCount + (isExtraGroup ? 1 : 0);
  const nextCourseIndex = findNextCourseIndex(
    totalIds,
    progress.courseIndex + 1,
  );
  const completedDates = unique([...progress.completedDates, progress.date]);
  const streak = firstBaseCompletion
    ? calculateNextStreak(
        progress.lastCompletedDate,
        progress.date,
        progress.streak,
      )
    : progress.streak;
  const reviewPlan = { ...progress.reviewPlan };
  for (const key of groupNewKeys) {
    const entry = reviewPlan[key] ?? emptyReviewPlan();
    reviewPlan[key] = {
      ...entry,
      dueDates: unique([
        ...entry.dueDates,
        ...course.reviewSchedule.map((days) => addDays(progress.date, days)),
      ]).sort(),
    };
  }

  return {
    ...progress,
    stage: "complete",
    reviewIndex: 0,
    answerStats,
    completedToday: true,
    dailyBaseGoalCompleted: true,
    todayLearnedCharacterIds: todayIds,
    todayNewCharacterKeys: todayNewKeys,
    todayPracticedCharacterKeys: todayPracticedKeys,
    todayNewCharacterCount: todayNewKeys.length,
    todayExtraGroupCount: extraGroups,
    totalLearnedCharacterIds: totalIds,
    totalLearnedCharacterKeys: totalKeys,
    reviewPlan,
    learnedIds: totalIds,
    nextCourseIndex,
    currentExtraGroupProgress:
      progress.currentExtraGroupProgress + (isExtraGroup ? 1 : 0),
    streak,
    lastCompletedDate: firstBaseCompletion
      ? progress.date
      : progress.lastCompletedDate,
    completedDates,
    dailyStats: {
      ...progress.dailyStats,
      [progress.date]: {
        learnedCharacterIds: todayIds,
        newCharacterKeys: todayNewKeys,
        practicedCharacterKeys: todayPracticedKeys,
        newCharacterCount: todayNewKeys.length,
        extraGroupCount: extraGroups,
        baseGoalCompleted: true,
      },
    },
  };
}

/** 跨日只重置今日状态；总课程指针和历史记录继续向后。 */
export function rollToToday(progress: Progress): Progress {
  const today = todayKey();
  if (progress.date === today) return { ...progress, lastOpenDate: today };
  const yesterdayIds = progress.todayLearnedCharacterIds;
  const dailyStats = {
    ...progress.dailyStats,
    [progress.date]: {
      learnedCharacterIds: yesterdayIds,
      newCharacterKeys: progress.todayNewCharacterKeys,
      practicedCharacterKeys: progress.todayPracticedCharacterKeys,
      newCharacterCount: progress.todayNewCharacterKeys.length,
      extraGroupCount: progress.todayExtraGroupCount,
      baseGoalCompleted: progress.dailyBaseGoalCompleted,
    },
  };
  const next = Math.min(progress.nextCourseIndex, courses.length - 1);
  const reviewQueue = getDueReviewKeys(progress.reviewPlan, today, 3);
  return {
    ...progress,
    date: today,
    courseIndex: next,
    stage: "goal",
    characterIndex: 0,
    reviewIndex: 0,
    answerStats: {},
    todayAnswerStats: {},
    reviewQueue,
    reviewIds: reviewQueue
      .map((key) => firstItemIdByCharacterKey.get(key))
      .filter((id): id is string => Boolean(id)),
    completedToday: false,
    dailyBaseGoalCompleted: false,
    todayLearnedCharacterIds: [],
    todayNewCharacterKeys: [],
    todayPracticedCharacterKeys: [],
    todayNewCharacterCount: 0,
    todayExtraGroupCount: 0,
    currentExtraGroupProgress: 0,
    lastOpenDate: today,
    dailyStats,
  };
}

export function loadProgress(): Progress {
  let progress = freshProgress();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) progress = migrateProgress(JSON.parse(raw));
  } catch {
    /* 数据损坏或存储被禁用时安全回退 */
  }
  return rollToToday(progress);
}

function parseStored(raw: string | null): Progress | null {
  if (!raw) return null;
  try {
    return rollToToday(migrateProgress(JSON.parse(raw)));
  } catch {
    return null;
  }
}

/**
 * 原生端以 Preferences 为主存储；首次安装时会读取 WebView localStorage，
 * 按更新时间选择较新的记录后迁移，避免覆盖用户刚完成的学习。
 */
export async function loadProgressAsync(): Promise<Progress> {
  if (!Capacitor.isNativePlatform()) return loadProgress();

  let local: Progress | null = null;
  try {
    local = parseStored(localStorage.getItem(KEY));
  } catch {
    local = null;
  }

  let native: Progress | null = null;
  try {
    const stored = await Preferences.get({ key: KEY });
    native = parseStored(stored.value);
  } catch {
    native = null;
  }

  const selected =
    native && local
      ? native.updatedAt >= local.updatedAt
        ? native
        : local
      : native ?? local ?? freshProgress();
  const migrated = rollToToday(selected);
  const serialized = JSON.stringify(migrated);

  try {
    await Preferences.set({ key: KEY, value: serialized });
  } catch {
    /* Preferences 不可用时仍可继续使用 WebView 备份 */
  }
  try {
    localStorage.setItem(KEY, serialized);
  } catch {
    /* 不向老人显示技术错误 */
  }
  return migrated;
}

export function saveProgress(progress: Progress): boolean {
  const next = { ...progress, updatedAt: Date.now() };
  const serialized = JSON.stringify(next);
  if (Capacitor.isNativePlatform()) {
    void Preferences.set({ key: KEY, value: serialized }).catch(() => {
      /* WebView localStorage 仍作为容灾备份 */
    });
  }
  try {
    localStorage.setItem(KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearProgress() {
  if (Capacitor.isNativePlatform()) {
    void Preferences.remove({ key: KEY }).catch(() => undefined);
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 不向老人显示技术错误 */
  }
}
