export type Theme =
  | "健康"
  | "购物"
  | "出行"
  | "安全"
  | "手机"
  | "场所"
  | "医院"
  | "银行"
  | "日期"
  | "饮食"
  | "家庭"
  | "防骗";
export interface CharacterItem {
  id: string;
  characterKey: string;
  char: string;
  pinyin: string;
  meaning: string;
  scene: string;
  example: string;
  speech: string;
  teachingAudio: string;
  introAudio: string;
  characterAudio: string;
  explanationAudio: string;
  exampleAudio: string;
  questionAudio: string;
  successAudio: string;
  retryAudio: string;
  imageKeyword: string;
  courseId: number;
  theme: Theme;
  difficulty: 1 | 2 | 3;
  confusions: string[];
  reviewCount: number;
  mastered: boolean;
}
export interface Course {
  id: number;
  courseType: "new" | "review";
  name: string;
  goal: string;
  scene: string;
  icon: string;
  theme: Theme;
  characters: CharacterItem[];
  openingSpeech: string;
  completionSpeech: string;
  openingAudio: string;
  completionAudio: string;
  reviewSchedule: number[];
}
export interface Settings {
  dailyCount: 3 | 5;
  speechRate: number;
  voiceName: string;
  introPauseMs: number;
  characterPauseMs: number;
  autoPlay: boolean;
  fontScale: number;
  optionCount: 2 | 3;
  reminderTime: string;
  difficulty: 1 | 2 | 3;
  maxDailyCharacters: 3 | 6 | 9 | 15 | null;
  enabledThemes: Record<"防骗" | "医院" | "手机", boolean>;
}
export interface AnswerStat {
  correct: number;
  wrong: number;
}
export interface CharacterAnswerStat extends AnswerStat {
  lastAnsweredDate: string;
}
export interface ReviewPlanEntry {
  dueDates: string[];
  completedDates: string[];
  correctStreak: number;
  wrongCount: number;
  mastered: boolean;
}
export type Stage =
  | "welcome"
  | "home"
  | "goal"
  | "learn"
  | "quiz"
  | "review"
  | "todayReview"
  | "complete"
  | "rest"
  | "settings";
export interface DailyLearningStat {
  learnedCharacterIds: string[];
  newCharacterKeys: string[];
  practicedCharacterKeys: string[];
  newCharacterCount: number;
  extraGroupCount: number;
  baseGoalCompleted: boolean;
}
export interface Progress {
  version: 3;
  updatedAt: number;
  date: string;
  courseIndex: number;
  stage: Stage;
  characterIndex: number;
  reviewIndex: number;
  answerStats: Record<string, AnswerStat>;
  todayAnswerStats: Record<string, CharacterAnswerStat>;
  lifetimeAnswerStats: Record<string, CharacterAnswerStat>;
  reviewPlan: Record<string, ReviewPlanEntry>;
  reviewQueue: string[];
  learnedIds: string[];
  reviewIds: string[];
  streak: number;
  lastOpenDate: string;
  completedToday: boolean;
  completedDates: string[];
  dailyBaseGoalCompleted: boolean;
  todayLearnedCharacterIds: string[];
  todayNewCharacterKeys: string[];
  todayPracticedCharacterKeys: string[];
  todayNewCharacterCount: number;
  todayExtraGroupCount: number;
  totalLearnedCharacterIds: string[];
  totalLearnedCharacterKeys: string[];
  nextCourseIndex: number;
  currentExtraGroupProgress: number;
  lastCompletedDate: string;
  dailyStats: Record<string, DailyLearningStat>;
  settings: Settings;
}
