import type { CharacterItem, Course, Progress } from "../types";

export const SYSTEM_AUDIO_PATHS = {
  welcome: "/audio/system/welcome.mp3",
  homeCompleted: "/audio/system/home-completed.mp3",
  baseCompleted: "/audio/system/base-completed.mp3",
  reviewCompleted: "/audio/system/review-completed.mp3",
  allCoursesCompleted: "/audio/system/all-courses-completed.mp3",
  rest: "/audio/system/rest.mp3",
  idle: "/audio/system/idle-reminder.mp3",
} as const;

export function getAllCoursesCompletedSpeech(): string {
  return "新字课程已经全部学完。以后每天复习几个字，记得更牢。";
}

export function getHomeSpeech(progress: Progress): string {
  if (progress.allNewCoursesCompleted) return getAllCoursesCompletedSpeech();
  return progress.dailyBaseGoalCompleted
    ? "您今天已经完成任务。想继续学习，请点中间的大按钮。"
    : "您好，今天我们认识三个字。请点一下屏幕中间的大圆按钮。";
}

export function getGoalSpeech(course: Course): string {
  return `今天我们学习${course.goal}，一共认识${course.characters.length}个字。`;
}

export function getTeachingParts(item: CharacterItem) {
  return {
    intro: "这个字念",
    character: item.char,
    explanation: item.teachingExplanation,
  };
}

export function getQuestionSpeech(item: CharacterItem): string {
  return `请找出${item.char}字。`;
}

export function getSuccessSpeech(item: CharacterItem): string {
  return `找对了，这个字念${item.char}。`;
}

export function getRetrySpeech(item: CharacterItem): string {
  return `没关系，我们再看一次。这个字念${item.char}。`;
}

export function getCompletionSpeech(
  course: Course,
  progress: Progress,
): string {
  if (progress.allNewCoursesCompleted) return getAllCoursesCompletedSpeech();
  if (course.courseType === "review")
    return "今天的复习已经完成，记得更牢了。";
  return "今天的三个字已经认识了。您可以今天学到这里，也可以再学三个新字。";
}

export function getRestSpeech(): string {
  return "您今天已经学了不少，可以休息一下，明天再学。";
}

export function getReviewCompletedSpeech(): string {
  return "今天的复习已经完成，记得更牢了。";
}

export function getIdleSpeech(): string {
  return "请点一下屏幕，我们继续学习。";
}
