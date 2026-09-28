import { describe, expect, it } from "bun:test";
import { TTSQueue } from "../tts/queue";
import type { TTSEngine, PreparedAudio, SpeechOptions } from "../tts/engine";
import { config } from "../config";
import { CoeiroinkEngine } from "../tts/engines/coeiroink";
import { VoicevoxEngine } from "../tts/engines/voicevox";
import { KokoroEngine } from "../tts/engines/kokoro";
import { MacSayEngine } from "../tts/engines/macSay";
import { PiperEngine } from "../tts/engines/piper";

class MockEngine implements TTSEngine {
  public readonly name = "MockEngine";
  public spokenTexts: string[] = [];
  public recordedOptions: (SpeechOptions | undefined)[] = [];
  public delayMs: number;
  public shouldFail: boolean;

  constructor(delayMs = 10, shouldFail = false) {
    this.delayMs = delayMs;
    this.shouldFail = shouldFail;
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async say(text: string, options?: SpeechOptions): Promise<void> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.shouldFail) {
      throw new Error("Synthetic error");
    }
    this.spokenTexts.push(text);
    this.recordedOptions.push(options);
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



  it("should use the engine specified in enqueue options", async () => {
    const defaultEngine = new MockEngine();
    const selectedEngine = new MockEngine();
    const queue = new TTSQueue(defaultEngine);

    await queue.enqueue("Selected engine", { engine: selectedEngine });

    expect(defaultEngine.spokenTexts).toEqual([]);
    expect(selectedEngine.spokenTexts).toEqual(["Selected engine"]);
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

  describe("Dynamic Acceleration & Safety Guards", () => {
    it("1. should speak single short text (10 chars) with speedScale === 1.0", async () => {
      const mock = new MockEngine();
      const queue = new TTSQueue(mock);

      await queue.enqueue("1234567890");

      expect(mock.recordedOptions.length).toBe(1);
      expect(mock.recordedOptions[0]?.speedScale).toBe(1.0);
    });

    it("2. should speak single 100-character long text with speedScale === 1.45 even with only 1 item in queue", async () => {
      const mock = new MockEngine();
      const queue = new TTSQueue(mock);
      const text100 = "あ".repeat(100);

      await queue.enqueue(text100);

      expect(mock.recordedOptions.length).toBe(1);
      expect(mock.recordedOptions[0]?.speedScale).toBe(1.45);
    });

    it("3. should cap speedScale at MAX_ACCELERATION_SPEED (1.6) for super long text (200 chars)", async () => {
      const mock = new MockEngine();
      const queue = new TTSQueue(mock);
      const text200 = "あ".repeat(200);

      await queue.enqueue(text200);

      expect(mock.recordedOptions.length).toBe(1);
      expect(mock.recordedOptions[0]?.speedScale).toBe(1.6);

      // Verify custom MAX_ACCELERATION_SPEED config capping
      const origMax = config.MAX_ACCELERATION_SPEED;
      try {
        (config as any).MAX_ACCELERATION_SPEED = 1.35;
        await queue.enqueue(text200);
        expect(mock.recordedOptions[1]?.speedScale).toBe(1.35);
      } finally {
        (config as any).MAX_ACCELERATION_SPEED = origMax;
      }
    });

    it("4. should apply congestion acceleration (1.25 - 1.5) when multiple short items accumulate in queue", async () => {
      const mock = new MockEngine(40);
      const queue = new TTSQueue(mock);
      const shortText = "1234567890"; // 10 chars

      // Enqueue 5 items rapidly so that 3 items accumulate in queue while item 1 is playing
      const promises1 = [
        queue.enqueue(shortText),
        queue.enqueue(shortText),
        queue.enqueue(shortText),
        queue.enqueue(shortText),
        queue.enqueue(shortText),
      ];
      await Promise.all(promises1);

      // 5th item was enqueued when 3 items were pending in queue (queueCount >= 3), so it gets 1.25
      const scales1 = mock.recordedOptions.map((opt) => opt?.speedScale);
      expect(scales1.some((s) => s === 1.25)).toBe(true);

      // Now enqueue 7 items so queue count reaches >= 5 (acceleration 1.50)
      mock.recordedOptions = [];
      const promises2 = [];
      for (let i = 0; i < 7; i++) {
        promises2.push(queue.enqueue(shortText));
      }
      await Promise.all(promises2);

      const scales2 = mock.recordedOptions.map((opt) => opt?.speedScale);
      expect(scales2.some((s) => s === 1.50)).toBe(true);
    });

    it("5. should safely bound acceleration within MAX_ACCELERATION_SPEED using Math.max instead of multiplying", async () => {
      const mock = new MockEngine(40);
      const queue = new TTSQueue(mock);
      const text100 = "あ".repeat(100); // speedByLength = 1.45

      const promises = [];
      for (let i = 0; i < 6; i++) {
        promises.push(queue.enqueue(text100));
      }
      await Promise.all(promises);

      // If multiplied, 1.45 * 1.5 = 2.175, but Math.max caps it to 1.50 and never exceeds maxSpeed (1.6)
      for (const opt of mock.recordedOptions) {
        expect(opt?.speedScale).toBeGreaterThanOrEqual(1.45);
        expect(opt?.speedScale).toBeLessThanOrEqual(config.MAX_ACCELERATION_SPEED ?? 1.6);
      }
    });

    it("6. should clamp speedScale across all engines so it never exceeds 2.0 or falls below 0.5", async () => {
      // 6.1 CoeiroinkEngine
      const origFetch = globalThis.fetch;
      let coeiroinkSpeed = 0;
      globalThis.fetch = (async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes("/estimate_prosody")) {
          return new Response(JSON.stringify({ detail: [] }));
        }
        if (urlStr.includes("/style_id_to_speaker_meta")) {
          return new Response(JSON.stringify({ speakerUuid: "dummy" }));
        }
        if (urlStr.includes("/synthesis")) {
          const body = JSON.parse(init.body);
          coeiroinkSpeed = body.speedScale;
          return new Response(new ArrayBuffer(10));
        }
        return new Response();
      }) as any;

      try {
        const coeiroink = new CoeiroinkEngine();
        await coeiroink.prepare("テスト", { speedScale: 5.0 });
        expect(coeiroinkSpeed).toBe(2.0);

        await coeiroink.prepare("テスト", { speedScale: 0.1 });
        expect(coeiroinkSpeed).toBe(0.5);
      } finally {
        globalThis.fetch = origFetch;
      }

      // 6.2 VoicevoxEngine
      let voicevoxSpeed = 0;
      globalThis.fetch = (async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes("/audio_query")) {
          return new Response(JSON.stringify({ speedScale: 1.0 }));
        }
        if (urlStr.includes("/synthesis")) {
          const body = JSON.parse(init.body);
          voicevoxSpeed = body.speedScale;
          return new Response(new ArrayBuffer(10));
        }
        return new Response();
      }) as any;

      try {
        const voicevox = new VoicevoxEngine();
        await voicevox.prepare("テスト", { speedScale: 5.0 });
        expect(voicevoxSpeed).toBe(2.0);

        await voicevox.prepare("テスト", { speedScale: 0.1 });
        expect(voicevoxSpeed).toBe(0.5);
      } finally {
        globalThis.fetch = origFetch;
      }

      // 6.3 KokoroEngine
      const origSpawn = Bun.spawn;
      let kokoroSpeed = 0;
      Bun.spawn = ((args: any, opts: any) => {
        let streamController: any;
        const stream = new ReadableStream({
          start(controller) {
            streamController = controller;
            controller.enqueue(new TextEncoder().encode("READY\n"));
          },
        });
        return {
          stdout: stream,
          stdin: {
            write: (data: string) => {
              try {
                const payload = JSON.parse(data.trim());
                kokoroSpeed = payload.speed;
                const fs = require("fs");
                fs.writeFileSync(payload.outputPath, Buffer.from("RIFF...."));
                streamController.enqueue(new TextEncoder().encode(JSON.stringify({ status: "ok" }) + "\n"));
              } catch {}
            },
            flush: () => {},
          },
          exited: new Promise(() => {}),
          kill: () => {},
        };
      }) as any;

      try {
        const kokoro = new KokoroEngine();
        await kokoro.prepare("test", { speedScale: 5.0 });
        expect(kokoroSpeed).toBe(2.0);

        await kokoro.prepare("test", { speedScale: 0.1 });
        expect(kokoroSpeed).toBe(0.5);
        kokoro.stop();
      } finally {
        Bun.spawn = origSpawn;
      }

      // 6.4 MacSayEngine
      let macRate = 0;
      const origPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
      Bun.spawn = ((args: any, opts: any) => {
        const rateIdx = args.indexOf("-r");
        if (rateIdx !== -1) {
          macRate = Number(args[rateIdx + 1]);
        }
        return {
          exited: Promise.resolve(0),
          kill: () => {},
        };
      }) as any;

      try {
        const mac = new MacSayEngine();
        await mac.say("テスト", { speedScale: 5.0 });
        expect(macRate).toBe(350);

        await mac.say("テスト", { speedScale: 0.1 });
        expect(macRate).toBe(100);
      } finally {
        Bun.spawn = origSpawn;
        Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
      }

      // 6.5 PiperEngine
      let piperLengthScale = 0;
      Bun.spawn = ((args: any, opts: any) => {
        const scaleIdx = args.indexOf("--length-scale");
        if (scaleIdx !== -1) {
          piperLengthScale = Number(args[scaleIdx + 1]);
        }
        const outIdx = args.indexOf("--output_file");
        if (outIdx !== -1) {
          const fs = require("fs");
          fs.writeFileSync(args[outIdx + 1], Buffer.from("RIFF...."));
        }
        return {
          stdin: { write: () => {}, flush: () => {}, end: () => {} },
          exited: Promise.resolve(0),
        };
      }) as any;

      try {
        const piper = new PiperEngine();
        await piper.prepare("テスト", { speedScale: 5.0 });
        expect(piperLengthScale).toBe(0.5);

        await piper.prepare("テスト", { speedScale: 0.1 });
        expect(piperLengthScale).toBe(2.0);
      } finally {
        Bun.spawn = origSpawn;
      }
    });

