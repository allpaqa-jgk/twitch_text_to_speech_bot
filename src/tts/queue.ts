import type { TTSEngine, PreparedAudio, SpeechOptions } from "./engine";
import { AudioPlaybackController, type PlaybackController } from "./playbackController";
import { TTSQueuePolicy } from "./queuePolicy";
import { SettingsStore, settingsStore, type Settings } from "../settingsStore";
import { EngineHolder, type EngineSet } from "./engineHolder";

export interface Pin {
  settings: Settings;
  engines: EngineSet;
  release(): void;
}

export interface EnqueueOptions {
  engine?: TTSEngine;
  enqueuedAt?: number;
  bypassAcceleration?: boolean; // 加速を行わず 1.0 倍速で固定
  bypassTtl?: boolean;          // 30秒期限切れによるスキップ対象外にする
  pin?: Pin;
  settings?: Settings;
}

const ENQUEUE_OPTION_KEYS = new Set([
  "engine",
  "enqueuedAt",
  "bypassAcceleration",
  "bypassTtl",
  "pin",
  "settings",
]);

function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export interface QueueItem {
  id: string;
  text: string;
  enqueuedAt: number;
  speedScale?: number;
  bypassAcceleration?: boolean;
  bypassTtl?: boolean;
  engine: TTSEngine;
  settings: Settings;
  resolve: () => void;
  preparedPromise?: Promise<PreparedAudio>;
}

export interface TTSQueueDeps {
  store?: SettingsStore;
  engineHolder?: EngineHolder;
}

