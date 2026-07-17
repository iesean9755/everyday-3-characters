import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { courses } from "./data/courses";
import {
  PrimaryButton,
  ProgressDots,
  SpeakerButton,
} from "./components/Controls";
import { SceneArt } from "./components/SceneArt";
import {
  completeCourseGroup,
  completeLongTermReview,
  findNextCourseIndex,
  freshProgress,
  hasDueReview,
  loadProgress,
  recordCharacterAnswer,
  saveProgress,
  selectDifficultReviewKeys,
  selectLongTermReviewKeys,
} from "./lib/storage";
import { calculateActiveStreakFromDates } from "./lib/date";
import {
  ensureSpeechReady,
  getChineseVoices,
  getSpeechDiagnostics,
  initializeVoices,
  preloadAudio,
  speak,
  speakTeaching,
  stopSpeech,
  subscribeVoices,
  unlockSpeechFromUserGesture,
  type PlaybackResult,
  type PlaybackFailureReason,
} from "./lib/speech";
import type { Progress, Stage } from "./types";

const distractors = [
  "水",
  "木",
  "人",
  "大",
  "中",
  "天",
  "手",
  "白",
  "里",
  "山",
];
function App({ initialProgress }: { initialProgress?: Progress } = {}) {
  const [p, setP] = useState<Progress>(() => initialProgress ?? loadProgress());
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<"good" | "retry" | null>(null);
  const [soundHelp, setSoundHelp] = useState(false);
  const [voiceRevision, setVoiceRevision] = useState(0);
  const [storageOk, setStorageOk] = useState(true);
  const idleCount = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);
  const holdTimer = useRef<number | undefined>(undefined);
  const soundAttempt = useRef(0);
  const progressRef = useRef(p);
  const lastBackAt = useRef(0);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  progressRef.current = p;
  const course = courses[p.courseIndex % courses.length];
  const allItems = useMemo(() => courses.flatMap((c) => c.characters), []);
  const dailyItems = course.characters;
  const todayItems = useMemo(
    () =>
      p.todayLearnedCharacterIds
        .map((id) => allItems.find((item) => item.id === id))
        .filter((item): item is NonNullable<typeof item> => !!item),
    [allItems, p.todayLearnedCharacterIds],
  );
  const priorItems = useMemo(
    () =>
      p.reviewQueue
        .map((key) => allItems.find((x) => x.characterKey === key))
        .filter((x): x is NonNullable<typeof x> => !!x),
    [allItems, p.reviewQueue],
  );
  const longTermReviewKeys = useMemo(
    () =>
      p.reviewQueue.length
        ? p.reviewQueue
        : selectLongTermReviewKeys(p, p.date),
    [p],
  );
  const longTermReviewItems = useMemo(
    () =>
      longTermReviewKeys
        .map((key) => allItems.find((entry) => entry.characterKey === key))
        .filter((entry): entry is NonNullable<typeof entry> => !!entry),
    [allItems, longTermReviewKeys],
  );
  const difficultReviewKeys = useMemo(
    () => selectDifficultReviewKeys(p),
    [p],
  );
  const item =
    dailyItems[Math.min(Math.max(p.characterIndex, 0), dailyItems.length - 1)];
  const activeReviewItems = p.characterIndex === -1 ? priorItems : dailyItems;
  const hasMoreCourses = p.nextCourseIndex < courses.length;
  const maxReached =
    p.settings.maxDailyCharacters !== null &&
    p.todayPracticedCharacterKeys.length >= p.settings.maxDailyCharacters;
  const handlePlayback = useCallback((result: PlaybackResult) => {
    if (result.ok) setSoundHelp(false);
    else setSoundHelp(true);
    return result;
  }, []);
  const say = useCallback(
    async (text: string, audioPath?: string) => {
      const attempt = ++soundAttempt.current;
      const result = await speak(text, {
        rate: p.settings.speechRate,
        voiceName: p.settings.voiceName,
        audioPath,
      });
      return attempt === soundAttempt.current ? handlePlayback(result) : result;
    },
    [handlePlayback, p.settings.speechRate, p.settings.voiceName],
  );
  const sayTeaching = useCallback(async () => {
    const attempt = ++soundAttempt.current;
    const result = await speakTeaching(item, {
      rate: p.settings.speechRate,
      voiceName: p.settings.voiceName,
      introPauseMs: p.settings.introPauseMs,
      characterPauseMs: p.settings.characterPauseMs,
    });
    return attempt === soundAttempt.current ? handlePlayback(result) : result;
  }, [handlePlayback, item, p.settings]);
  const commit = useCallback((next: Progress) => {
    setP(next);
    setStorageOk(saveProgress(next));
  }, []);
  const go = useCallback(
    (stage: Stage, extra: Partial<Progress> = {}) => {
      if (locked) return;
      setLocked(true);
      soundAttempt.current += 1;
      setSoundHelp(false);
      stopSpeech();
      commit({ ...p, ...extra, stage });
      window.setTimeout(() => setLocked(false), 650);
    },
    [commit, locked, p],
  );
  const stageSpeech = useMemo(() => {
    switch (p.stage) {
      case "welcome":
      case "home":
        if (p.allNewCoursesCompleted)
          return "新字课程已经全部学完。接下来继续复习，记得更牢。";
        return p.dailyBaseGoalCompleted
          ? "您今天已经完成任务。想继续学习，请点中间的大按钮。"
          : "您好，今天我们认识三个字。请点一下屏幕中间的大圆按钮。";
      case "goal":
        return `今天我们学习${course.goal}，一共认识${dailyItems.length}个字。`;
      case "learn":
        return item.speech;
      case "quiz":
        return `请找出${item.char}字。`;
      case "review":
        return `请找出${activeReviewItems[p.reviewIndex]?.char ?? dailyItems[0].char}字。`;
      case "todayReview":
        return `请找出${todayItems[p.reviewIndex]?.char ?? todayItems[0]?.char ?? "刚学过的"}字。`;
      case "longTermReview":
        return `请找出${longTermReviewItems[p.reviewIndex]?.char ?? "要复习的"}字。`;
      case "reviewComplete":
        return "今天的复习已经完成，记得更牢了。";
      case "complete":
        return p.allNewCoursesCompleted
          ? "新字课程已经全部学完。接下来继续复习，记得更牢。"
          : "今天的三个字已经学会了。您可以今天学到这里，也可以再学三个新字。";
      case "rest":
        return "您今天已经学了不少，可以休息一下，明天再学。";
      default:
        return "";
    }
  }, [
    activeReviewItems,
    course,
    dailyItems,
    item,
    longTermReviewItems,
    p.allNewCoursesCompleted,
    p.dailyBaseGoalCompleted,
    p.reviewIndex,
    p.stage,
    todayItems,
  ]);
  const stageAudio = useMemo(() => {
    switch (p.stage) {
      case "welcome":
      case "home":
        return p.allNewCoursesCompleted
          ? undefined
          : "/audio/system/welcome.mp3";
      case "goal":
        return course.openingAudio;
      case "quiz":
        return item.questionAudio;
      case "review":
        return activeReviewItems[p.reviewIndex]?.questionAudio;
      case "todayReview":
        return todayItems[p.reviewIndex]?.questionAudio;
      case "longTermReview":
        return longTermReviewItems[p.reviewIndex]?.questionAudio;
      case "complete":
        return p.allNewCoursesCompleted ? undefined : course.completionAudio;
      default:
        return undefined;
    }
  }, [
    activeReviewItems,
    course,
    item,
    longTermReviewItems,
    p.allNewCoursesCompleted,
    p.reviewIndex,
    p.stage,
    todayItems,
  ]);
  const playCurrentStage = useCallback(
    () => (p.stage === "learn" ? sayTeaching() : say(stageSpeech, stageAudio)),
    [p.stage, say, sayTeaching, stageAudio, stageSpeech],
  );
  const playCurrentStageFromGesture = useCallback(() => {
    void unlockSpeechFromUserGesture();
    return playCurrentStage();
  }, [playCurrentStage]);
  const sayFromGesture = useCallback(
    (text: string, audioPath?: string) => {
      void unlockSpeechFromUserGesture();
      return say(text, audioPath);
    },
    [say],
  );
  const sayTeachingFromGesture = useCallback(() => {
    void unlockSpeechFromUserGesture();
    return sayTeaching();
  }, [sayTeaching]);
  useEffect(() => {
    const cleanupVoices = initializeVoices();
    const unsubscribe = subscribeVoices(() =>
      setVoiceRevision((value) => value + 1),
    );
    return () => {
      unsubscribe();
      cleanupVoices();
      stopSpeech();
    };
  }, []);
  useEffect(() => {
    const available = getChineseVoices();
    if (!available.length) return;
    if (!available.some((voice) => voice.name === p.settings.voiceName)) {
      commit({
        ...p,
        settings: { ...p.settings, voiceName: available[0].name },
      });
    }
    // voiceRevision 仅用于 voiceschanged 后重新检查设备音色。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRevision]);
  useEffect(() => {
    void preloadAudio([
      course.openingAudio,
      course.completionAudio,
      ...dailyItems.flatMap((entry) => [
        entry.teachingAudio,
        entry.introAudio,
        entry.characterAudio,
        entry.explanationAudio,
        entry.exampleAudio,
        entry.questionAudio,
        entry.successAudio,
        entry.retryAudio,
      ]),
    ]);
  }, [course, dailyItems]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-scale",
      String(p.settings.fontScale),
    );
    if (p.settings.autoPlay && stageSpeech) {
      const id = window.setTimeout(() => void playCurrentStage(), 350);
      return () => {
        clearTimeout(id);
        stopSpeech();
      };
    }
  }, [
    p.settings.autoPlay,
    p.settings.fontScale,
    playCurrentStage,
    stageSpeech,
  ]);
  useEffect(() => {
    const reset = () => {
      idleCount.current = 0;
      clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        if (
          idleCount.current < 2 &&
          p.stage !== "complete" &&
          p.stage !== "settings"
        ) {
          idleCount.current++;
          void say("请点一下屏幕，我们继续学习。");
        }
      }, 30000);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    return () => {
      clearTimeout(idleTimer.current);
      window.removeEventListener("pointerdown", reset);
    };
  }, [p.stage, say]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        stopSpeech();
        saveProgress(p);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [p]);
  useEffect(() => {
    const platform = Capacitor.getPlatform();
    document.documentElement.dataset.platform = platform;
    let active = true;
    const removers: Array<() => Promise<void>> = [];

    const setup = async () => {
      const status = await Network.getStatus();
      if (active) setIsOffline(!status.connected);
      const networkListener = await Network.addListener(
        "networkStatusChange",
        (next) => active && setIsOffline(!next.connected),
      );
      removers.push(() => networkListener.remove());

      if (!Capacitor.isNativePlatform()) return;
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
      if (platform === "android") {
        await StatusBar.setBackgroundColor({ color: "#f6f1e7" });
      }
      await SplashScreen.hide();

      const stateListener = await NativeApp.addListener(
        "appStateChange",
        ({ isActive }) => {
          document.documentElement.classList.toggle("app-background", !isActive);
          if (!isActive) {
            soundAttempt.current += 1;
            stopSpeech();
            saveProgress(progressRef.current);
          }
        },
      );
      removers.push(() => stateListener.remove());

      if (platform === "android") {
        const backListener = await NativeApp.addListener("backButton", () => {
          const now = Date.now();
          if (now - lastBackAt.current < 500) return;
          lastBackAt.current = now;
          const current = progressRef.current;
          soundAttempt.current += 1;
          stopSpeech();
          if (current.stage === "home" || current.stage === "welcome") {
            void NativeApp.exitApp();
            return;
          }
          const next: Progress = {
            ...current,
            stage: "home",
            characterIndex: 0,
            reviewIndex: 0,
          };
          setP(next);
          saveProgress(next);
        });
        removers.push(() => backListener.remove());
      }
    };
    void setup();
    return () => {
      active = false;
      removers.forEach((remove) => void remove());
    };
  }, []);
  const start = () => {
    void unlockSpeechFromUserGesture();
    go("goal", {
      courseIndex: Math.min(p.nextCourseIndex, courses.length - 1),
      characterIndex: 0,
      reviewIndex: 0,
    });
  };
  const goHome = () => go("home", { characterIndex: 0, reviewIndex: 0 });
  const startNextGroup = (afterRest = false) => {
    if (!hasMoreCourses || maxReached) return goHome();
    if (
      !afterRest &&
      p.todayExtraGroupCount > 0 &&
      p.currentExtraGroupProgress >= 2
    ) {
      go("rest");
      return;
    }
    go("goal", {
      courseIndex: p.nextCourseIndex,
      characterIndex: 0,
      reviewIndex: 0,
      reviewIds: [],
      reviewQueue: [],
      currentExtraGroupProgress: afterRest ? 0 : p.currentExtraGroupProgress,
    });
  };
  const begin = () => {
    void unlockSpeechFromUserGesture();
    return priorItems.length
      ? go("review", { characterIndex: -1, reviewIndex: 0 })
      : go("learn", { characterIndex: 0 });
  };
  const afterLearn = () => go("quiz");
  const finishCurrentGroup = (answeredProgress: Progress) => {
    go(
      "complete",
      completeCourseGroup(
        answeredProgress,
        course,
        answeredProgress.answerStats,
      ),
    );
  };
  const answer = (choice: string, target = item.char, isReview = false) => {
    if (locked) return;
    void unlockSpeechFromUserGesture();
    const reviewItem = activeReviewItems[p.reviewIndex];
    const id = isReview ? reviewItem.id : item.id;
    const answered = recordCharacterAnswer(
      p,
      (isReview ? reviewItem : item).characterKey,
      choice === target,
      id,
      isReview && p.characterIndex === -1 ? "scheduled" : "none",
    );
    if (choice === target) {
      setFeedback("good");
      void say(
        `找对了，这个字念${target}。`,
        (isReview ? reviewItem : item).successAudio,
      );
      window.setTimeout(() => {
        setFeedback(null);
        if (isReview) {
          const next = p.reviewIndex + 1;
          if (next >= activeReviewItems.length) {
            if (p.characterIndex === -1)
              go("learn", {
                ...answered,
                characterIndex: 0,
                reviewIndex: 0,
                reviewIds: [],
                reviewQueue: [],
              });
            else finishCurrentGroup(answered);
          } else go("review", { ...answered, reviewIndex: next });
        } else {
          const next = p.characterIndex + 1;
          if (next >= dailyItems.length)
            go("review", { ...answered, reviewIndex: 0 });
          else go("learn", { ...answered, characterIndex: next });
        }
      }, 1050);
    } else {
      setFeedback("retry");
      commit(answered);
      void say(
        `没关系，我们再看一次。这个字念${target}。`,
        (isReview ? reviewItem : item).retryAudio,
      );
      window.setTimeout(() => setFeedback(null), 1800);
    }
  };
  const answerTodayReview = (choice: string) => {
    if (locked || !todayItems.length) return;
    void unlockSpeechFromUserGesture();
    const reviewItem = todayItems[p.reviewIndex];
    const answered = recordCharacterAnswer(
      p,
      reviewItem.characterKey,
      choice === reviewItem.char,
      reviewItem.id,
      "practice",
    );
    if (choice === reviewItem.char) {
      setFeedback("good");
      void say(`找对了，这个字念${reviewItem.char}。`, reviewItem.successAudio);
      window.setTimeout(() => {
        setFeedback(null);
        const next = p.reviewIndex + 1;
        if (next >= todayItems.length)
          go("home", { ...answered, reviewIndex: 0 });
        else go("todayReview", { ...answered, reviewIndex: next });
      }, 900);
    } else {
      setFeedback("retry");
      commit(answered);
      void say(
        `没关系，我们再看一次。这个字念${reviewItem.char}。`,
        reviewItem.retryAudio,
      );
      window.setTimeout(() => setFeedback(null), 1500);
    }
  };
  const startTodayReview = () => {
    if (todayItems.length) go("todayReview", { reviewIndex: 0 });
  };
  const startLongTermReview = (keys = longTermReviewKeys) => {
    const queue = [...new Set(keys)].slice(0, 3);
    if (!queue.length) return;
    void unlockSpeechFromUserGesture();
    go("longTermReview", {
      reviewQueue: queue,
      reviewIndex: 0,
      characterIndex: -1,
    });
  };
  const answerLongTermReview = (choice: string) => {
    if (locked || !longTermReviewItems.length) return;
    void unlockSpeechFromUserGesture();
    const reviewItem = longTermReviewItems[p.reviewIndex];
    const correct = choice === reviewItem.char;
    const reviewMode = hasDueReview(
      p.reviewPlan[reviewItem.characterKey],
      p.date,
    )
      ? "scheduled"
      : "practice";
    const answered = recordCharacterAnswer(
      p,
      reviewItem.characterKey,
      correct,
      reviewItem.id,
      reviewMode,
    );
    if (correct) {
      setFeedback("good");
      void say(`找对了，这个字念${reviewItem.char}。`, reviewItem.successAudio);
      window.setTimeout(() => {
        setFeedback(null);
        const next = p.reviewIndex + 1;
        if (next >= longTermReviewItems.length) {
          go(
            "reviewComplete",
            completeLongTermReview(answered, p.reviewQueue),
          );
        } else {
          go("longTermReview", { ...answered, reviewIndex: next });
        }
      }, 900);
    } else {
      setFeedback("retry");
      commit(answered);
      void say(
        `没关系，我们再看一次。这个字念${reviewItem.char}。`,
        reviewItem.retryAudio,
      );
      window.setTimeout(() => setFeedback(null), 1500);
    }
  };
  const options = (target: string, index: number) =>
    index % 2
      ? [distractors[(p.courseIndex + index) % distractors.length], target]
      : [target, distractors[(p.courseIndex + index) % distractors.length]];
  const familyStart = () => {
    holdTimer.current = window.setTimeout(() => go("settings"), 3000);
  };
  const familyEnd = () => clearTimeout(holdTimer.current);
  if (p.stage === "settings")
    return (
      <Settings
        progress={p}
        onSave={(next) =>
          commit({
            ...next,
            stage:
              p.allNewCoursesCompleted || p.dailyBaseGoalCompleted
                ? "home"
                : "goal",
          })
        }
        onClose={() =>
          go(
            p.allNewCoursesCompleted || p.dailyBaseGoalCompleted
              ? "home"
              : "goal",
          )
        }
        onAction={commit}
      />
    );
  return (
    <main className={`app stage-${p.stage}`}>
      {isOffline && (
        <div className="offline-banner" role="status">
          当前无网络，本地课程仍可学习
        </div>
      )}
      <button
        className="family-entry"
        aria-label="家人设置，长按三秒"
        onPointerDown={familyStart}
        onPointerUp={familyEnd}
        onPointerLeave={familyEnd}
      >
        ⌂
      </button>
      {!storageOk && (
        <div className="gentle-warning" role="status">
          ⚠️ 学习记录暂时没有保存，请保持页面打开
        </div>
      )}
      {soundHelp && (
        <div className="sound-help-overlay" role="presentation">
          <button
            className="sound-help"
            onClick={() => {
              setSoundHelp(false);
              void playCurrentStageFromGesture();
            }}
            aria-label="声音没有播放，点这里开启声音"
          >
            <span>🔊</span>
            <small>点这里听声音</small>
          </button>
        </div>
      )}
      {(p.stage === "welcome" || p.stage === "home") &&
        p.allNewCoursesCompleted && (
          <section className="center completed-home curriculum-complete">
            <div className="complete-mark" aria-hidden="true">
              ✓
            </div>
            <h1>新字课程已经全部学完</h1>
            <p>接下来继续复习，记得更牢</p>
            <PrimaryButton
              onClick={() => startLongTermReview()}
              label="开始今日复习"
              icon="↻"
              disabled={locked || !longTermReviewItems.length}
            />
            <button
              className="review-today"
              onClick={() => startLongTermReview(difficultReviewKeys)}
              disabled={locked || !difficultReviewKeys.length}
              aria-label="复习容易答错的字"
            >
              <span aria-hidden="true">★</span> 复习容易答错的字
            </button>
            <SpeakerButton
              onClick={() => void playCurrentStageFromGesture()}
              label="听一遍提示"
            />
          </section>
        )}
      {(p.stage === "welcome" || p.stage === "home") &&
        !p.allNewCoursesCompleted &&
        !p.dailyBaseGoalCompleted && (
          <section className="center">
            <div className="brand-tree" aria-hidden="true">
              🌳
            </div>
            <h1>每天认3个字</h1>
            <p>听声音，看图，认生活里的字</p>
            <button
              className="start-orb"
              onClick={start}
              disabled={locked}
              aria-label="开始今天的学习"
            >
              <span>▶</span>
            </button>
            <SpeakerButton
              onClick={() => void playCurrentStageFromGesture()}
              label="听一听"
            />
          </section>
        )}
      {(p.stage === "welcome" || p.stage === "home") &&
        !p.allNewCoursesCompleted &&
        p.dailyBaseGoalCompleted && (
          <section className="center completed-home">
            <div className="complete-mark" aria-hidden="true">
              ✓
            </div>
            <h1>今天的目标已完成</h1>
            <p>
              {p.todayNewCharacterKeys.length > 0
                ? `今天新认识${p.todayNewCharacterKeys.length}个字，练习了${p.todayPracticedCharacterKeys.length}个字。`
                : `今天复习了${p.todayPracticedCharacterKeys.length}个字，没有增加新的汉字。`}
            </p>
            {hasMoreCourses && !maxReached ? (
              <PrimaryButton
                onClick={() => startNextGroup()}
                label="继续学3个"
                icon="➜"
                disabled={locked}
              />
            ) : (
              <p className="limit-message">
                {hasMoreCourses
                  ? "今天已经达到家人设置的学习量。"
                  : "全部课程已经学完。"}
              </p>
            )}
            <button
              className="review-today"
              onClick={startTodayReview}
              disabled={!todayItems.length || locked}
              aria-label="复习今天学过的字"
            >
              <span aria-hidden="true">↻</span> 复习今天的字
            </button>
            <SpeakerButton
              onClick={() => void playCurrentStageFromGesture()}
              label="听一听"
            />
          </section>
        )}
      {p.stage === "goal" && (
        <section>
          <ProgressDots current={0} total={dailyItems.length} />
          <h1>{course.goal}</h1>
          <SceneArt
            icon={course.icon}
            theme={course.theme}
            label={course.scene}
            onClick={() => void playCurrentStageFromGesture()}
          />
          <PrimaryButton
            onClick={begin}
            label={priorItems.length ? "先复习到期汉字" : "开始学习"}
            disabled={locked}
          />
          <SpeakerButton onClick={() => void playCurrentStageFromGesture()} />
        </section>
      )}
      {p.stage === "learn" && (
        <section>
          <ProgressDots current={p.characterIndex} total={dailyItems.length} />
          <div className="step-label">
            第 {p.characterIndex + 1} 个，共 {dailyItems.length} 个
          </div>
          <SceneArt
            icon={course.icon}
            theme={course.theme}
            label={item.scene}
            onClick={() => void sayTeachingFromGesture()}
          />
          <button
            className="character-card"
            onClick={() => void sayTeachingFromGesture()}
            aria-label={`${item.char}，点击重听`}
          >
            <strong>{item.char}</strong>
            <span>{item.pinyin}</span>
          </button>
          <p className="example">{item.example}</p>
          <PrimaryButton
            onClick={afterLearn}
            label="我看清了"
            icon="➜"
            disabled={locked}
          />
          <SpeakerButton onClick={() => void sayTeachingFromGesture()} />
        </section>
      )}
      {p.stage === "quiz" && (
        <Quiz
          title={`请找出“${item.char}”`}
          target={item.char}
          choices={options(item.char, p.characterIndex)}
          feedback={feedback}
          disabled={locked}
          onAnswer={(c) => answer(c)}
          onSpeak={() => void sayFromGesture(stageSpeech, item.questionAudio)}
        />
      )}
      {p.stage === "review" &&
        (() => {
          const q = activeReviewItems[p.reviewIndex] ?? dailyItems[0];
          return (
            <Quiz
              title={
                p.characterIndex === -1
                  ? "先复习到期汉字"
                  : "听一听，找出刚学的字"
              }
              target={q.char}
              choices={options(q.char, p.reviewIndex + 1)}
              feedback={feedback}
              disabled={locked}
              onAnswer={(c) => answer(c, q.char, true)}
              onSpeak={() =>
                void sayFromGesture(`请找出${q.char}字。`, q.questionAudio)
              }
            />
          );
        })()}
      {p.stage === "todayReview" &&
        (() => {
          const q = todayItems[p.reviewIndex] ?? todayItems[0];
          if (!q) return null;
          return (
            <Quiz
              title={`复习今天的字（${p.reviewIndex + 1}/${todayItems.length}）`}
              target={q.char}
              choices={options(q.char, p.reviewIndex + 1)}
              feedback={feedback}
              disabled={locked}
              onAnswer={answerTodayReview}
              onSpeak={() =>
                void sayFromGesture(`请找出${q.char}字。`, q.questionAudio)
              }
            />
          );
        })()}
      {p.stage === "longTermReview" &&
        (() => {
          const q = longTermReviewItems[p.reviewIndex];
          if (!q) return null;
          return (
            <Quiz
              title={`今日复习（${p.reviewIndex + 1}/${longTermReviewItems.length}）`}
              target={q.char}
              choices={options(q.char, p.reviewIndex + 1)}
              feedback={feedback}
              disabled={locked}
              onAnswer={answerLongTermReview}
              onSpeak={() =>
                void sayFromGesture(`请找出${q.char}字。`, q.questionAudio)
              }
            />
          );
        })()}
      {p.stage === "reviewComplete" && (
        <section className="complete">
          <div className="complete-mark">✓</div>
          <h1>今天的复习完成了</h1>
          <p>今天复习了 {p.todayPracticedCharacterKeys.length} 个字</p>
          <p>没有增加新的汉字</p>
          <div className="tree-growth">
            <span aria-hidden="true">🌳</span>
            <b>连续学习 {p.streak} 天</b>
            <small>累计完成 {p.completedDates.length} 天</small>
          </div>
          <PrimaryButton
            onClick={goHome}
            label="返回首页"
            icon="⌂"
            disabled={locked}
          />
          <SpeakerButton
            onClick={() => void playCurrentStageFromGesture()}
            label="再听一遍"
          />
        </section>
      )}
      {p.stage === "complete" && (
        <section className="complete">
          <div className="complete-mark">✓</div>
          <h1>
            {course.courseType === "review"
              ? `今天复习了${new Set(dailyItems.map((item) => item.characterKey)).size}个字`
              : `今天新认识${p.todayNewCharacterKeys.length}个字`}
          </h1>
          <div className="learned-row">
            {dailyItems.map((c) => (
              <div key={c.id}>
                <span>{c.char}</span>
                <small>{course.icon}</small>
              </div>
            ))}
          </div>
          <div className="tree-growth">
            <span aria-hidden="true">🌳</span>
            <b>连续学习 {p.streak} 天</b>
            <small>累计完成 {p.completedDates.length} 天</small>
          </div>
          {course.courseType === "review" && <p>没有增加新的汉字</p>}
          <p>
            {p.todayNewCharacterKeys.length > 0 &&
            p.todayPracticedCharacterKeys.length >
              p.todayNewCharacterKeys.length
              ? `今天新认识${p.todayNewCharacterKeys.length}个字，练习了${p.todayPracticedCharacterKeys.length}个字`
              : p.todayNewCharacterKeys.length > 0
                ? `今天新认识${p.todayNewCharacterKeys.length}个字`
                : `今天练习了${p.todayPracticedCharacterKeys.length}个字`}
          </p>
          {hasMoreCourses && !maxReached && (
            <PrimaryButton
              onClick={() => startNextGroup()}
              label="继续学3个"
              icon="➜"
              disabled={locked}
            />
          )}
          <button
            className="today-done"
            onClick={goHome}
            disabled={locked}
            aria-label="今天到这里，返回首页"
          >
            <span aria-hidden="true">⌂</span> 今天到这里
          </button>
          <button
            className="review-today compact"
            onClick={startTodayReview}
            disabled={!todayItems.length || locked}
            aria-label="复习今天学过的字"
          >
            <span aria-hidden="true">↻</span> 复习今天学过的字
          </button>
          <SpeakerButton
            onClick={() =>
              void sayFromGesture(
                stageSpeech,
                p.allNewCoursesCompleted ? undefined : course.completionAudio,
              )
            }
            label="再听一遍"
          />
        </section>
      )}
      {p.stage === "rest" && (
        <section className="center rest-page">
          <div className="rest-icon" aria-hidden="true">
            🍵
          </div>
          <h1>今天学了不少</h1>
          <p>可以休息一下，明天再学。</p>
          <PrimaryButton
            onClick={goHome}
            label="今天到这里"
            icon="⌂"
            disabled={locked}
          />
          <button
            className="continue-secondary"
            onClick={() => startNextGroup(true)}
            disabled={locked || maxReached || !hasMoreCourses}
            aria-label="我还想继续学习三个新字"
          >
            <span aria-hidden="true">➜</span> 我还想继续
          </button>
          <SpeakerButton
            onClick={() => void playCurrentStageFromGesture()}
            label="再听一遍"
          />
        </section>
      )}
    </main>
  );
}
function Quiz({
  title,
  target,
  choices,
  feedback,
  disabled,
  onAnswer,
  onSpeak,
}: {
  title: string;
  target: string;
  choices: string[];
  feedback: "good" | "retry" | null;
  disabled: boolean;
  onAnswer: (c: string) => void;
  onSpeak: () => void;
}) {
  return (
    <section className="quiz">
      <h1>{title}</h1>
      <div className="choice-grid">
        {choices.map((c) => (
          <button
            key={c}
            disabled={disabled}
            onClick={() => onAnswer(c)}
            className={feedback && c === target ? "highlight" : ""}
            aria-label={`选择${c}字`}
          >
            <span>{c}</span>
            {feedback === "good" && c === target && <b>✓</b>}
          </button>
        ))}
      </div>
      <div className="feedback" aria-live="assertive">
        {feedback === "good"
          ? "找对了！"
          : feedback === "retry"
            ? "没关系，再看一次"
            : " "}
      </div>
      <SpeakerButton onClick={onSpeak} />
    </section>
  );
}
function Settings({
  progress,
  onSave,
  onClose,
  onAction,
}: {
  progress: Progress;
  onSave: (p: Progress) => void;
  onClose: () => void;
  onAction: (p: Progress) => void;
}) {
  const [s, setS] = useState(progress.settings);
  const [voiceOptions, setVoiceOptions] = useState(() => getChineseVoices());
  const [previewMessage, setPreviewMessage] = useState("");
  const [lastPlayback, setLastPlayback] = useState<PlaybackResult | null>(
    () => getSpeechDiagnostics(progress.settings.voiceName).lastResult,
  );
  useEffect(() => {
    const update = () => setVoiceOptions(getChineseVoices());
    const cleanupVoices = initializeVoices();
    const unsubscribe = subscribeVoices(update);
    update();
    void ensureSpeechReady().then(update);
    return () => {
      unsubscribe();
      cleanupVoices();
      stopSpeech();
    };
  }, []);
  const validVoiceName = voiceOptions.some(
    (voice) => voice.name === s.voiceName,
  )
    ? s.voiceName
    : (voiceOptions[0]?.name ?? "");
  const diagnostics = getSpeechDiagnostics(validVoiceName);
  const failureLabels: Record<PlaybackFailureReason, string> = {
    unsupported: "当前设备不支持浏览器语音",
    blocked: "浏览器阻止了声音播放",
    timeout: "朗读等待超时",
    "voice-unavailable": "选择的声音当前不可用",
    "playback-error": "浏览器朗读失败",
    cancelled: "朗读已停止",
  };
  const previewSound = async (text: string, voiceName = validVoiceName) => {
    void unlockSpeechFromUserGesture();
    const result = await speak(text, {
      rate: s.speechRate,
      voiceName,
    });
    setLastPlayback(result);
    setPreviewMessage(
      result.ok
        ? `正在使用：${result.voiceName}`
        : "当前设备没有成功播放声音，请检查媒体音量或更换浏览器。",
    );
    return result;
  };
  const restoreSound = async () => {
    const available = getChineseVoices();
    const voiceName = available.some((voice) => voice.name === s.voiceName)
      ? s.voiceName
      : (available[0]?.name ?? "");
    const settings = { ...s, autoPlay: true, voiceName };
    setS(settings);
    onAction({ ...progress, settings });
    await previewSound("您好，声音已经恢复。", voiceName);
  };
  const stats = Object.entries(progress.lifetimeAnswerStats)
    .filter(([, v]) => v.wrong > 0)
    .sort((a, b) => {
      const wrongDifference = b[1].wrong - a[1].wrong;
      if (wrongDifference) return wrongDifference;
      const recentDifference = b[1].lastAnsweredDate.localeCompare(
        a[1].lastAnsweredDate,
      );
      if (recentDifference) return recentDifference;
      const accuracy = (value: (typeof a)[1]) =>
        value.correct / Math.max(1, value.correct + value.wrong);
      return accuracy(a[1]) - accuracy(b[1]);
    })
    .slice(0, 8);
  const reExperienceToday = () => {
    if (progress.allNewCoursesCompleted) {
      onAction({
        ...progress,
        stage: "home",
        reviewIndex: 0,
        reviewQueue: selectLongTermReviewKeys(progress, progress.date),
        settings: s,
      });
      return;
    }
    const currentIds = new Set(
      courses[progress.courseIndex]?.characters.map((item) => item.id) ?? [],
    );
    onAction({
      ...progress,
      stage: "goal",
      characterIndex: 0,
      reviewIndex: 0,
      reviewIds: [],
      answerStats: Object.fromEntries(
        Object.entries(progress.answerStats).filter(
          ([id]) => !currentIds.has(id),
        ),
      ),
      settings: s,
    });
  };
  const clearToday = () => {
    if (!confirm("确定清除今天的学习记录吗？长期历史和家人设置会保留。"))
      return;
    const todayNewKeySet = new Set(progress.todayNewCharacterKeys);
    const todayNewItemIds = progress.todayLearnedCharacterIds.filter((id) =>
      courses
        .flatMap((entry) => entry.characters)
        .some(
          (item) => item.id === id && todayNewKeySet.has(item.characterKey),
        ),
    );
    const todaySet = new Set(todayNewItemIds);
    const totalIds = progress.totalLearnedCharacterIds.filter(
      (id) => !todaySet.has(id),
    );
    const earliestTodayCourse = todayNewItemIds.length
      ? Math.max(
          0,
          Math.min(
            ...todayNewItemIds.map(
              (id) => Number(id.match(/^d(\d+)-/)?.[1] ?? 1) - 1,
            ),
          ),
        )
      : progress.nextCourseIndex;
    const completedDates = progress.completedDates
      .filter((date) => date !== progress.date)
      .sort();
    const totalKeys = progress.totalLearnedCharacterKeys.filter(
      (key) => !todayNewKeySet.has(key),
    );
    const reviewPlan = Object.fromEntries(
      Object.entries(progress.reviewPlan).filter(
        ([key]) => !todayNewKeySet.has(key),
      ),
    );
    const nextCourseIndex = findNextCourseIndex(
      totalIds,
      earliestTodayCourse,
    );
    const allNewCoursesCompleted = nextCourseIndex >= courses.length;
    const dailyStats = { ...progress.dailyStats };
    delete dailyStats[progress.date];
    onAction({
      ...progress,
      stage: allNewCoursesCompleted ? "home" : "welcome",
      courseIndex: earliestTodayCourse,
      characterIndex: 0,
      reviewIndex: 0,
      answerStats: Object.fromEntries(
        Object.entries(progress.answerStats).filter(
          ([id]) => !todaySet.has(id),
        ),
      ),
      todayAnswerStats: {},
      reviewIds: [],
      reviewQueue: [],
      reviewPlan,
      learnedIds: totalIds,
      totalLearnedCharacterIds: totalIds,
      totalLearnedCharacterKeys: totalKeys,
      nextCourseIndex,
      allNewCoursesCompleted,
      completedToday: false,
      dailyBaseGoalCompleted: false,
      todayLearnedCharacterIds: [],
      todayNewCharacterKeys: [],
      todayPracticedCharacterKeys: [],
      todayNewCharacterCount: 0,
      todayExtraGroupCount: 0,
      currentExtraGroupProgress: 0,
      streak: calculateActiveStreakFromDates(completedDates, progress.date),
      lastCompletedDate: completedDates.at(-1) ?? "",
      completedDates,
      dailyStats,
      settings: s,
    });
  };
  const skipToNextGroup = () => {
    if (progress.allNewCoursesCompleted) {
      onAction({ ...progress, stage: "home", settings: s });
      return;
    }
    const next = Math.min(progress.nextCourseIndex + 1, courses.length - 1);
    onAction({
      ...progress,
      stage: "goal",
      courseIndex: next,
      nextCourseIndex: next,
      characterIndex: 0,
      reviewIndex: 0,
      reviewIds: [],
      settings: s,
    });
  };
  const restoreAll = () => {
    if (!confirm("确定恢复全部课程吗？所有学习记录都会清除，家人设置会保留。"))
      return;
    onAction({ ...freshProgress(), settings: s });
  };
  return (
    <main className="settings">
      <header>
        <h1>家人设置</h1>
        <button onClick={onClose} aria-label="关闭家人设置">
          关闭
        </button>
      </header>
      <label>
        每天基础目标
        <strong>3 个字</strong>
      </label>
      <label>
        每天最多学习量
        <select
          value={s.maxDailyCharacters ?? "unlimited"}
          onChange={(e) =>
            setS({
              ...s,
              maxDailyCharacters:
                e.target.value === "unlimited"
                  ? null
                  : (Number(e.target.value) as 3 | 6 | 9 | 15),
            })
          }
        >
          <option value="3">只完成基础3个字</option>
          <option value="6">最多6个字</option>
          <option value="9">最多9个字</option>
          <option value="15">最多15个字</option>
          <option value="unlimited">不限制</option>
        </select>
      </label>
      <label>
        语音速度
        <input
          type="range"
          min="0.55"
          max="1"
          step="0.05"
          value={s.speechRate}
          onChange={(e) => setS({ ...s, speechRate: Number(e.target.value) })}
        />
      </label>
      <label>
        中文声音
        <select
          value={
            voiceOptions.some((voice) => voice.name === s.voiceName)
              ? s.voiceName
              : (voiceOptions[0]?.name ?? "")
          }
          onChange={(e) => setS({ ...s, voiceName: e.target.value })}
          disabled={!voiceOptions.length}
        >
          {!voiceOptions.length && <option value="">系统默认声音</option>}
          {voiceOptions.map((voice) => (
            <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
              {voice.label}
            </option>
          ))}
        </select>
      </label>
      <section className="sound-diagnostics" aria-labelledby="sound-check-title">
        <h2 id="sound-check-title">声音检查</h2>
        <dl>
          <div>
            <dt>浏览器语音</dt>
            <dd>{diagnostics.supported ? "当前设备支持" : "当前设备不支持"}</dd>
          </div>
          <div>
            <dt>中文声音</dt>
            <dd>找到 {diagnostics.chineseVoiceCount} 个</dd>
          </div>
          <div>
            <dt>当前选择</dt>
            <dd>{diagnostics.selectedVoiceName}</dd>
          </div>
          <div>
            <dt>自动播放</dt>
            <dd>{s.autoPlay ? "已开启" : "已关闭"}</dd>
          </div>
          <div>
            <dt>最近一次使用</dt>
            <dd>
              {lastPlayback?.source === "local"
                ? "本地语音"
                : lastPlayback?.source === "browser"
                  ? "浏览器语音"
                  : "尚未成功播放"}
            </dd>
          </div>
          <div>
            <dt>最近一次失败原因</dt>
            <dd>
              {lastPlayback?.reason
                ? failureLabels[lastPlayback.reason]
                : "暂无"}
            </dd>
          </div>
        </dl>
        <div className="voice-preview">
          <button
            type="button"
            onClick={() => void previewSound("您好，这是现在选择的声音。")}
          >
            🔊 试听声音
          </button>
          <button type="button" onClick={() => void restoreSound()}>
            ↻ 一键恢复声音
          </button>
        </div>
        <p role="status">
          {previewMessage ||
            (voiceOptions.length
              ? `当前设备找到 ${voiceOptions.length} 个中文声音`
              : "当前设备没有中文声音，将使用系统默认声音")}
        </p>
      </section>
      <label>
        目标字前停顿
        <select
          value={s.introPauseMs}
          onChange={(e) => setS({ ...s, introPauseMs: Number(e.target.value) })}
        >
          <option value="400">短（0.4秒）</option>
          <option value="600">标准（0.6秒）</option>
          <option value="800">长（0.8秒）</option>
        </select>
      </label>
      <label>
        目标字后停顿
        <select
          value={s.characterPauseMs}
          onChange={(e) =>
            setS({ ...s, characterPauseMs: Number(e.target.value) })
          }
        >
          <option value="700">短（0.7秒）</option>
          <option value="900">标准（0.9秒）</option>
          <option value="1200">长（1.2秒）</option>
        </select>
      </label>
      <label>
        字体大小
        <input
          type="range"
          min="1"
          max="1.3"
          step="0.1"
          value={s.fontScale}
          onChange={(e) => setS({ ...s, fontScale: Number(e.target.value) })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.autoPlay}
          onChange={(e) => setS({ ...s, autoPlay: e.target.checked })}
        />
        自动播放语音
      </label>
      <label>
        每日提醒时间
        <input
          type="time"
          value={s.reminderTime}
          onChange={(e) => setS({ ...s, reminderTime: e.target.value })}
        />
      </label>
      <section className="records">
        <h2>最近学习</h2>
        <p>
          连续学习 {progress.streak} 天 · 累计完成 {progress.completedDates.length} 天 · 认识{" "}
          {progress.totalLearnedCharacterKeys.length} 个字
        </p>
        <h2>需要多复习</h2>
        <p>
          {stats.length
            ? stats
                .map(([characterKey]) => characterKey)
                .join("、")
            : "暂时没有"}
        </p>
      </section>
      <button
        className="save-settings"
        onClick={() => {
          onSave({ ...progress, settings: s });
        }}
      >
        保存设置
      </button>
      <section className="test-tools">
        <h2>测试工具</h2>
        <p>以下入口只供家人和开发测试使用。</p>
        <button onClick={reExperienceToday}>重新体验今天课程</button>
        <button onClick={clearToday}>清除今日学习记录</button>
        <button onClick={skipToNextGroup}>跳到下一组课程</button>
        <button className="danger" onClick={restoreAll}>
          恢复全部课程
        </button>
      </section>
    </main>
  );
}
export default App;
