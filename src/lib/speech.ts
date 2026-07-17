import type { CharacterItem } from "../types";

export interface VoiceOption {
  name: string;
  lang: string;
  label: string;
  score: number;
}

export interface PlaybackResult {
  ok: boolean;
  source: "local" | "browser" | "none";
  blocked: boolean;
  voiceName: string;
  reason?: PlaybackFailureReason;
}

export type PlaybackFailureReason =
  | "unsupported"
  | "blocked"
  | "timeout"
  | "voice-unavailable"
  | "playback-error"
  | "cancelled";

export interface SpeechReadiness {
  supported: boolean;
  chineseVoiceCount: number;
  selectedVoiceName: string;
}

export interface SpeechDiagnostics extends SpeechReadiness {
  lastResult: PlaybackResult | null;
  active: boolean;
}

export interface SpeechOptions {
  rate?: number;
  voiceName?: string;
  audioPath?: string;
}

export interface TeachingOptions extends SpeechOptions {
  introPauseMs?: number;
  characterPauseMs?: number;
}

type SpeechSegment = {
  text: string;
  rate: number;
  pauseAfterMs: number;
  audioPath?: string;
};

let generation = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeSegmentCancel: (() => void) | null = null;
let speechWatchdog: number | undefined;
let pauseTimer: number | undefined;
let voices: SpeechSynthesisVoice[] = [];
let manifestPromise: Promise<Set<string>> | null = null;
let readinessPromise: Promise<SpeechReadiness> | null = null;
let lastPlaybackResult: PlaybackResult | null = null;
const voiceListeners = new Set<() => void>();
const handleVoicesChanged = () => refreshVoices(true);

export const speechSupported = () =>
  typeof window !== "undefined" &&
  typeof window.speechSynthesis?.speak === "function" &&
  typeof SpeechSynthesisUtterance === "function";

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const language = voice.lang.toLowerCase().replaceAll("_", "-");
  const descriptor = `${voice.name} ${voice.lang}`.toLowerCase();
  let score = 0;
  if (language === "zh-cn") score += 120;
  else if (language === "zh-hans-cn") score += 115;
  else if (language.startsWith("zh-hans")) score += 100;
  else if (language.startsWith("zh")) score += 80;
  if (/普通话|mandarin|chinese/.test(descriptor)) score += 25;
  const preferred = [
    "natural",
    "online",
    "xiaoxiao",
    "xiaoyi",
    "yunxi",
    "yunyang",
  ];
  preferred.forEach((keyword, index) => {
    if (descriptor.includes(keyword)) score += 70 - index * 4;
  });
  if (voice.localService) score += 3;
  return score;
}

function refreshVoices(notify = true) {
  if (!speechSupported()) return;
  const loaded = window.speechSynthesis.getVoices();
  const before = voices.map((voice) => `${voice.name}|${voice.lang}`).join(";");
  const after = loaded.map((voice) => `${voice.name}|${voice.lang}`).join(";");
  voices = loaded;
  if (notify && before !== after) voiceListeners.forEach((listener) => listener());
}

export function initializeVoices() {
  if (!speechSupported()) return () => {};
  refreshVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", handleVoicesChanged);
  return () =>
    window.speechSynthesis.removeEventListener?.(
      "voiceschanged",
      handleVoicesChanged,
    );
}

export function ensureSpeechReady(): Promise<SpeechReadiness> {
  if (!speechSupported())
    return Promise.resolve({
      supported: false,
      chineseVoiceCount: 0,
      selectedVoiceName: "",
    });
  const synth = window.speechSynthesis;
  if (synth.paused) synth.resume();
  refreshVoices(false);
  if (voices.length) {
    const chinese = getChineseVoices();
    return Promise.resolve({
      supported: true,
      chineseVoiceCount: chinese.length,
      selectedVoiceName: chinese[0]?.name ?? "",
    });
  }
  if (readinessPromise) return readinessPromise;
  readinessPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      synth.removeEventListener?.("voiceschanged", onVoicesChanged);
      refreshVoices(false);
      const chinese = getChineseVoices();
      readinessPromise = null;
      resolve({
        supported: true,
        chineseVoiceCount: chinese.length,
        selectedVoiceName: chinese[0]?.name ?? "",
      });
    };
    const onVoicesChanged = () => finish();
    const timer = window.setTimeout(finish, 1500);
    synth.addEventListener?.("voiceschanged", onVoicesChanged);
    refreshVoices(false);
    if (voices.length) finish();
  });
  return readinessPromise;
}

