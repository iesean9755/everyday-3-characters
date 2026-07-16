import "@testing-library/jest-dom/vitest";
class SpeechSynthesisUtteranceMock {
  text: string;
  lang = "";
  rate = 1;
  pitch = 1;
  voice = null;
  onstart: () => void = () => {};
  onend: () => void = () => {};
  onerror: () => void = () => {};
  constructor(text: string) {
    this.text = text;
  }
}
Object.assign(globalThis, {
  SpeechSynthesisUtterance: SpeechSynthesisUtteranceMock,
});
Object.defineProperty(window, "speechSynthesis", {
  configurable: true,
  writable: true,
  value: {
    cancel: () => {},
    speak: (u: SpeechSynthesisUtteranceMock) => {
      u.onstart();
      setTimeout(() => u.onend(), 1);
    },
    getVoices: () => [],
    pending: false,
  },
});
