import type { TTSEngine, PreparedAudio, SpeechOptions } from "./engine";
import { stopAudio } from "./audioPlayer";
import { config } from "../config";

export interface EnqueueOptions {
  engine?: TTSEngine;
  enqueuedAt?: number;
  bypassAcceleration?: boolean; // 加速を行わず 1.0 倍速で固定
  bypassTtl?: boolean;          // 30秒期限切れによるスキップ対象外にする
}

export interface QueueItem {
  id: string;
  text: string;
  enqueuedAt: number;
  speedScale?: number;
  bypassAcceleration?: boolean;
  bypassTtl?: boolean;
  engine?: TTSEngine;
  resolve: () => void;
  preparedPromise?: Promise<PreparedAudio>;
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

  constructor(defaultEngine: TTSEngine, maxQueueSize = 50) {
    this.defaultEngine = defaultEngine;
    this.maxQueueSize = maxQueueSize;
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

  private isTransientConnectionOrTimeoutError(err: any): boolean {
    if (!err) return false;
    if (err.name === "TimeoutError" || err.name === "AbortError") return true;
    if (
      err.code === "ConnectionRefused" ||
      err.code === "ECONNREFUSED" ||
      err.code === "ETIMEDOUT" ||
      err.code === "UND_ERR_CONNECT_TIMEOUT"
    ) {
      return true;
    }
    if (err.errno === 0) return true;
    const str = String(err?.message || err);
    return (
      str.includes("ConnectionRefused") ||
      str.includes("ECONNREFUSED") ||
      str.includes("ETIMEDOUT") ||
      str.includes("Unable to connect") ||
      str.includes("fetch failed") ||
      str.includes("timeout") ||
      str.includes("aborted") ||
      str.includes("The operation was aborted") ||
      str.includes("The operation timed out")
    );
  }

  private logError(engine: TTSEngine, text: string, err: any): void {
    const errStr = String(err?.message || err);
    if (this.isTransientConnectionOrTimeoutError(err)) {
      console.warn(
        `⚠️  [TTSQueue] 音声エンジン (${engine.name}) に接続できませんでした: "${text}" (理由: ${errStr})。アプリが起動しているか確認してください。`
      );
    } else {
      console.error(`[TTSQueue] Error speaking "${text}":`, err?.message || err);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public calculateSpeedScale(text: string): number {
    if (!config.AUTO_ACCELERATE) {
      return 1.0;
    }

    // 文字数加速 (speedByLength)
    let speedByLength = 1.0;
    const len = text.length;
    if (len <= 30) {
      speedByLength = 1.0;
    } else if (len <= 60) {
      speedByLength = 1.15;
    } else if (len <= 90) {
      speedByLength = 1.30;
    } else if (len <= 120) {
      speedByLength = 1.45;
    } else {
      speedByLength = 1.60;
    }

    // キュー混雑加速 (speedByQueue)
    // 自分自身（text）を含めた待機キュー全体の負荷を判定
    const queueTotalChars = this.queue.reduce((acc, item) => acc + item.text.length, 0) + text.length;
    const queueCount = this.queue.length + 1;

    let speedByQueue = 1.0;
    if (queueTotalChars >= 120 || queueCount >= 5) {
      speedByQueue = 1.50;
    } else if (queueTotalChars >= 60 || queueCount >= 3) {
      speedByQueue = 1.25;
    }

    // 合成とクランプ
    const maxSpeed = config.MAX_ACCELERATION_SPEED ?? 1.6;
    return Math.min(Math.max(speedByLength, speedByQueue), maxSpeed);
  }

  private dropExpiredItems(): void {
    const ttl = config.COMMENT_TTL_SECONDS ?? 30;
    if (ttl <= 0) return;
    const ttlMs = ttl * 1000;
    const now = Date.now();

    this.queue = this.queue.filter((item) => {
      if (item.bypassTtl) {
        return true;
      }
      if (now - item.enqueuedAt > ttlMs) {
        item.resolve();
        console.log(
          `[TTSQueue] ⏳ コメントが古い（${Math.round((now - item.enqueuedAt) / 1000)}秒経過）ためスキップしました: "${item.text}"`
        );
        return false;
      }
      return true;
    });
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
      if (nextItem.speedScale === undefined) {
        nextItem.speedScale = nextItem.bypassAcceleration ? 1.0 : this.calculateSpeedScale(nextItem.text);
      }
      const engine = nextItem.engine || this.defaultEngine;
      if (engine.prepare) {
        this.isSynthesizing = true;
        const promise = engine
          .prepare(nextItem.text, { speedScale: nextItem.speedScale })
          .finally(() => {
            this.isSynthesizing = false;
          });
        promise.catch(() => {});
        nextItem.preparedPromise = promise;
      }
    }
  }

  public enqueue(text: string, options: EnqueueOptions = {}): Promise<void> {
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

    return new Promise<void>((resolve) => {
      const item: QueueItem = {
        id: Math.random().toString(36).slice(2),
        text: trimmed,
        enqueuedAt: options.enqueuedAt ?? Date.now(),
        bypassAcceleration: options.bypassAcceleration,
        bypassTtl: options.bypassTtl,
        speedScale: options.bypassAcceleration ? 1.0 : this.calculateSpeedScale(trimmed),
        engine: options.engine,
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
      return;
    }

    const engine = current.engine || this.defaultEngine;
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
        if (current.speedScale === undefined) {
          current.speedScale = current.bypassAcceleration ? 1.0 : this.calculateSpeedScale(current.text);
        }
        const maxRetries = 2; // Initial attempt + 2 retries
        const backoffs = [200, 400];
        let lastError: any = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (this.isCleared) break;

          try {
            this.isSynthesizing = true;
            if (engine.prepare) {
              audio = await engine.prepare(current.text, { speedScale: current.speedScale });
            } else {
              audio = {
                play: () => engine.say(current.text, { speedScale: current.speedScale }),
              };
            }
            break; // Synthesis succeeded
          } catch (err: any) {
            lastError = err;
            if (this.isCleared) break;

            const isTransient = this.isTransientConnectionOrTimeoutError(err);
            if (isTransient && attempt < maxRetries) {
              const delay = backoffs[attempt] || 400;
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
        const ttl = config.COMMENT_TTL_SECONDS ?? 30;
        const now = Date.now();
        if (!current.bypassTtl && ttl > 0 && now - current.enqueuedAt > ttl * 1000) {
          console.log(
            `[TTSQueue] ⏳ 合成・待機中にコメントの期限が切れたため再生をスキップしました: "${current.text}"`
          );
          current.resolve();
          return;
        }

        this.isPlayingAudio = true;
        this.triggerPrefetch();
        try {
          await audio.play();
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

    // 2. Terminate currently playing audio process immediately
    stopAudio();
    if (this.currentRunningEngine?.stop) {
      try {
        this.currentRunningEngine.stop();
      } catch {
        // ignore
      }
    }
  }
}