    it("should return 1.0 when AUTO_ACCELERATE is disabled", async () => {
      const origAuto = config.AUTO_ACCELERATE;
      try {
        (config as any).AUTO_ACCELERATE = false;
        const mock = new MockEngine();
        const queue = new TTSQueue(mock);
        expect(queue.calculateSpeedScale("あ".repeat(150))).toBe(1.0);

        await queue.enqueue("あ".repeat(150));
        expect(mock.recordedOptions[0]?.speedScale).toBe(1.0);
      } finally {
        (config as any).AUTO_ACCELERATE = origAuto;
      }
    });

    it("should keep speedScale === 1.0 when bypassAcceleration is true even with long text and queue congestion", async () => {
      const mock = new MockEngine(20);
      const queue = new TTSQueue(mock);
      const longText = "あ".repeat(120);

      // Enqueue 6 long items with bypassAcceleration: true
      const promises = [];
      for (let i = 0; i < 6; i++) {
        promises.push(queue.enqueue(longText, { bypassAcceleration: true }));
      }
      await Promise.all(promises);

      expect(mock.recordedOptions.length).toBe(6);
      for (const opt of mock.recordedOptions) {
        expect(opt?.speedScale).toBe(1.0);
      }
    });
  });

  describe("Comment TTL (Time to Live) Skip", () => {
    class TTLTrackingEngine implements TTSEngine {
      public readonly name = "TTLTrackingEngine";
      public spokenTexts: string[] = [];
      public preparedTexts: string[] = [];
      public delayMs: number;

      constructor(delayMs = 20) {
        this.delayMs = delayMs;
      }

      public async isAvailable(): Promise<boolean> {
        return true;
      }

      public async say(text: string): Promise<void> {
        await new Promise((r) => setTimeout(r, this.delayMs));
        this.spokenTexts.push(text);
      }

      public async prepare(text: string): Promise<PreparedAudio> {
        this.preparedTexts.push(text);
        await new Promise((r) => setTimeout(r, this.delayMs));
        return {
          play: async () => {
            this.spokenTexts.push(text);
            await new Promise((r) => setTimeout(r, this.delayMs));
          },
        };
      }
    }

    it("1. should skip items enqueued 30+ seconds ago without say/prepare and speak fresh items immediately", async () => {
      const engine = new TTLTrackingEngine(20);
      const queue = new TTSQueue(engine);

      const origNow = Date.now;
      let currentTime = 1000000;
      Date.now = () => currentTime;

      const consoleLogs: string[] = [];
      const origLog = console.log;
      console.log = (...args: any[]) => {
        consoleLogs.push(args.join(" "));
      };

      try {
        const p1 = queue.enqueue("Item 1 (Active)");
        await new Promise((r) => setTimeout(r, 5));

        const p2 = queue.enqueue("Item 2 (Stale comment)", {
          enqueuedAt: currentTime - 35000,
        });
        const p3 = queue.enqueue("Item 3 (Fresh comment)");

        await Promise.all([p1, p2, p3]);

        // Item 2 should have been dropped without being spoken or prepared
        expect(engine.spokenTexts).toEqual(["Item 1 (Active)", "Item 3 (Fresh comment)"]);
        expect(engine.spokenTexts).not.toContain("Item 2 (Stale comment)");
        expect(engine.preparedTexts).not.toContain("Item 2 (Stale comment)");

        // Verify notification log
        expect(
          consoleLogs.some((msg) =>
            msg.includes('コメントが古い（35秒経過）ためスキップしました: "Item 2 (Stale comment)"')
          )
        ).toBe(true);
      } finally {
        Date.now = origNow;
        console.log = origLog;
      }
    });

    it("2. should speak fresh items enqueued 10 seconds ago normally", async () => {
      const engine = new TTLTrackingEngine(20);
      const queue = new TTSQueue(engine);

      const origNow = Date.now;
      let currentTime = 1000000;
      Date.now = () => currentTime;

      try {
        const p1 = queue.enqueue("Item 1 (Active)");
        await new Promise((r) => setTimeout(r, 5));

        const p2 = queue.enqueue("Item 2 (10s old comment)");

        // Advance time by 10 seconds (well within 30s TTL)
        currentTime += 10000;

        await Promise.all([p1, p2]);

        // Both items should be spoken normally
        expect(engine.spokenTexts).toEqual(["Item 1 (Active)", "Item 2 (10s old comment)"]);
      } finally {
        Date.now = origNow;
      }
    });

    it("3. should not skip old items when COMMENT_TTL_SECONDS is 0 (disabled)", async () => {
      const origTTL = config.COMMENT_TTL_SECONDS;
      (config as any).COMMENT_TTL_SECONDS = 0;

      const engine = new TTLTrackingEngine(20);
      const queue = new TTSQueue(engine);

      const origNow = Date.now;
      let currentTime = 1000000;
      Date.now = () => currentTime;

      try {
        const p1 = queue.enqueue("Item 1 (Active)");
        await new Promise((r) => setTimeout(r, 5));

        const p2 = queue.enqueue("Item 2 (Old comment but TTL disabled)");

        // Advance time by 60 seconds (much older than 30s)
        currentTime += 60000;

        await Promise.all([p1, p2]);

        // Item 2 should NOT be skipped because TTL is 0
        expect(engine.spokenTexts).toEqual([
          "Item 1 (Active)",
          "Item 2 (Old comment but TTL disabled)",
        ]);
      } finally {
        Date.now = origNow;
        (config as any).COMMENT_TTL_SECONDS = origTTL;
      }
    });

    it("4. should drop multiple accumulated expired items and process only remaining fresh items", async () => {
      const engine = new TTLTrackingEngine(20);
      const queue = new TTSQueue(engine);

      const origNow = Date.now;
      let currentTime = 1000000;
      Date.now = () => currentTime;

      const consoleLogs: string[] = [];
      const origLog = console.log;
      console.log = (...args: any[]) => {
        consoleLogs.push(args.join(" "));
      };

      try {
        const p1 = queue.enqueue("Active 1");
        await new Promise((r) => setTimeout(r, 5));

        const p2 = queue.enqueue("Expired 1", {
          enqueuedAt: currentTime - 40000,
        });
        const p3 = queue.enqueue("Expired 2", {
          enqueuedAt: currentTime - 35000,
        });
        const p4 = queue.enqueue("Fresh comment");

        await Promise.all([p1, p2, p3, p4]);

        expect(engine.spokenTexts).toEqual(["Active 1", "Fresh comment"]);
        expect(engine.spokenTexts).not.toContain("Expired 1");
        expect(engine.spokenTexts).not.toContain("Expired 2");
        expect(
          consoleLogs.some((msg) =>
            msg.includes('コメントが古い（40秒経過）ためスキップしました: "Expired 1"')
          )
        ).toBe(true);
        expect(
          consoleLogs.some((msg) =>
            msg.includes('コメントが古い（35秒経過）ためスキップしました: "Expired 2"')
          )
        ).toBe(true);
      } finally {
        Date.now = origNow;
        console.log = origLog;
      }
    });

    it("5. should skip item if it expires during synthesis before audio.play()", async () => {
      let currentTime = 1000000;
      const origNow = Date.now;
      Date.now = () => currentTime;

      const consoleLogs: string[] = [];
      const origLog = console.log;
      console.log = (...args: any[]) => {
        consoleLogs.push(args.join(" "));
      };

      try {
        let played = false;
        const slowEngine: TTSEngine = {
          name: "SlowEngine",
          isAvailable: async () => true,
          say: async () => {},
          prepare: async (text: string) => {
            // Synthesis takes a very long time, during which TTL expires
            currentTime += 35000;
            return {
              play: async () => {
                played = true;
              },
            };
          },
        };
        const queue = new TTSQueue(slowEngine);

        await queue.enqueue("Very slow item");

        expect(played).toBe(false);
        expect(
          consoleLogs.some((msg) =>
            msg.includes('合成・待機中にコメントの期限が切れたため再生をスキップしました: "Very slow item"')
          )
        ).toBe(true);
      } finally {
        Date.now = origNow;
        console.log = origLog;
      }
    });

    it("6. should not skip items with bypassTtl: true even when enqueued 40+ seconds ago", async () => {
      const engine = new TTLTrackingEngine(20);
      const queue = new TTSQueue(engine);

      const origNow = Date.now;
      let currentTime = 1000000;
      Date.now = () => currentTime;

      try {
        const p1 = queue.enqueue("Active 1");
        await new Promise((r) => setTimeout(r, 5));

        const p2 = queue.enqueue("Protected demo item", {
          bypassTtl: true,
          enqueuedAt: currentTime - 40000,
        });

        await Promise.all([p1, p2]);

        expect(engine.spokenTexts).toEqual(["Active 1", "Protected demo item"]);
      } finally {
        Date.now = origNow;
      }
    });

    it("7. should drop stale normal items while preserving bypassTtl: true items in mixed queue", async () => {
      const engine = new TTLTrackingEngine(20);
      const queue = new TTSQueue(engine);

      const origNow = Date.now;
      let currentTime = 1000000;
      Date.now = () => currentTime;

      try {
        const p1 = queue.enqueue("Active item");
        await new Promise((r) => setTimeout(r, 5));

        const p2 = queue.enqueue("Stale normal item 1", {
          enqueuedAt: currentTime - 40000,
        });
        const p3 = queue.enqueue("Protected item 1", {
          bypassTtl: true,
          enqueuedAt: currentTime - 50000,
        });
        const p4 = queue.enqueue("Stale normal item 2", {
          enqueuedAt: currentTime - 35000,
        });
        const p5 = queue.enqueue("Fresh normal item");

        await Promise.all([p1, p2, p3, p4, p5]);

        expect(engine.spokenTexts).toEqual([
          "Active item",
          "Protected item 1",
          "Fresh normal item",
        ]);
        expect(engine.spokenTexts).not.toContain("Stale normal item 1");
        expect(engine.spokenTexts).not.toContain("Stale normal item 2");
      } finally {
        Date.now = origNow;
      }
    });
  });

  describe("COEIROINK Pause Length Default / Custom", () => {
    it("should omit pauseLength in synthesis body when config.COEIROINK_PAUSE_LENGTH is undefined", async () => {
      const origFetch = globalThis.fetch;
      const origPause = config.COEIROINK_PAUSE_LENGTH;
      let sentBody: any = null;

      try {
        (config as any).COEIROINK_PAUSE_LENGTH = undefined;
        globalThis.fetch = (async (url: any, init: any) => {
          const urlStr = String(url);
          if (urlStr.includes("/estimate_prosody")) {
            return new Response(JSON.stringify({ detail: [] }));
          }
          if (urlStr.includes("/style_id_to_speaker_meta")) {
            return new Response(JSON.stringify({ speakerUuid: "dummy" }));
          }
          if (urlStr.includes("/synthesis")) {
            sentBody = JSON.parse(init.body);
            return new Response(new ArrayBuffer(10));
          }
          return new Response();
        }) as any;

        const coeiroink = new CoeiroinkEngine();
        await coeiroink.prepare("自然なポーズテスト");

        expect(sentBody).not.toBeNull();
        expect(sentBody.pauseLength).toBeUndefined();
        expect("pauseLength" in sentBody).toBe(false);
      } finally {
        globalThis.fetch = origFetch;
        (config as any).COEIROINK_PAUSE_LENGTH = origPause;
      }
    });

    it("should include pauseLength in synthesis body when explicitly configured", async () => {
      const origFetch = globalThis.fetch;
      const origPause = config.COEIROINK_PAUSE_LENGTH;
      let sentBody: any = null;

      try {
        (config as any).COEIROINK_PAUSE_LENGTH = 0.04;
        globalThis.fetch = (async (url: any, init: any) => {
          const urlStr = String(url);
          if (urlStr.includes("/estimate_prosody")) {
            return new Response(JSON.stringify({ detail: [] }));
          }
          if (urlStr.includes("/style_id_to_speaker_meta")) {
            return new Response(JSON.stringify({ speakerUuid: "dummy" }));
          }
          if (urlStr.includes("/synthesis")) {
            sentBody = JSON.parse(init.body);
            return new Response(new ArrayBuffer(10));
          }
          return new Response();
        }) as any;

        const coeiroink = new CoeiroinkEngine();
        await coeiroink.prepare("カスタムポーズテスト");

        expect(sentBody).not.toBeNull();
        expect(sentBody.pauseLength).toBe(0.04);
      } finally {
        globalThis.fetch = origFetch;
        (config as any).COEIROINK_PAUSE_LENGTH = origPause;
      }
    });
  });
});
