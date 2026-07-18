import { afterEach, describe, expect, it, vi } from "vitest";

class UtteranceMock {
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

class FailingAudio {
  preload = "";
  volume = 0;
  src = "";
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src = "") { this.src = src; }
  load() {}
  pause() {}
  play() { return Promise.reject(new Error("本地音频加载失败")); }
}

describe("本地音频回退", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("清单内MP3播放失败后仍回退浏览器语音", async () => {
    vi.useFakeTimers();
    const spoken: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ["/audio/system/test.mp3"],
    })));
    vi.stubGlobal("Audio", FailingAudio);
    vi.stubGlobal("SpeechSynthesisUtterance", UtteranceMock);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        pending: false,
        paused: false,
        speaking: false,
        cancel: vi.fn(),
        resume: vi.fn(),
        getVoices: () => [],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        speak: (utterance: UtteranceMock) => {
          spoken.push(utterance.text);
          window.setTimeout(() => utterance.onend?.(), 1);
        },
      },
    });

    const { speak, stopSpeech } = await import("./speech");
    const result = speak("本地失败后继续朗读", {
      audioPath: "/audio/system/test.mp3",
    });
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ ok: true, source: "browser" });
    expect(spoken).toEqual(["本地失败后继续朗读"]);
    stopSpeech();
  });
});
