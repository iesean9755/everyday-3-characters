import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courses } from "../data/courses";
import {
  ensureSpeechReady,
  getChineseVoices,
  getSpeechDiagnostics,
  speak,
  speakTeaching,
  stopSpeech,
  unlockSpeechFromUserGesture,
} from "./speech";

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
        paused: false,
        speaking: false,
        cancel: () => { cancels += 1; },
        resume: vi.fn(),
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

  it("完整教学MP3失败时只启动一次正常语速的浏览器语音", async () => {
    const item = courses[15].characters[0];
    const result = speakTeaching(item, { rate: 0.8 });
    await vi.advanceTimersByTimeAsync(5);
    expect(spoken).toEqual([
      {
        text: "这个字念，件。快递件的件。您有一个快递件。",
        rate: 0.8,
        voice: "Microsoft Xiaoxiao Online (Natural)",
      },
    ]);
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

  it("有中文声音时正常播放并返回实际声音名称", async () => {
    const result = speak("您好");
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({
      ok: true,
      source: "browser",
      voiceName: "Microsoft Xiaoxiao Online (Natural)",
    });
  });

  it("没有中文声音但Web Speech存在时使用系统默认voice null", async () => {
    const synth = window.speechSynthesis as unknown as {
      getVoices: () => SpeechSynthesisVoice[];
    };
    synth.getVoices = () => [];
    const result = speak("系统默认声音");
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({
      ok: true,
      source: "browser",
      voiceName: "系统默认声音",
    });
    expect(spoken.at(-1)?.voice).toBe("");
  });

  it("Web Speech不存在时返回unsupported", async () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: undefined,
    });
    const result = speak("您好");
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({
      ok: false,
      source: "none",
      reason: "unsupported",
    });
  });

  it("onerror会返回明确的blocked失败原因", async () => {
    const synth = window.speechSynthesis as unknown as {
      speak: (utterance: UtteranceMock) => void;
    };
    synth.speak = (utterance) =>
      window.setTimeout(() => utterance.onerror?.({ error: "not-allowed" }), 1);
    const result = speak("您好");
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({
      ok: false,
      blocked: true,
      reason: "blocked",
    });
  });

  it("浏览器静默时超时且只用系统默认声音重试一次", async () => {
    let attempts = 0;
    const synth = window.speechSynthesis as unknown as {
      speak: (utterance: UtteranceMock) => void;
      resume: ReturnType<typeof vi.fn>;
    };
    synth.speak = () => { attempts += 1; };
    synth.resume = vi.fn();
    const result = speak("短语音");
    await vi.advanceTimersByTimeAsync(16_001);
    expect(await result).toMatchObject({
      ok: false,
      reason: "timeout",
      voiceName: "系统默认声音",
    });
    expect(attempts).toBe(2);
    expect(synth.resume).toHaveBeenCalled();
  });

  it("保存的声音不存在时自动回退到评分最高的中文声音", async () => {
    const result = speak("您好", { voiceName: "已经删除的声音" });
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({
      ok: true,
      voiceName: "Microsoft Xiaoxiao Online (Natural)",
    });
  });

  it("用户手势解锁会恢复暂停状态且不播放可听测试音", async () => {
    const synth = window.speechSynthesis as unknown as {
      paused: boolean;
      resume: ReturnType<typeof vi.fn>;
    };
    synth.paused = true;
    synth.resume = vi.fn();
    const readiness = unlockSpeechFromUserGesture();
    await vi.runAllTimersAsync();
    expect((await readiness).supported).toBe(true);
    expect(synth.resume).toHaveBeenCalled();
    expect(spoken.at(-1)?.text.trim()).toBe("");
  });

  it("播放结束后会清理activeUtterance和看门狗计时器", async () => {
    const result = speak("清理检查");
    await vi.runAllTimersAsync();
    expect((await result).ok).toBe(true);
    expect(getSpeechDiagnostics().active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("语音准备最多等待1500毫秒后仍允许系统默认声音", async () => {
    const synth = window.speechSynthesis as unknown as {
      getVoices: () => SpeechSynthesisVoice[];
    };
    synth.getVoices = () => [];
    const readiness = ensureSpeechReady();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await readiness).toEqual({
      supported: true,
      chineseVoiceCount: 0,
      selectedVoiceName: "",
    });
  });
});
