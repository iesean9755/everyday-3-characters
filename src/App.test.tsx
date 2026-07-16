import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
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
});
