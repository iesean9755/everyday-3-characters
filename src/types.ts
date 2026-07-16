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
  newCharacterCount: number;
  extraGroupCount: number;
  baseGoalCompleted: boolean;
}
export interface Progress {
  version: 1;
  updatedAt: number;
  date: string;
  courseIndex: number;
  stage: Stage;
  characterIndex: number;
  reviewIndex: number;
  answerStats: Record<string, AnswerStat>;
  learnedIds: string[];
  reviewIds: string[];
  streak: number;
  lastOpenDate: string;
  completedToday: boolean;
  completedDates: string[];
  dailyBaseGoalCompleted: boolean;
  todayLearnedCharacterIds: string[];
  todayNewCharacterCount: number;
  todayExtraGroupCount: number;
  totalLearnedCharacterIds: string[];
  nextCourseIndex: number;
  currentExtraGroupProgress: number;
  lastCompletedDate: string;
  dailyStats: Record<string, DailyLearningStat>;
  settings: Settings;
}
