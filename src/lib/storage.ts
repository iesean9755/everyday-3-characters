import { courses } from "../data/courses";
import type { Progress, Settings } from "../types";
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

const unique = (ids: string[]) => [...new Set(ids)];

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
    version: 1,
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
    todayNewCharacterCount: 0,
    todayExtraGroupCount: 0,
    totalLearnedCharacterIds: [],
    nextCourseIndex: 0,
    currentExtraGroupProgress: 0,
    lastCompletedDate: "",
    dailyStats: {},
    settings: { ...defaultSettings },
  };
};

const valid = (
  value: unknown,
): value is Partial<Progress> & Pick<Progress, "version" | "date"> =>
  !!value &&
  typeof value === "object" &&
  (value as Progress).version === 1 &&
  typeof (value as Progress).date === "string";

/** 将旧版记录补齐为新版结构，不删除任何长期学习数据。 */
export function migrateProgress(value: unknown): Progress {
  const fresh = freshProgress();
  if (!valid(value)) return fresh;
  const old = value as Partial<Progress>;
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
  const inferredNext =
    old.nextCourseIndex ?? findNextCourseIndex(total, oldCourseIndex);
  return {
    ...fresh,
    ...old,
    settings,
    courseIndex: old.courseIndex ?? Math.min(inferredNext, courses.length - 1),
    learnedIds: total,
    totalLearnedCharacterIds: total,
    todayLearnedCharacterIds: todayIds,
    todayNewCharacterCount: old.todayNewCharacterCount ?? todayIds.length,
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
    dailyStats: old.dailyStats ?? {},
    updatedAt: old.updatedAt ?? Date.now(),
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
      newCharacterCount: progress.todayNewCharacterCount,
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