export function unlockSpeechFromUserGesture(): Promise<SpeechReadiness> {
  if (!speechSupported()) return ensureSpeechReady();
  const synth = window.speechSynthesis;
  if (synth.paused) synth.resume();
  try {
    const unlock = new SpeechSynthesisUtterance(" ");
    unlock.lang = "zh-CN";
    unlock.volume = 0;
    unlock.rate = 10;
    synth.speak(unlock);
  } catch {
    // resume()仍然完成了同步解锁尝试；后续真实播放会返回明确结果。
  }
  return ensureSpeechReady();
}

export function getSpeechDiagnostics(
  preferredName = "",
): SpeechDiagnostics {
  const chinese = getChineseVoices();
  const selected = getSelectedVoice(preferredName);
  return {
    supported: speechSupported(),
    chineseVoiceCount: chinese.length,
    selectedVoiceName: selected?.name ?? "系统默认声音",
    lastResult: lastPlaybackResult,
    active: activeUtterance !== null || speechWatchdog !== undefined,
  };
}

export function subscribeVoices(listener: () => void) {
  voiceListeners.add(listener);
  return () => voiceListeners.delete(listener);
}

export function getChineseVoices(): VoiceOption[] {
  refreshVoices(false);
  return voices
    .map((voice) => ({
      name: voice.name,
      lang: voice.lang,
      label: `${voice.name}（${voice.lang}）`,
      score: scoreVoice(voice),
    }))
    .filter((voice) => voice.score >= 80)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function getSelectedVoice(
  preferredName = "",
): SpeechSynthesisVoice | null {
  refreshVoices(false);
  const available = getChineseVoices();
  const chosen =
    available.find((voice) => voice.name === preferredName) ?? available[0];
  if (chosen) return voices.find((voice) => voice.name === chosen.name) ?? null;
  return null;
}

async function getAudioManifest(): Promise<Set<string>> {
  if (typeof fetch !== "function") return new Set();
  if (!manifestPromise) {
    manifestPromise = fetch("/audio/manifest.json", { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) return [] as string[];
        const data: unknown = await response.json();
        return Array.isArray(data)
          ? data.filter((item): item is string => typeof item === "string")
          : [];
      })
      .then((items) => new Set(items))
      .catch(() => new Set());
  }
  return manifestPromise;
}

export async function preloadAudio(paths: string[]) {
  const manifest = await getAudioManifest();
  paths
    .filter((path) => manifest.has(path))
    .forEach((path) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = path;
      audio.load();
    });
}

function wait(ms: number, token: number) {
  return new Promise<boolean>((resolve) => {
    if (ms <= 0) return resolve(token === generation);
    pauseTimer = window.setTimeout(() => resolve(token === generation), ms);
  });
}

async function playLocal(
  path: string | undefined,
  token: number,
): Promise<boolean> {
  if (!path) return false;
  const manifest = await getAudioManifest();
  if (!manifest.has(path) || token !== generation) return false;
  return new Promise((resolve) => {
    const audio = new Audio(path);
    activeAudio = audio;
    audio.preload = "auto";
    audio.onended = () => resolve(token === generation);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
}

function failureReason(error: string): PlaybackFailureReason {
  if (error === "not-allowed" || error === "audio-busy") return "blocked";
  if (error === "canceled" || error === "interrupted") return "cancelled";
  if (error === "voice-unavailable") return "voice-unavailable";
  return "playback-error";
}

function segmentTimeout(text: string): number {
  return Math.min(20_000, Math.max(8_000, text.length * 550));
}

function attemptBrowserSegment(
  segment: SpeechSegment,
  selected: SpeechSynthesisVoice | null,
  token: number,
): Promise<PlaybackResult> {
  if (!speechSupported() || token !== generation)
    return Promise.resolve({
      ok: false,
      source: "none",
      blocked: false,
      voiceName: "",
      reason: speechSupported() ? "cancelled" : "unsupported",
    });
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = selected?.lang || "zh-CN";
    utterance.voice = selected;
    utterance.rate = segment.rate;
    utterance.pitch = 0.96;
    utterance.volume = 1;
    let settled = false;
    const finish = (result: PlaybackResult) => {
      if (settled) return;
      settled = true;
      if (speechWatchdog !== undefined) {
        window.clearTimeout(speechWatchdog);
        speechWatchdog = undefined;
      }
      if (activeUtterance === utterance) activeUtterance = null;
      if (activeSegmentCancel === cancelActive) activeSegmentCancel = null;
      lastPlaybackResult = result;
      resolve(result);
    };
    const cancelActive = () =>
      finish({
        ok: false,
        source: "none",
        blocked: false,
        voiceName: selected?.name ?? "系统默认声音",
        reason: "cancelled",
      });
    utterance.onend = () =>
      finish({
        ok: token === generation,
        source: token === generation ? "browser" : "none",
        blocked: false,
        voiceName: selected?.name ?? "系统默认声音",
        reason: token === generation ? undefined : "cancelled",
      });
    utterance.onerror = (event) => {
      const reason = failureReason(event.error);
      finish({
        ok: false,
        source: "none",
        blocked: reason === "blocked",
        voiceName: selected?.name ?? "系统默认声音",
        reason,
      });
    };
    activeUtterance = utterance;
    activeSegmentCancel = cancelActive;
    speechWatchdog = window.setTimeout(() => {
      finish({
        ok: false,
        source: "none",
        blocked: false,
        voiceName: selected?.name ?? "系统默认声音",
        reason: "timeout",
      });
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }, segmentTimeout(segment.text));
    window.speechSynthesis.speak(utterance);
  });
}

