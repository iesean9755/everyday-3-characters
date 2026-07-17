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
    vi.restoreAllMocks();
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
  it("清除今日记录时昨天未学习会把连续天数恢复为0", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const progress = {
      ...freshProgress(),
      date: "2026-07-17",
      streak: 1,
      lastCompletedDate: "2026-07-17",
      completedDates: ["2026-07-10", "2026-07-17"],
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
    expect(saved.streak).toBe(0);
    expect(saved.lastCompletedDate).toBe("2026-07-10");
    expect(saved.completedDates).toEqual(["2026-07-10"]);
  });
  it("新字课程全部完成的首页不再显示继续学习新字", () => {
    const key = courses[0].characters[0].characterKey;
    const progress = {
      ...freshProgress(),
      stage: "home" as const,
      nextCourseIndex: courses.length,
      allNewCoursesCompleted: true,
      totalLearnedCharacterKeys: [key],
      reviewQueue: [key],
      lifetimeAnswerStats: {
        [key]: { correct: 1, wrong: 2, lastAnsweredDate: "2026-07-16" },
      },
    };
    render(<App initialProgress={progress} />);

    expect(
      screen.getByRole("heading", { name: "新字课程已经全部学完" }),
    ).toBeInTheDocument();
    expect(screen.getByText("接下来继续复习，记得更牢"))
      .toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "开始今日复习" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "复习容易答错的字" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "听一遍提示" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("继续学3个")).not.toBeInTheDocument();
  });

  it("没有已学汉字时不能进入空的长期复习页", () => {
    render(
      <App
        initialProgress={{
          ...freshProgress(),
          stage: "home",
          nextCourseIndex: courses.length,
          allNewCoursesCompleted: true,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "开始今日复习" }))
      .toBeDisabled();
  });
  it("只有一个已学汉字时也能进入长期复习", () => {
    const key = courses[0].characters[0].characterKey;
    render(
      <App
        initialProgress={{
          ...freshProgress(),
          stage: "home",
          nextCourseIndex: courses.length,
          allNewCoursesCompleted: true,
          totalLearnedCharacterKeys: [key],
          reviewQueue: [key],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "开始今日复习" }));
    act(() => vi.advanceTimersByTime(700));
    expect(
      screen.getByRole("heading", { name: "今日复习（1/1）" }),
    ).toBeInTheDocument();
  });

  it("自动播放失败后显示声音开启遮罩", async () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        paused: false,
        pending: false,
        speaking: false,
        cancel: vi.fn(),
        resume: vi.fn(),
        getVoices: () => [
          { name: "测试中文声音", lang: "zh-CN", localService: true },
        ],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        speak: (utterance: SpeechSynthesisUtterance) =>
          window.setTimeout(
            () => utterance.onerror?.({ error: "not-allowed" } as SpeechSynthesisErrorEvent),
            1,
          ),
      },
    });
    render(<App />);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(
      screen.getByRole("button", { name: "声音没有播放，点这里开启声音" }),
    ).toBeInTheDocument();
  });

  it("手动点击声音遮罩后会解锁并重新尝试播放", async () => {
    let audibleAttempts = 0;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        paused: false,
        pending: false,
        speaking: false,
        cancel: vi.fn(),
        resume: vi.fn(),
        getVoices: () => [
          { name: "测试中文声音", lang: "zh-CN", localService: true },
        ],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        speak: (utterance: SpeechSynthesisUtterance) => {
          if (!utterance.text.trim()) {
            window.setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 1);
            return;
          }
          audibleAttempts += 1;
          window.setTimeout(() => {
            if (audibleAttempts === 1)
              utterance.onerror?.({ error: "not-allowed" } as SpeechSynthesisErrorEvent);
            else utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
          }, 1);
        },
      },
    });
    render(<App />);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    fireEvent.click(
      screen.getByRole("button", { name: "声音没有播放，点这里开启声音" }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(audibleAttempts).toBe(2);
    expect(
      screen.queryByRole("button", { name: "声音没有播放，点这里开启声音" }),
    ).not.toBeInTheDocument();
  });

  it("关闭自动播放后手动声音按钮仍然可以朗读", async () => {
    const spokenTexts: string[] = [];
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        paused: false,
        pending: false,
        speaking: false,
        cancel: vi.fn(),
        resume: vi.fn(),
        getVoices: () => [
          { name: "测试中文声音", lang: "zh-CN", localService: true },
        ],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        speak: (utterance: SpeechSynthesisUtterance) => {
          spokenTexts.push(utterance.text);
          window.setTimeout(
            () => utterance.onend?.(new Event("end") as SpeechSynthesisEvent),
            1,
          );
        },
      },
    });
    render(
      <App
        initialProgress={{
          ...freshProgress(),
          settings: { ...freshProgress().settings, autoPlay: false },
        }}
      />,
    );
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(spokenTexts).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "听一听" }));
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(spokenTexts.some((text) => text.trim().length > 0)).toBe(true);
  });
});