export class TTSQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private isCleared = false;
  private isSynthesizing = false;
  private isPlayingAudio = false;
  private currentRunningEngine?: TTSEngine;
  private defaultEngine: TTSEngine;
  private maxQueueSize: number;
  private playback: PlaybackController;
  private policy: TTSQueuePolicy;
  private store: SettingsStore;
  private engineHolder: EngineHolder;
  private unreleasedPins = new Set<{ engines: EngineSet }>();
  private inFlightPrepares = new Map<Promise<unknown>, TTSEngine>();
  private idleListeners = new Set<() => void>();
  private releaseListeners = new Set<() => void>();

  constructor(
    defaultEngine: TTSEngine,
    maxQueueSize = 50,
    playback: PlaybackController = new AudioPlaybackController(),
    policy?: TTSQueuePolicy,
    deps: { store?: SettingsStore; engineHolder?: EngineHolder } = {}
  ) {
    this.defaultEngine = defaultEngine;
    this.maxQueueSize = maxQueueSize;
    this.playback = playback;
    this.store = deps.store ?? settingsStore;
    this.policy = policy ?? new TTSQueuePolicy(this.store);
    this.engineHolder =
      deps.engineHolder ??
      new EngineHolder({
        primary: defaultEngine,
        primaryName: this.store.current().TTS_ENGINE,
      });
  }

  public setDefaultEngine(engine: TTSEngine) {
    this.defaultEngine = engine;
  }

  public getDefaultEngine(): TTSEngine {
    return this.defaultEngine;
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  private logError(engine: TTSEngine, text: string, err: unknown): void {
    const message =
      err && typeof err === "object" && "message" in err
        ? (err as { message?: unknown }).message
        : undefined;
    const errStr = String(message || err);
    if (this.policy.isTransientConnectionOrTimeoutError(err)) {
      console.warn(
        `⚠️  [TTSQueue] 音声エンジン (${engine.name}) に接続できませんでした: "${text}" (理由: ${errStr})。アプリが起動しているか確認してください。`
      );
    } else {
      console.error(`[TTSQueue] Error speaking "${text}":`, message || err);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public isIdle(): boolean {
    return (
      !this.isProcessing &&
      this.queue.length === 0 &&
      this.unreleasedPins.size === 0 &&
      this.inFlightPrepares.size === 0
    );
  }

  public isInUse(engine: TTSEngine): boolean {
    for (const token of this.unreleasedPins) {
      if (token.engines.primary === engine || token.engines.english === engine) {
        return true;
      }
    }
    if (this.queue.some((item) => item.engine === engine)) {
      return true;
    }
    if (this.currentRunningEngine === engine) {
      return true;
    }
    for (const prepEngine of this.inFlightPrepares.values()) {
      if (prepEngine === engine) {
        return true;
      }
    }
    return false;
  }

  public onIdle(fn: () => void): () => void {
    this.idleListeners.add(fn);
    return () => {
      this.idleListeners.delete(fn);
    };
  }

  public onRelease(fn: () => void): () => void {
    this.releaseListeners.add(fn);
    return () => {
      this.releaseListeners.delete(fn);
    };
  }

  private notifyUseEnded(): void {
    queueMicrotask(() => {
      for (const listener of [...this.releaseListeners]) {
        try {
          listener();
        } catch (err) {
          console.error("[TTSQueue] onRelease listener error:", err);
        }
      }
      if (this.isIdle()) {
        for (const listener of [...this.idleListeners]) {
          try {
            if (this.isIdle()) {
              listener();
            }
          } catch (err) {
            console.error("[TTSQueue] onIdle listener error:", err);
          }
        }
      }
    });
  }

  private trackPrepare(promise: Promise<unknown>, engine: TTSEngine): void {
    this.inFlightPrepares.set(promise, engine);
    promise
      .finally(() => {
        this.inFlightPrepares.delete(promise);
        this.notifyUseEnded();
      })
      .catch(() => {});
  }

  public pin(): Pin {
    const settings = this.store.current();
    const engines = this.engineHolder.current();
    let released = false;
    const token = { engines };
    this.unreleasedPins.add(token);
    return {
      settings,
      engines,
      release: () => {
        if (released) return;
        released = true;
        this.unreleasedPins.delete(token);
        this.notifyUseEnded();
      },
    };
  }

  public calculateSpeedScale(text: string, settings?: Settings): number {
    return this.policy.calculateSpeedScale(text, this.queue, settings ?? this.store.current());
  }

  private dropExpiredItems(): void {
    const now = Date.now();
    let anyDropped = false;

    this.queue = this.queue.filter((item) => {
      if (this.policy.isExpired(item, now, item.settings)) {
        item.resolve();
        anyDropped = true;
        console.log(
          `[TTSQueue] ⏳ コメントが古い（${Math.round((now - item.enqueuedAt) / 1000)}秒経過）ためスキップしました: "${item.text}"`
        );
        return false;
      }
      return true;
    });

    if (anyDropped) {
      this.notifyUseEnded();
    }
  }

  /**
   * Triggers prefetch for queue[0] ONLY while audio is playing on the speaker
   * and no other synthesis is currently active.
   */
  private triggerPrefetch(): void {
    this.dropExpiredItems();
    if (!this.isPlayingAudio || this.isSynthesizing || this.isCleared) {
      return;
    }
    const nextItem = this.queue[0];
    if (nextItem && !nextItem.preparedPromise) {
      const engine = nextItem.engine;
      if (engine.prepare) {
        this.isSynthesizing = true;
        const rawPromise = engine.prepare(nextItem.text, { speedScale: nextItem.speedScale });
        this.trackPrepare(rawPromise, engine);
        const wrapped = rawPromise.finally(() => {
          this.isSynthesizing = false;
        });
        wrapped.catch(() => {});
        nextItem.preparedPromise = wrapped;
      }
    }
  }

  public enqueue(text: string, options: EnqueueOptions = {}): Promise<void> {
    if (arguments.length > 2) {
      throw new TypeError(
        "TTSQueue.enqueue accepts at most two arguments. Use enqueue(text, { enqueuedAt }) instead of the legacy third argument."
      );
    }
    if (!isPlainObject(options)) {
      throw new TypeError(
        "TTSQueue.enqueue options must be a plain object. Use enqueue(text, { engine }) instead of passing an engine directly."
      );
    }
    const optionKeys = Object.keys(options);
    if (typeof (options as unknown as Record<string, unknown>).say === "function") {
      throw new TypeError(
        "TTSQueue.enqueue no longer accepts an engine as the second argument. Use enqueue(text, { engine }) instead."
      );
    }
    if (optionKeys.some((key) => !ENQUEUE_OPTION_KEYS.has(key))) {
      throw new TypeError("TTSQueue.enqueue options contain an unsupported property.");
    }
    if (
      typeof options.engine !== "undefined" &&
      (options.engine === null ||
        typeof options.engine !== "object" ||
        typeof options.engine.say !== "function")
    ) {
      throw new TypeError("TTSQueue.enqueue options.engine must implement TTSEngine.");
    }
    if (
      typeof options.enqueuedAt !== "undefined" &&
      !Number.isFinite(options.enqueuedAt)
    ) {
      throw new TypeError("TTSQueue.enqueue options.enqueuedAt must be a finite number.");
    }
    if (
      typeof options.bypassAcceleration !== "undefined" &&
      typeof options.bypassAcceleration !== "boolean"
    ) {
      throw new TypeError("TTSQueue.enqueue options.bypassAcceleration must be a boolean.");
    }
    if (typeof options.bypassTtl !== "undefined" && typeof options.bypassTtl !== "boolean") {
      throw new TypeError("TTSQueue.enqueue options.bypassTtl must be a boolean.");
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return Promise.resolve();
    }

    // Drop oldest items if queue is overflowing
    if (this.queue.length >= this.maxQueueSize) {
      const dropped = this.queue.shift();
      dropped?.resolve();
      console.warn(`[TTSQueue] Queue overflow. Dropped oldest speech: "${dropped?.text}"`);
    }

    const settings = options.pin?.settings ?? options.settings ?? this.store.current();
    const engine = options.engine ?? options.pin?.engines.primary ?? this.defaultEngine;

    return new Promise<void>((resolve) => {
      const item: QueueItem = {
        id: Math.random().toString(36).slice(2),
        text: trimmed,
        enqueuedAt: options.enqueuedAt ?? Date.now(),
        bypassAcceleration: options.bypassAcceleration,
        bypassTtl: options.bypassTtl,
        speedScale: options.bypassAcceleration ? 1.0 : this.calculateSpeedScale(trimmed, settings),
        engine,
        settings,
        resolve,
      };
      this.queue.push(item);
      this.triggerPrefetch();
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.dropExpiredItems();

    if (this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.isCleared = false;
    const current = this.queue.shift();

    if (!current) {
      this.isProcessing = false;
      this.notifyUseEnded();
      return;
    }

    const engine = current.engine;
    this.currentRunningEngine = engine;

    try {
      let audio: PreparedAudio | null = null;

      // 1. Check if audio was prefetched
      if (current.preparedPromise) {
        try {
          audio = await current.preparedPromise;
        } catch {
          // Prefetch failed (transient error, etc.). Fallback to real-time synthesis.
          audio = null;
        }
      }

      if (this.isCleared) {
        current.resolve();
        return;
      }

      // 2. Real-time synthesis fallback with retry for transient errors
      if (!audio) {
        const retryDelays = this.policy.retryDelays;
        const maxRetries = retryDelays.length;
        let lastError: any = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (this.isCleared) break;

          try {
            this.isSynthesizing = true;
            if (engine.prepare) {
              const rawPromise = engine.prepare(current.text, { speedScale: current.speedScale });
              this.trackPrepare(rawPromise, engine);
              audio = await rawPromise;
            } else {
              audio = {
                play: () => engine.say(current.text, { speedScale: current.speedScale }),
              };
            }
            break; // Synthesis succeeded
          } catch (err: any) {
            lastError = err;
            if (this.isCleared) break;

            const isTransient = this.policy.isTransientConnectionOrTimeoutError(err);
            if (isTransient && attempt < maxRetries) {
              const delay = retryDelays[attempt] ?? retryDelays.at(-1) ?? 0;
              await this.sleep(delay);
              continue;
            }
            break; // Non-transient error or retries exhausted
          } finally {
            this.isSynthesizing = false;
          }
        }

        if (!audio && !this.isCleared) {
          this.logError(engine, current.text, lastError);
          current.resolve();
          return;
        }
      }

      if (this.isCleared) {
        current.resolve();
        return;
      }

      // 3. Play audio on speaker and trigger prefetch for next queue item
      if (audio) {
        const now = Date.now();
        if (this.policy.isExpired(current, now, current.settings)) {
          console.log(
            `[TTSQueue] ⏳ 合成・待機中にコメントの期限が切れたため再生をスキップしました: "${current.text}"`
          );
          current.resolve();
          return;
        }

        this.isPlayingAudio = true;
        this.triggerPrefetch();
        try {
          await this.playback.play(audio);
        } catch (playErr: any) {
          if (!this.isCleared) {
            this.logError(engine, current.text, playErr);
          }
        } finally {
          this.isPlayingAudio = false;
        }
      }

      current.resolve();
    } catch (unexpectedErr: any) {
      if (!this.isCleared) {
        this.logError(engine, current.text, unexpectedErr);
      }
      current.resolve();
    } finally {
      this.currentRunningEngine = undefined;
      this.isProcessing = false;
      this.notifyUseEnded();
      this.processNext();
    }
  }

  /**
   * Clears all pending queue items AND immediately aborts currently playing audio.
   */
  public clear(): void {
    this.isCleared = true;
    this.isSynthesizing = false;
    this.isPlayingAudio = false;

    // 1. Drain pending speech items
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.resolve();
    }

    this.playback.cancel(this.currentRunningEngine);
    this.notifyUseEnded();
  }
}
