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

  private triggerPrefetch(): void {
    const nextItem = this.queue[0];
    if (nextItem && !nextItem.preparedPromise) {
      const engine = nextItem.engine || this.defaultEngine;
      if (engine.prepare) {
        const promise = engine.prepare(nextItem.text);
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

    this.triggerPrefetch();

    const engine = current.engine || this.defaultEngine;
    this.currentRunningEngine = engine;

    try {
      if (current.preparedPromise) {
        const audio = await current.preparedPromise;
        if (!this.isCleared) {
          await audio.play();
        }
      } else if (engine.prepare) {
        const audio = await engine.prepare(current.text);
        if (!this.isCleared) {
          await audio.play();
        }
      } else {
        await engine.say(current.text);
      }
      current.resolve();
    } catch (err: any) {
      if (this.isCleared) {
        // Playback was aborted by clear() - suppress error logging
        current.resolve();
      } else {
        const errStr = String(err?.message || err);
        const isConnectionRefused =
          err?.code === "ConnectionRefused" ||
          err?.errno === 0 ||
          errStr.includes("ConnectionRefused") ||
          errStr.includes("Unable to connect") ||
          errStr.includes("fetch failed");

        if (isConnectionRefused) {
          console.warn(`⚠️  [TTSQueue] 音声エンジン (${engine.name}) に接続できませんでした。アプリが起動しているか確認してください。`);
        } else {
          console.error(`[TTSQueue] Error speaking "${current.text}":`, err?.message || err);
        }
        current.resolve();
      }
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
