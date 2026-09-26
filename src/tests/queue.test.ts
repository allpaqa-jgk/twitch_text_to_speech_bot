import { describe, expect, it } from "bun:test";
import { TTSQueue } from "../tts/queue";
import type { TTSEngine, PreparedAudio } from "../tts/engine";

class MockEngine implements TTSEngine {
  public readonly name = "MockEngine";
  public spokenTexts: string[] = [];
  public delayMs: number;
  public shouldFail: boolean;

  constructor(delayMs = 10, shouldFail = false) {
    this.delayMs = delayMs;
    this.shouldFail = shouldFail;
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async say(text: string): Promise<void> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.shouldFail) {
      throw new Error("Synthetic error");
    }
    this.spokenTexts.push(text);
  }
}

describe("TTSQueue", () => {
  it("should process items sequentially (FIFO)", async () => {
    const mock = new MockEngine(20);
    const queue = new TTSQueue(mock);

    const p1 = queue.enqueue("Message 1");
    const p2 = queue.enqueue("Message 2");
    const p3 = queue.enqueue("Message 3");

    await Promise.all([p1, p2, p3]);

    expect(mock.spokenTexts).toEqual(["Message 1", "Message 2", "Message 3"]);
  });

  it("should continue processing next items even if one fails", async () => {
    let callCount = 0;
    const flakyEngine: TTSEngine = {
      name: "FlakyEngine",
      isAvailable: async () => true,
      say: async (text: string) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Oops, audio error!");
        }
      },
    };

    const queue = new TTSQueue(flakyEngine);

    const p1 = queue.enqueue("First");
    const p2 = queue.enqueue("Failing item");
    const p3 = queue.enqueue("Third");

    await Promise.all([p1, p2, p3]);

    expect(callCount).toBe(3);
  });

  it("should handle offline connection errors gracefully with warning", async () => {
    const offlineEngine: TTSEngine = {
      name: "COEIROINK",
      isAvailable: async () => false,
      say: async () => {
        const err: any = new TypeError("Unable to connect. Is the computer able to access the url?");
        err.code = "ConnectionRefused";
        err.errno = 0;
        throw err;
      },
    };

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => {
      warnings.push(args.join(" "));
    };

    try {
      const queue = new TTSQueue(offlineEngine);
      await queue.enqueue("テストメッセージ");

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('音声エンジン (COEIROINK) に接続できませんでした: "テストメッセージ"');
      expect(warnings[0]).toContain("Unable to connect");
    } finally {
      console.warn = origWarn;
    }
  });

  it("should retry transient connection errors during prepare() and log warning after exhausting retries", async () => {
    let attempts = 0;
    const offlinePrepareEngine: TTSEngine = {
      name: "COEIROINK",
      isAvailable: async () => false,
      say: async () => {},
      prepare: async () => {
        attempts++;
        const err: any = new TypeError("fetch failed");
        err.code = "ConnectionRefused";
        throw err;
      },
    };

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => {
      warnings.push(args.join(" "));
    };

    try {
      const queue = new TTSQueue(offlinePrepareEngine);
      await queue.enqueue("再試行テスト");

      // Initial attempt + 2 retries = 3 attempts total
      expect(attempts).toBe(3);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('音声エンジン (COEIROINK) に接続できませんでした: "再試行テスト"');
    } finally {
      console.warn = origWarn;
    }
  });

  it("should clear pending items and invoke stop() on running engine", async () => {
    let stopCalled = false;
    const longRunningEngine: TTSEngine = {
      name: "SlowEngine",
      isAvailable: async () => true,
      say: async () => {
        await new Promise((r) => setTimeout(r, 200));
      },
      stop: () => {
        stopCalled = true;
      },
    };

    const queue = new TTSQueue(longRunningEngine);
    const p1 = queue.enqueue("Playing item");
    const p2 = queue.enqueue("Pending item 1");
    const p3 = queue.enqueue("Pending item 2");

    expect(queue.pendingCount).toBe(2);

    // Call clear while item 1 is playing
    queue.clear();

    expect(stopCalled).toBe(true);
    expect(queue.pendingCount).toBe(0);

    await Promise.all([p1, p2, p3]);
  });

  it("should prefetch next item using prepare() while current item is playing", async () => {
    class PrefetchMockEngine implements TTSEngine {
      public readonly name = "PrefetchMockEngine";
      public prepareCalls: string[] = [];
      public playCalls: string[] = [];

      public async isAvailable(): Promise<boolean> {
        return true;
      }

      public async say(text: string): Promise<void> {
        const audio = await this.prepare(text);
        await audio.play();
      }

      public async prepare(text: string): Promise<PreparedAudio> {
        this.prepareCalls.push(text);
        await new Promise((r) => setTimeout(r, 10));
        return {
          play: async () => {
            this.playCalls.push(text);
            await new Promise((r) => setTimeout(r, 50));
          },
        };
      }
    }

    const engine = new PrefetchMockEngine();
    const queue = new TTSQueue(engine);

    const p1 = queue.enqueue("Message 1");
    const p2 = queue.enqueue("Message 2");

    // Wait a brief moment for item 1 to start playing and item 2 prefetch to be triggered
    await new Promise((r) => setTimeout(r, 20));

    // Message 1 is currently playing, but Message 2's prepare should have already been called
    expect(engine.prepareCalls).toContain("Message 1");
    expect(engine.prepareCalls).toContain("Message 2");
    expect(engine.playCalls).toEqual(["Message 1"]);

    await Promise.all([p1, p2]);

    expect(engine.playCalls).toEqual(["Message 1", "Message 2"]);
  });

  it("should handle error in prepare() during prefetch gracefully and continue", async () => {
    let callCount = 0;
    const failingPrefetchEngine: TTSEngine = {
      name: "FailingPrefetchEngine",
      isAvailable: async () => true,
      say: async () => {},
      prepare: async (text: string) => {
        callCount++;
        if (text === "Fail") {
          throw new Error("Prefetch synthesis error");
        }
        return {
          play: async () => {},
        };
      },
    };

    const queue = new TTSQueue(failingPrefetchEngine);
    const p1 = queue.enqueue("Msg 1");
    const p2 = queue.enqueue("Fail");
    const p3 = queue.enqueue("Msg 3");

    await Promise.all([p1, p2, p3]);
    // Call count is 4 because prefetch error on "Fail" falls back to real-time synthesis attempt
    expect(callCount).toBe(4);
  });

  it("should never run prepare() concurrently for multiple enqueued items", async () => {
    let currentConcurrent = 0;
    let maxConcurrent = 0;

    class SerialMockEngine implements TTSEngine {
      public readonly name = "SerialMockEngine";
      public spoken: string[] = [];

      public async isAvailable(): Promise<boolean> {
        return true;
      }

      public async say(text: string): Promise<void> {
        const audio = await this.prepare(text);
        await audio.play();
      }

      public async prepare(text: string): Promise<PreparedAudio> {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 20));
        currentConcurrent--;
        return {
          play: async () => {
            await new Promise((r) => setTimeout(r, 30));
            this.spoken.push(text);
          },
        };
      }
    }

    const engine = new SerialMockEngine();
    const queue = new TTSQueue(engine);

    // Rapidly enqueue 4 items
    const promises = [
      queue.enqueue("Item 1"),
      queue.enqueue("Item 2"),
      queue.enqueue("Item 3"),
      queue.enqueue("Item 4"),
    ];

    await Promise.all(promises);

    expect(maxConcurrent).toBe(1);
    expect(engine.spoken).toEqual(["Item 1", "Item 2", "Item 3", "Item 4"]);
  });

  it("should fallback to real-time synthesis if prefetch failed and successfully speak", async () => {
    const spoken: string[] = [];
    let prefetchAttempt = true;

    const fallbackEngine: TTSEngine = {
      name: "FallbackEngine",
      isAvailable: async () => true,
      say: async () => {},
      prepare: async (text: string) => {
        if (text === "Item 2" && prefetchAttempt) {
          prefetchAttempt = false;
          throw new TypeError("fetch failed");
        }
        return {
          play: async () => {
            spoken.push(text);
          },
        };
      },
    };

    const queue = new TTSQueue(fallbackEngine);
    const p1 = queue.enqueue("Item 1");
    const p2 = queue.enqueue("Item 2");

    await Promise.all([p1, p2]);
    expect(spoken).toEqual(["Item 1", "Item 2"]);
  });

  it("should retry transient connection errors with backoff before succeeding", async () => {
    let attempts = 0;
    const spoken: string[] = [];

    const transientFlakyEngine: TTSEngine = {
      name: "TransientFlakyEngine",
      isAvailable: async () => true,
      say: async () => {},
      prepare: async (text: string) => {
        attempts++;
        if (attempts < 3) {
          throw new TypeError("fetch failed");
        }
        return {
          play: async () => {
            spoken.push(text);
          },
        };
      },
    };

    const queue = new TTSQueue(transientFlakyEngine);
    await queue.enqueue("Retry test");

    expect(attempts).toBe(3);
    expect(spoken).toEqual(["Retry test"]);
  });

  it("should not play prefetched audio if clear() was called", async () => {
    class PrefetchMockEngine implements TTSEngine {
      public readonly name = "PrefetchMockEngine";
      public playCalls: string[] = [];

      public async isAvailable(): Promise<boolean> {
        return true;
      }

      public async say(text: string): Promise<void> {
        const audio = await this.prepare(text);
        await audio.play();
      }

      public async prepare(text: string): Promise<PreparedAudio> {
        return {
          play: async () => {
            this.playCalls.push(text);
            await new Promise((r) => setTimeout(r, 80));
          },
        };
      }
    }

    const engine = new PrefetchMockEngine();
    const queue = new TTSQueue(engine);

    const p1 = queue.enqueue("Message 1");
    const p2 = queue.enqueue("Message 2");

    await new Promise((r) => setTimeout(r, 20));
    queue.clear();

    await Promise.all([p1, p2]);
    expect(engine.playCalls).toEqual(["Message 1"]);
  });
});

