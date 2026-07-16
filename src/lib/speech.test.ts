import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courses } from "../data/courses";
import { getChineseVoices, speak, speakTeaching, stopSpeech } from "./speech";

class UtteranceMock {
  text: string;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(text: string) { this.text = text; }
}

describe("统一语音模块", () => {
  const spoken: { text: string; rate: number; voice: string }[] = [];
  let cancels = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    spoken.length = 0;
    cancels = 0;
    const naturalVoice = { name: "Microsoft Xiaoxiao Online (Natural)", lang: "zh-CN", localService: false } as SpeechSynthesisVoice;
    const robotVoice = { name: "Chinese Desktop", lang: "zh-CN", localService: true } as SpeechSynthesisVoice;
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { value: UtteranceMock, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        pending: false,
        cancel: () => { cancels += 1; },
        getVoices: () => [robotVoice, naturalVoice],
        addEventListener: () => {},
        removeEventListener: () => {},
        speak: (utterance: UtteranceMock) => {
          spoken.push({ text: utterance.text, rate: utterance.rate, voice: utterance.voice?.name ?? "" });
          window.setTimeout(() => utterance.onend?.(), 1);
        },
      },
    });
  });
  afterEach(() => { stopSpeech(); vi.useRealTimers(); });

  it("优先选择评分更高的中文自然音色", () => {
    expect(getChineseVoices()[0].name).toContain("Xiaoxiao");
  });

  it("件字按600ms和900ms停顿串行朗读", async () => {
    const item = courses[15].characters[0];
    const result = speakTeaching(item, { rate: 0.8, introPauseMs: 600, characterPauseMs: 900 });
    await vi.advanceTimersByTimeAsync(2);
    expect(spoken.map((entry) => entry.text)).toEqual(["这个字念"]);
    await vi.advanceTimersByTimeAsync(598);
    expect(spoken).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(spoken[1]).toMatchObject({ text: "件", rate: 0.68 });
    await vi.advanceTimersByTimeAsync(899);
    expect(spoken).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(spoken[2].text).toBe("快递件的件");
    await vi.advanceTimersByTimeAsync(2);
    expect((await result).ok).toBe(true);
  });

  it("连续播放会先取消旧语音，避免重叠", async () => {
    void speak("第一段");
    await vi.advanceTimersByTimeAsync(0);
    void speak("第二段");
    await vi.advanceTimersByTimeAsync(3);
    expect(cancels).toBeGreaterThanOrEqual(2);
    expect(spoken.at(-1)?.text).toBe("第二段");
  });
});
