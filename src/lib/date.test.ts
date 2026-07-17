import { describe, expect, it } from "vitest";
import {
  addDays,
  calculateNextStreak,
  calculateStreakFromDates,
  isDue,
  isYesterday,
} from "./date";

describe("本地日期和连续学习天数", () => {
  it("按本地日历跨月和跨年加减日期", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("识别昨天和到期日期", () => {
    expect(isYesterday("2026-07-16", "2026-07-17")).toBe(true);
    expect(isDue("2026-07-16", "2026-07-17")).toBe(true);
    expect(isDue("2026-07-18", "2026-07-17")).toBe(false);
  });

  it("昨天完成后今天完成会从1变2", () => {
    expect(calculateNextStreak("2026-07-16", "2026-07-17", 1)).toBe(2);
  });

  it("隔三天完成会重置为1，同一天不会重复增加", () => {
    expect(calculateNextStreak("2026-07-14", "2026-07-17", 8)).toBe(1);
    expect(calculateNextStreak("2026-07-17", "2026-07-17", 8)).toBe(8);
  });

  it("从剩余完成日期恢复连续天数", () => {
    expect(
      calculateStreakFromDates([
        "2026-07-10",
        "2026-07-14",
        "2026-07-15",
        "2026-07-16",
      ]),
    ).toBe(3);
  });
});
