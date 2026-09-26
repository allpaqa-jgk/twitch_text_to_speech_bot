import type { TTSEngine, PreparedAudio } from "./engine";
import { stopAudio } from "./audioPlayer";

export interface QueueItem {
  id: string;
  text: string;
  engine?: TTSEngine;
  resolve: () => void;
  reject: (err: any) => void;
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

  /**
   * Triggers prefetch for queue[0] ONLY while audio is playing on the speaker
   * and no other synthesis is currently active.
   */
  private triggerPrefetch(): void {
    if (!this.isPlayingAudio || this.isSynthesizing || this.isCleared) {
      return;
    }
    const nextItem = this.queue[0];
    if (nextItem && !nextItem.preparedPromise) {
      const engine = nextItem.engine || this.defaultEngine;
      if (engine.prepare) {
        this.isSynthesizing = true;
        const promise = engine.prepare(nextItem.text).finally(() => {
          this.isSynthesizing = false;
        });
        promise.catch(() => {});
        nextItem.preparedPromise = promise;
      }
    }
  }

  public enqueue(text: string, engine?: TTSEngine): Promise<void> {
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

    return new Promise<void>((resolve, reject) => {
      const item: QueueItem = {
        id: Math.random().toString(36).slice(2),
        text: trimmed,
        engine,
        resolve,
        reject,
      };
      this.queue.push(item);
      this.triggerPrefetch();
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
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
        const maxRetries = 2; // Initial attempt + 2 retries
        const backoffs = [200, 400];
        let lastError: any = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (this.isCleared) break;

          try {
            this.isSynthesizing = true;
            if (engine.prepare) {
              audio = await engine.prepare(current.text);
            } else {
              audio = {
                play: () => engine.say(current.text),
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