async function playBrowserSegment(
  segment: SpeechSegment,
  voiceName: string,
  token: number,
): Promise<PlaybackResult> {
  const readiness = await ensureSpeechReady();
  if (!readiness.supported || token !== generation) {
    const result: PlaybackResult = {
      ok: false,
      source: "none",
      blocked: false,
      voiceName: "",
      reason: readiness.supported ? "cancelled" : "unsupported",
    };
    lastPlaybackResult = result;
    return result;
  }
  const selected = getSelectedVoice(voiceName);
  const first = await attemptBrowserSegment(segment, selected, token);
  if (first.reason !== "timeout" || token !== generation) return first;
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  return attemptBrowserSegment(segment, null, token);
}

async function playSegments(
  segments: SpeechSegment[],
  voiceName: string,
): Promise<PlaybackResult> {
  stopSpeech();
  const token = generation;
  let lastResult: PlaybackResult = {
    ok: false,
    source: "none",
    blocked: false,
    voiceName: "",
    reason: "playback-error",
  };
  for (const segment of segments) {
    if (token !== generation) return lastResult;
    const localPlayed = await playLocal(segment.audioPath, token);
    if (localPlayed) {
      lastResult = {
        ok: true,
        source: "local",
        blocked: false,
        voiceName: "本地自然语音",
      };
      lastPlaybackResult = lastResult;
    } else {
      lastResult = await playBrowserSegment(segment, voiceName, token);
      if (!lastResult.ok) return lastResult;
    }
    if (!(await wait(segment.pauseAfterMs, token))) return lastResult;
  }
  return lastResult;
}

export function stopSpeech() {
  generation += 1;
  if (pauseTimer !== undefined) window.clearTimeout(pauseTimer);
  pauseTimer = undefined;
  activeSegmentCancel?.();
  activeSegmentCancel = null;
  if (speechWatchdog !== undefined) window.clearTimeout(speechWatchdog);
  speechWatchdog = undefined;
  activeUtterance = null;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio.src = "";
    activeAudio = null;
  }
  if (speechSupported()) window.speechSynthesis.cancel();
}

export function speak(
  text: string,
  options: SpeechOptions = {},
): Promise<PlaybackResult> {
  return playSegments(
    [
      {
        text,
        rate: options.rate ?? 0.8,
        pauseAfterMs: 0,
        audioPath: options.audioPath,
      },
    ],
    options.voiceName ?? "",
  );
}

export function teachingParts(item: CharacterItem) {
  const explanation =
    item.speech
      .replace(new RegExp(`^这个字念${item.char}[。！!，,]?`), "")
      .replace(/[。！!]$/, "") || item.meaning;
  return { intro: "这个字念", character: item.char, explanation };
}

export async function speakTeaching(
  item: CharacterItem,
  options: TeachingOptions = {},
): Promise<PlaybackResult> {
  const { intro, character, explanation } = teachingParts(item);
  const normalRate = options.rate ?? 0.8;
  stopSpeech();
  const token = generation;
  if (await playLocal(item.teachingAudio, token)) {
    const result: PlaybackResult = {
      ok: true,
      source: "local",
      blocked: false,
      voiceName: "本地自然语音",
    };
    lastPlaybackResult = result;
    return result;
  }
  return playSegments(
    [
      {
        text: intro,
        rate: normalRate,
        pauseAfterMs: options.introPauseMs ?? 600,
        audioPath: item.introAudio,
      },
      {
        text: character,
        rate: Math.min(0.7, Math.max(0.62, normalRate - 0.12)),
        pauseAfterMs: options.characterPauseMs ?? 900,
        audioPath: item.characterAudio,
      },
      {
        text: explanation,
        rate: normalRate,
        pauseAfterMs: 0,
        audioPath: item.explanationAudio,
      },
    ],
    options.voiceName ?? "",
  );
}
