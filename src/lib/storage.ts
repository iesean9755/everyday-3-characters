import { courses } from "../data/courses";
import type { Course, Progress, Settings } from "../types";
import { todayKey } from "./date";
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
    version: 2,
    updatedAt: Date.now(),
    date,
    courseIndex: 0,
    stage: "welcome",
    characterIndex: 0,
    reviewIndex: 0,
    answerStats: {},
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
): value is Record<string, unknown> & { version: 1 | 2; date: string } =>
  !!value &&
  typeof value === "object" &&
  ((value as { version?: number }).version === 1 ||
    (value as { version?: number }).version === 2) &&
  typeof (value as { date?: unknown }).date === "string";

/** 将旧版记录补齐为新版结构，不删除任何长期学习数据。 */
export function migrateProgress(value: unknown): Progress {
  const fresh = freshProgress();
  if (!valid(value)) return fresh;
  const old = value as unknown as Partial<Progress> & { version: 1 | 2 };
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
  return {
    ...fresh,
    ...old,
    version: 2,
    settings,
    courseIndex: old.courseIndex ?? Math.min(inferredNext, courses.length - 1),
    learnedIds: total,
    totalLearnedCharacterIds: total,
    totalLearnedCharacterKeys: totalKeys,
    todayLearnedCharacterIds: todayIds,
    todayNewCharacterKeys: todayNewKeys,
    todayPracticedCharacterKeys: todayPracticedKeys,
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
    dailyStats: Object.fromEntries(
      Object.entries(old.dailyStats ?? {}).map(([date, stat]) => {
        const learnedCharacterIds = unique(stat.learnedCharacterIds ?? []);
        const practicedCharacterKeys = unique(
          stat.practicedCharacterKeys ??
            idsToCharacterKeys(learnedCharacterIds),
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
    ),
    updatedAt: old.updatedAt ?? Date.now(),
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
  const streak =
    firstBaseCompletion && progress.lastCompletedDate !== progress.date
      ? progress.streak + 1
      : progress.streak;

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
  return {
    ...progress,
    date: today,
    courseIndex: next,
    stage: "goal",
    characterIndex: 0,
    reviewIndex: 0,
    answerStats: {},
    reviewIds: yesterdayIds.slice(-3),
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
