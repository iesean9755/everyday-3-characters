import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { courses } from "./data/courses";
import { completeCourseGroup, freshProgress } from "./lib/storage";
describe("核心学习流程", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it("首次打开有唯一的大开始按钮", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: "开始今天的学习" }),
    ).toBeInTheDocument();
  });
  it("能进入今日目标并开始第一个字", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开始今天的学习" }));
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText(/学会/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始学习" }));
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText("第 1 个，共 3 个")).toBeInTheDocument();
  });
  it("刷新后保存当前进度", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开始今天的学习" }));
    act(() => vi.advanceTimersByTime(700));
    const saved = JSON.parse(localStorage.getItem("everyday-3-characters-v1")!);
    expect(saved.stage).toBe("goal");
  });
  it("复习课程完成页显示练习数且明确没有新增汉字", () => {
    const reviewIndex = courses.findIndex(
      (course) => course.courseType === "review",
    );
    const progress = completeCourseGroup(
      { ...freshProgress(), courseIndex: reviewIndex },
      courses[reviewIndex],
    );

    render(<App initialProgress={progress} />);
    expect(
      screen.getByRole("heading", { name: "今天复习了3个字" }),
    ).toBeInTheDocument();
    expect(screen.getByText("没有增加新的汉字")).toBeInTheDocument();
    expect(screen.getByText("今天练习了3个字")).toBeInTheDocument();
  });
  it("当天先学新字再复习时显示合并后的两类统计", () => {
    const reviewIndex = courses.findIndex(
      (course) => course.courseType === "review",
    );
    const reviewKeys = new Set(
      courses[reviewIndex].characters.map((item) => item.characterKey),
    );
    const newCourseIndex = courses.findIndex(
      (course) =>
        course.courseType === "new" &&
        course.characters.every((item) => !reviewKeys.has(item.characterKey)),
    );
    const learned = completeCourseGroup(
      { ...freshProgress(), courseIndex: newCourseIndex },
      courses[newCourseIndex],
    );
    const reviewed = completeCourseGroup(
      { ...learned, courseIndex: reviewIndex },
      courses[reviewIndex],
    );

    render(<App initialProgress={reviewed} />);
    expect(screen.getByText("今天新认识3个字，练习了6个字"))
      .toBeInTheDocument();
  });
  it("长按家人设置可以看到按汉字保存的历史错题", () => {
    const progress = {
      ...freshProgress(),
      lifetimeAnswerStats: {
        药: { correct: 1, wrong: 5, lastAnsweredDate: "2026-07-16" },
      },
    };
    render(<App initialProgress={progress} />);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "家人设置，长按三秒" }),
    );
    act(() => vi.advanceTimersByTime(3100));

    expect(
      screen.getByRole("heading", { name: "家人设置" }),
    ).toBeInTheDocument();
    expect(screen.getByText("需要多复习")).toBeInTheDocument();
    expect(screen.getByText("药")).toBeInTheDocument();
  });
  it("清除今日记录后会按剩余完成日期恢复连续天数", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const progress = {
      ...freshProgress(),
      date: "2026-07-17",
      streak: 4,
      lastCompletedDate: "2026-07-17",
      completedDates: [
        "2026-07-14",
        "2026-07-15",
        "2026-07-16",
        "2026-07-17",
      ],
      dailyBaseGoalCompleted: true,
      completedToday: true,
    };
    render(<App initialProgress={progress} />);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "家人设置，长按三秒" }),
    );
    act(() => vi.advanceTimersByTime(3100));
    fireEvent.click(screen.getByRole("button", { name: "清除今日学习记录" }));

    const saved = JSON.parse(
      localStorage.getItem("everyday-3-characters-v1")!,
    );
    expect(saved.streak).toBe(3);
    expect(saved.lastCompletedDate).toBe("2026-07-16");
    expect(saved.completedDates).toEqual([
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
    ]);
  });
});
