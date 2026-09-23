import type { TTSEngine } from "./engine";

export interface QueueItem {
  id: string;
  text: string;
  engine?: TTSEngine;
  resolve: () => void;
  reject: (err: any) => void;
}

export class TTSQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
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
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const current = this.queue.shift();

    if (!current) {
      this.isProcessing = false;
      return;
    }

    const engine = current.engine || this.defaultEngine;

    try {
      await engine.say(current.text);
      current.resolve();
    } catch (err) {
      console.error(`[TTSQueue] Error speaking "${current.text}":`, err);
      // We resolve rather than reject to avoid unhandled rejections on callers,
      // while proceeding to the next message in queue.
      current.resolve();
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }

  public clear(): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.resolve();
    }
  }
}
