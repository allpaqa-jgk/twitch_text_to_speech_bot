import { describe, expect, it, spyOn } from "bun:test";
import { SettingsStore } from "../settingsStore";
import { parseConfig, baseConfig } from "../config";
import { EngineHolder } from "../tts/engineHolder";
import { TTSQueue } from "../tts/queue";
import { TTSQueuePolicy } from "../tts/queuePolicy";
import type { TTSEngine, SpeechOptions } from "../tts/engine";
import type { TextTransformer } from "../tts/transformers/types";
import { processComment } from "../application/commentProcessingService";
import { planSpeech } from "../tts/speechPlanner";
import { ConfigSettingsService } from "../application/configSettingsService";
import { HttpServer } from "../server/httpServer";
import { RestartService } from "../application/restartService";
import { KokoroEngine } from "../tts/engines/kokoro";
import { DictionaryService } from "../application/dictionaryService";
import { CsvDictionaryRepository } from "../storage/csvDictionaryRepository";
import { TwitchControlService } from "../application/twitchControlService";
import { SpeechInteractionService } from "../application/speechInteractionService";
import fs from "fs";
import path from "path";
import os from "os";
import { EngineManager, type Scheduler, type EngineBuilders } from "../tts/engineManager";
import type { PreparedAudio } from "../tts/engine";
import type { TwitchConnection } from "../application/twitchControlService";

class MockEngine implements TTSEngine {
  public name: string;
  public spokenTexts: string[] = [];
  public recordedOptions: (SpeechOptions | undefined)[] = [];
  public delayMs: number;

  constructor(name = "MockEngine", delayMs = 0) {
    this.name = name;
    this.delayMs = delayMs;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async say(text: string, options?: SpeechOptions): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    this.spokenTexts.push(text);
    this.recordedOptions.push(options);
  }
}

class FakeScheduler implements Scheduler {
  private nextId = 1;
  public timers = new Map<number, { fn: () => void; time: number }>();
  public currentTime = 0;

  setTimeout = (fn: () => void, ms: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { fn, time: this.currentTime + ms });
    return id;
  };

  clearTimeout = (id: unknown): void => {
    if (typeof id === "number") {
      this.timers.delete(id);
    }
  };

  advance(ms: number): void {
    this.currentTime += ms;
    while (true) {
      let earliest: [number, { fn: () => void; time: number }] | null = null;
      for (const entry of this.timers.entries()) {
        if (entry[1].time <= this.currentTime) {
          if (!earliest || entry[1].time < earliest[1].time) {
            earliest = entry;
          }
        }
      }
      if (!earliest) break;
      this.timers.delete(earliest[0]);
      earliest[1].fn();
    }
  }
}

class MockDisposableEngine implements TTSEngine {
  public readonly name: string;
  public available: boolean;
  public disposed = false;
  public stopped = false;
  public disposeCount = 0;
  public stopCount = 0;
  public spokenTexts: string[] = [];
  public prepareDelayMs = 0;
  public playDelayMs = 0;
  public prepareReject = false;
  public playReject = false;
  public isAvailableDelayMs = 0;

  constructor(name = "MockDisposableEngine", available = true) {
    this.name = name;
    this.available = available;
  }

  async isAvailable(): Promise<boolean> {
    if (this.isAvailableDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.isAvailableDelayMs));
    }
    return this.available;
  }

  async prepare(text: string, options?: SpeechOptions): Promise<PreparedAudio> {
    if (this.disposed) {
      throw new Error(`Engine ${this.name} is disposed`);
    }
    if (this.prepareReject) {
      throw new Error(`Engine ${this.name} prepare failed`);
    }
    if (this.prepareDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.prepareDelayMs));
    }
    return {
      play: async () => {
        if (this.disposed) throw new Error("Played while disposed");
        if (this.playReject) throw new Error("Play error");
        if (this.playDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.playDelayMs));
        }
        this.spokenTexts.push(text);
      },
    };
  }

  async say(text: string, options?: SpeechOptions): Promise<void> {
    const prep = await this.prepare(text, options);
    await prep.play();
  }

  stop(): void {
    this.stopped = true;
    this.stopCount++;
  }

  dispose(): void {
    this.disposed = true;
    this.disposeCount++;
    this.stop();
  }
}

describe("PR 1: Settings Store and Pinning", () => {
  // Test 1: Store
  describe("Test 1: Store", () => {
    it("freezes versions, keeps start immutable, and notifies subscribers with (next, prev)", () => {
      const initial = parseConfig({ READ_USERNAME: true, MASTER_VOLUME: 1.0 });
      const store = new SettingsStore(initial);

      expect(Object.isFrozen(store.current())).toBe(true);
      expect(Object.isFrozen(store.start)).toBe(true);
      expect(store.current().READ_USERNAME).toBe(true);

      const events: Array<{ next: any; prev: any }> = [];
      const unsub = store.subscribe((next, prev) => {
        events.push({ next, prev });
      });

      const updated = store.apply({ READ_USERNAME: false });
      expect(Object.isFrozen(updated)).toBe(true);
      expect(store.current().READ_USERNAME).toBe(false);
      // start never changes
      expect(store.start.READ_USERNAME).toBe(true);
      // previous object is intact
      expect(initial.READ_USERNAME).toBe(true);

      expect(events.length).toBe(1);
      expect(events[0]?.prev.READ_USERNAME).toBe(true);
      expect(events[0]?.next.READ_USERNAME).toBe(false);

      unsub();
      store.apply({ READ_USERNAME: true });
      expect(events.length).toBe(1); // No new event after unsub
    });
  });

  // Test 2: Pin across the transform await
  describe("Test 2: Pin across the transform await", () => {
    it("pins arrival settings and engine across transform await even if store and holder change", async () => {
      const store = new SettingsStore(
        parseConfig({
          READ_USERNAME: true,
          AUTO_ACCELERATE: true,
          MAX_ACCELERATION_SPEED: 1.6,
          COMMENT_TTL_SECONDS: 30,
        })
      );
      const engine1 = new MockEngine("Engine1");
      const engine2 = new MockEngine("Engine2");
      const holder = new EngineHolder({ primary: engine1, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engine1, 50, undefined, undefined, { store, engineHolder: holder });

      let resolveTransform: () => void = () => {};
      const deferredTransform = new Promise<void>((resolve) => {
        resolveTransform = () => resolve();
      });

      const deferredTransformer: TextTransformer = {
        name: "DeferredTransformer",
        transform: async (input: string) => {
          await deferredTransform;
          return `${input} Transformed`;
        },
      };

      const origNow = Date.now;
      let mockTime = 1000000;
      Date.now = () => mockTime;

      try {
        // Start processing long comment while transformer is delayed (> 120 chars to trigger speedScale 1.6)
        const commentText = "Hello " + "A".repeat(150);
        const processingPromise = processComment(
          { rawUsername: "Alice", rawText: commentText, service: "HTTP" },
          { ttsQueue: queue, transformer: deferredTransformer }
        );

        // While transformer is waiting, apply settings changes and swap holder engine
        store.apply({
          READ_USERNAME: false,
          AUTO_ACCELERATE: false,
          MAX_ACCELERATION_SPEED: 1.1,
          COMMENT_TTL_SECONDS: 5,
        });
        holder.replace({ primary: engine2, primaryName: "VOICEVOX" });

        // Settle transform
        resolveTransform();
        const result = await processingPromise;

        // Pinned settings at arrival had READ_USERNAME: true, AUTO_ACCELERATE: true, MAX_ACCELERATION_SPEED: 1.6, COMMENT_TTL_SECONDS: 30
        expect(result.settings.READ_USERNAME).toBe(true);
        expect(result.settings.AUTO_ACCELERATE).toBe(true);
        expect(result.settings.MAX_ACCELERATION_SPEED).toBe(1.6);
        expect(result.settings.COMMENT_TTL_SECONDS).toBe(30);
        expect(result.speechText).toContain("Alice");

        // TTL expiry check: 10s elapsed (> new store TTL 5s, <= arrival TTL 30s)
        mockTime += 10000;
        const policy = new TTSQueuePolicy(store);
        expect(
          policy.isExpired(
            { text: result.speechText ?? "", enqueuedAt: 1000000, settings: result.settings },
            mockTime
          )
        ).toBe(false);
        expect(
          policy.isExpired(
            { text: result.speechText ?? "", enqueuedAt: 1000000, settings: store.current() },
            mockTime
          )
        ).toBe(true);

        // Wait for queue to process
        await new Promise((r) => setTimeout(r, 50));

        // Engine1 was chosen and retained; engine2 was NOT used for this comment
        expect(engine1.spokenTexts.length).toBe(1);
        expect(engine2.spokenTexts.length).toBe(0);
        expect(engine1.spokenTexts[0]).toContain("Alice");

        // speedScale asserted: arrival scale 1.6, not changed store scale 1.0 / 1.1
        expect(engine1.recordedOptions[0]?.speedScale).toBe(1.6);
      } finally {
        Date.now = origNow;
      }
    });
  });

  // Test 3: Pin between enqueue and playback
  describe("Test 3: Pin between enqueue and playback", () => {
    it("item plays with arrival engine, speed scale, and TTL even after later store apply and clock advance", async () => {
      const store = new SettingsStore(
        parseConfig({
          COMMENT_TTL_SECONDS: 30,
          AUTO_ACCELERATE: true,
          MAX_ACCELERATION_SPEED: 1.8,
        })
      );
      const engine1 = new MockEngine("Engine1", 30);
      const engine2 = new MockEngine("Engine2");
      const holder = new EngineHolder({ primary: engine1, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engine1, 50, undefined, undefined, { store, engineHolder: holder });

      const origNow = Date.now;
      let mockTime = 1000000;
      Date.now = () => mockTime;

      try {
        const pin1 = queue.pin();
        const p1 = queue.enqueue("Item 1", { pin: pin1, engine: pin1.engines.primary });
        pin1.release();

        const pin2 = queue.pin();
        const longText = "Item 2 (TTL 30) " + "B".repeat(150);
        const p2 = queue.enqueue(longText, { pin: pin2, engine: pin2.engines.primary });
        pin2.release();

        // While item 1 is playing, apply strict TTL 1s and lower speed cap
        store.apply({ COMMENT_TTL_SECONDS: 1, MAX_ACCELERATION_SPEED: 1.1, AUTO_ACCELERATE: false });
        holder.replace({ primary: engine2, primaryName: "VOICEVOX" });

        // Advance clock by 5s (item 2 would expire under new TTL 1s, but keeps arrival TTL 30s)
        mockTime += 5000;

        await Promise.all([p1, p2]);

        // Item 2 was NOT dropped and played on Engine1
        expect(engine1.spokenTexts).toEqual(["Item 1", longText]);
        expect(engine2.spokenTexts.length).toBe(0);

        // speedScale asserted: arrival speedScale 1.6 (under arrival MAX_ACCELERATION_SPEED 1.8), not 1.0 or 1.1
        expect(engine1.recordedOptions[1]?.speedScale).toBe(1.6);
      } finally {
        Date.now = origNow;
      }
    });
  });

  // Test 4: Pinning on other paths
  describe("Test 4: Pinning on other paths", () => {
    it("speechPlanner respects KATAKANA guard when NATIVE mode lacks English engine", async () => {
      const store = new SettingsStore(parseConfig({ FOREIGN_LANGUAGE_MODE: "NATIVE" }));
      const primaryEngine = new MockEngine("PrimaryJP");
      const holder = new EngineHolder({ primary: primaryEngine, primaryName: "COEIROINK" });
      const queue = new TTSQueue(primaryEngine, 50, undefined, undefined, { store, engineHolder: holder });

      const pin = queue.pin();
      const plan = await planSpeech("Good morning", pin, {
        transformer: { name: "MockTransformer", transform: async (t) => "グッドモーニング" },
      });
      pin.release();

      expect(plan.ignored).toBe(false);
      expect(plan.engine).toBe(primaryEngine);
      expect(plan.text).toBe("グッドモーニング");
    });

    it("demo enqueues with pin taken once across steps", async () => {
      const store = new SettingsStore(parseConfig({}));
      const primaryEngine = new MockEngine("Primary", 50);
      const holder = new EngineHolder({ primary: primaryEngine, primaryName: "COEIROINK" });
      const queue = new TTSQueue(primaryEngine, 50, undefined, undefined, { store, engineHolder: holder });
      const interaction = new SpeechInteractionService(queue);

      await interaction.enqueueDemo();
      expect(queue.pendingCount).toBeGreaterThan(0);
    });
  });

  // Test 8: Kokoro stop and process-identity guard
  describe("Test 8: Kokoro stop and process identity", () => {
    interface MockSubprocessMembers {
      stdin: {
        write: (data: string | Uint8Array) => void;
        flush: () => void;
      };
      stdout: ReadableStream<Uint8Array>;
      exited: Promise<number>;
      kill: (exitCode?: number) => void;
    }

    function isSubprocess(val: unknown): val is ReturnType<typeof Bun.spawn> {
      return (
        typeof val === "object" &&
        val !== null &&
        "stdin" in val &&
        "stdout" in val &&
        "exited" in val &&
        "kill" in val
      );
    }

    function toSubprocess(proc: MockSubprocessMembers): ReturnType<typeof Bun.spawn> {
      if (isSubprocess(proc)) {
        return proc;
      }
      throw new TypeError("proc does not satisfy Subprocess shape");
    }

    it("case 1: stop() during in-flight request rejects request immediately", async () => {
      let procKilled = false;
      let stdoutController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stdoutStream = new ReadableStream<Uint8Array>({
        start(c) {
          stdoutController = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      let exitResolve: ((code: number) => void) | undefined;
      const exitPromise = new Promise<number>((r) => {
        exitResolve = r;
      });

      const mockProc: MockSubprocessMembers = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: stdoutStream,
        exited: exitPromise,
        kill: () => {
          procKilled = true;
          if (exitResolve) {
            exitResolve(0);
          }
        },
      };

      const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
        return toSubprocess(mockProc);
      });
      const kokoroTmp = fs.mkdtempSync(path.join(os.tmpdir(), "kokoro-test-case1-"));

      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script", 1.0, kokoroTmp);
        // Start prepare in background
        const preparePromise = kokoro.prepare("Hello");

        // Wait microtask so request is sent and queued in currentRequest
        await new Promise((r) => setTimeout(r, 10));

        // Call stop while request is in-flight
        kokoro.stop();

        expect(procKilled).toBe(true);
        await expect(preparePromise).rejects.toThrow("Worker stopped while request was in-flight");
      } finally {
        spawnSpy.mockRestore();
        fs.rmSync(kokoroTmp, { recursive: true, force: true });
      }
    });

    it("case 2: stop() during worker startup rejects pending startup", async () => {
      let stdoutController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stdoutStream = new ReadableStream<Uint8Array>({
        start(c) {
          stdoutController = c;
          // Never emit READY
        },
      });

      let exitResolve: ((code: number) => void) | undefined;
      const exitPromise = new Promise<number>((r) => {
        exitResolve = r;
      });

      const mockProc: MockSubprocessMembers = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: stdoutStream,
        exited: exitPromise,
        kill: () => {
          if (exitResolve) {
            exitResolve(0);
          }
        },
      };

      const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
        return toSubprocess(mockProc);
      });
      const kokoroTmp = fs.mkdtempSync(path.join(os.tmpdir(), "kokoro-test-case2-"));

      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script", 1.0, kokoroTmp);
        const preparePromise = kokoro.prepare("Hello");

        await new Promise((r) => setTimeout(r, 10));

        kokoro.stop();

        await expect(preparePromise).rejects.toThrow("Worker stopped during startup");
      } finally {
        spawnSpy.mockRestore();
        fs.rmSync(kokoroTmp, { recursive: true, force: true });
      }
    });

    it("case 3 & process identity guard: stop-then-prepare spawns fresh worker and old exit doesn't affect it", async () => {
      let spawnCount = 0;
      let exit1Resolve: ((code: number) => void) | undefined;
      const exit1 = new Promise<number>((r) => {
        exit1Resolve = r;
      });
      let c1: ReadableStreamDefaultController<Uint8Array> | undefined;
      const s1 = new ReadableStream<Uint8Array>({
        start(c) {
          c1 = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      let c2: ReadableStreamDefaultController<Uint8Array> | undefined;
      const s2 = new ReadableStream<Uint8Array>({
        start(c) {
          c2 = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      const proc1: MockSubprocessMembers = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: s1,
        exited: exit1,
        kill: () => {},
      };

      const proc2: MockSubprocessMembers = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: s2,
        exited: new Promise<number>(() => {}),
        kill: () => {},
      };

      const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
        spawnCount++;
        return toSubprocess(spawnCount === 1 ? proc1 : proc2);
      });
      const kokoroTmp = fs.mkdtempSync(path.join(os.tmpdir(), "kokoro-test-case3-"));

      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script", 1.0, kokoroTmp);
        // Start worker 1
        await (kokoro as any).ensureWorkerStarted();
        expect(spawnCount).toBe(1);
        expect((kokoro as any).proc).toBe(proc1);

        // Stop worker 1
        kokoro.stop();
        expect((kokoro as any).proc).toBe(null);
        expect((kokoro as any).readyPromise).toBe(null);

        // Start worker 2 (stop-then-prepare starts fresh worker)
        await (kokoro as any).ensureWorkerStarted();
        expect(spawnCount).toBe(2);
        expect((kokoro as any).proc).toBe(proc2);

        // Now fire proc1 exited late: process identity guard must ignore it
        expect(exit1Resolve).toBeDefined();
        if (exit1Resolve) {
          exit1Resolve(1);
        }
        await new Promise((r) => setTimeout(r, 10));

        // Kokoro must still be alive with proc2
        expect((kokoro as any).proc).toBe(proc2);
        expect((kokoro as any).isReady).toBe(true);
      } finally {
        spawnSpy.mockRestore();
        fs.rmSync(kokoroTmp, { recursive: true, force: true });
      }
    });

    it("case 4: process identity guard prevents stdout line of killed worker from resolving restarted worker request", async () => {
      let spawnCount = 0;
      let c1: ReadableStreamDefaultController<Uint8Array> | undefined;
      const s1 = new ReadableStream<Uint8Array>({
        start(c) {
          c1 = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      let c2: ReadableStreamDefaultController<Uint8Array> | undefined;
      const s2 = new ReadableStream<Uint8Array>({
        start(c) {
          c2 = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      const proc1: MockSubprocessMembers = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: s1,
        exited: new Promise<number>(() => {}),
        kill: () => {},
      };

      let outputPath2 = "";
      const proc2: MockSubprocessMembers = {
        stdin: {
          write: (data: string | Uint8Array) => {
            try {
              const text = typeof data === "string" ? data : new TextDecoder().decode(data);
              const payload = JSON.parse(text);
              if (payload.outputPath) {
                outputPath2 = payload.outputPath;
                fs.writeFileSync(outputPath2, Buffer.from("RIFF dummy wav data"));
              }
            } catch {}
          },
          flush: () => {},
        },
        stdout: s2,
        exited: new Promise<number>(() => {}),
        kill: () => {},
      };

      const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
        spawnCount++;
        return toSubprocess(spawnCount === 1 ? proc1 : proc2);
      });
      const kokoroTmp = fs.mkdtempSync(path.join(os.tmpdir(), "kokoro-test-case4-"));

      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script", 1.0, kokoroTmp);

        // 1. Prepare on worker 1, then stop it while request is in flight
        const p1 = kokoro.prepare("Worker 1 text");
        await new Promise((r) => setTimeout(r, 10));
        kokoro.stop();
        await expect(p1).rejects.toThrow();

        // 2. Prepare on restarted worker 2
        const p2 = kokoro.prepare("Worker 2 text");
        await new Promise((r) => setTimeout(r, 10));

        // 3. Worker 1's stdout reader emits late error line
        // If the process identity guard failed, p2 would reject with this error!
        expect(c1).toBeDefined();
        if (c1) {
          c1.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ status: "error", error: "killed worker 1 error" }) + "\n"
            )
          );
        }
        await new Promise((r) => setTimeout(r, 10));

        // Worker 2 emits its own successful response:
        expect(c2).toBeDefined();
        if (c2) {
          c2.enqueue(new TextEncoder().encode(JSON.stringify({ status: "ok" }) + "\n"));
        }

        const audio = await p2;
        expect(audio).toBeDefined();
        expect(typeof audio.play).toBe("function");
      } finally {
        spawnSpy.mockRestore();
        fs.rmSync(kokoroTmp, { recursive: true, force: true });
      }
    });

    it("case 5: dispose() permanently disables engine; prepare rejects and Bun.spawn is not called", async () => {
      let spawnCount = 0;
      const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
        spawnCount++;
        throw new Error("Bun.spawn should not be called");
      });

      const kokoroTmp = fs.mkdtempSync(path.join(os.tmpdir(), "kokoro-test-case5-"));
      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script", 1.0, kokoroTmp);
        kokoro.dispose();
        expect(spawnCount).toBe(0);
        await expect(kokoro.prepare("Hello")).rejects.toThrow("Engine has been disposed");
        expect(spawnCount).toBe(0);
      } finally {
        spawnSpy.mockRestore();
        fs.rmSync(kokoroTmp, { recursive: true, force: true });
      }
    });
  });

  // Test 8c: PR 2 state
  describe("Test 8c: PR 2 state", () => {
    it("engine keys and BILINGAL_MODE DO enter store on save and are live", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-pr2-"));
      const filePath = path.join(tmpDir, "web-settings.json");
      const store = new SettingsStore(parseConfig({}));
      const service = new ConfigSettingsService(filePath, store);

      const snapshot = service.update({
        COEIROINK_HOST: "new-host",
        VOICEVOX_SPEED_SCALE: 1.5,
        BILINGAL_MODE: true,
        READ_USERNAME: false,
      });

      // Group A key entered the store
      expect(store.current().READ_USERNAME).toBe(false);
      // Engine keys and BILINGAL_MODE DO enter the store in PR 2
      expect(store.current().COEIROINK_HOST).toBe("new-host");
      expect(store.current().VOICEVOX_SPEED_SCALE).toBe(1.5);
      expect(store.current().BILINGAL_MODE).toBe(true);

      // They are live, NOT marked restartRequired and NOT in restartKeys
      expect(snapshot.restartKeys).not.toContain("COEIROINK_HOST");
      expect(snapshot.restartKeys).not.toContain("VOICEVOX_SPEED_SCALE");
      expect(snapshot.restartKeys).not.toContain("BILINGAL_MODE");
      expect(snapshot.restartKeys).not.toContain("READ_USERNAME");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // Test 10: Settings service
  describe("Test 10: Settings service", () => {
    it("only applies request keys to store, calculates PR 2 restartRequired/restartKeys accurately", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-service-"));
      const filePath = path.join(tmpDir, "web-settings.json");

      // Write existing file with unrelated restart key
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          ENABLE_TWITCH: false,
          READ_USERNAME: false,
        })
      );

      const store = new SettingsStore(parseConfig({ ENABLE_TWITCH: true, READ_USERNAME: true }));
      const service = new ConfigSettingsService(filePath, store);

      // Save only AUTO_ACCELERATE
      const snapshot = service.update({ AUTO_ACCELERATE: false });

      // Only AUTO_ACCELERATE entered store, NOT READ_USERNAME from file
      expect(store.current().AUTO_ACCELERATE).toBe(false);
      expect(store.current().READ_USERNAME).toBe(true);

      // ENABLE_TWITCH is restart-bound and in restartKeys
      expect(snapshot.restartRequired).toBe(true);
      expect(snapshot.restartKeys).toContain("ENABLE_TWITCH");

      // STARTING_MESSAGE is next-start, in nextStartKeys, NOT in restartKeys
      const snapshot2 = service.update({ STARTING_MESSAGE: "Hello!" });
      expect(snapshot2.restartKeys).not.toContain("STARTING_MESSAGE");
      expect(snapshot2.nextStartKeys).toContain("STARTING_MESSAGE");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("FOREIGN_LANGUAGE_MODE = NATIVE is live and does not appear in restartKeys (Q72-2 c addition)", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-flm-"));
      const filePath = path.join(tmpDir, "web-settings.json");
      const store = new SettingsStore(parseConfig({}));

      // Case 1: Holder has NO English engine
      const holderNoEng = new EngineHolder({ primary: new MockEngine(), primaryName: "COEIROINK" });
      const serviceNoEng = new ConfigSettingsService(filePath, store, undefined, undefined, holderNoEng);
      const snapNoEng = serviceNoEng.update({ FOREIGN_LANGUAGE_MODE: "NATIVE" });
      expect(snapNoEng.restartKeys).not.toContain("FOREIGN_LANGUAGE_MODE");
      expect(store.current().FOREIGN_LANGUAGE_MODE).toBe("NATIVE");

      // Case 2: Holder HAS English engine
      const holderWithEng = new EngineHolder({
        primary: new MockEngine(),
        primaryName: "COEIROINK",
        english: new MockEngine(),
        englishName: "KOKORO",
      });
      const serviceWithEng = new ConfigSettingsService(filePath, store, undefined, undefined, holderWithEng);
      const snapWithEng = serviceWithEng.update({ FOREIGN_LANGUAGE_MODE: "NATIVE" });
      expect(snapWithEng.restartKeys).not.toContain("FOREIGN_LANGUAGE_MODE");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("handles DELETE of one key, DELETE of all, and reset to default value", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-delete-"));
      const filePath = path.join(tmpDir, "web-settings.json");
      const store = new SettingsStore(parseConfig({ READ_USERNAME: true, AUTO_ACCELERATE: true }));
      const service = new ConfigSettingsService(filePath, store);

      // Save overrides for two keys (READ_USERNAME default is false, AUTO_ACCELERATE default is true)
      service.update({ READ_USERNAME: true, AUTO_ACCELERATE: false });
      expect(store.current().READ_USERNAME).toBe(true);
      expect(store.current().AUTO_ACCELERATE).toBe(false);
      let fileContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(fileContent.READ_USERNAME).toBe(true);
      expect(fileContent.AUTO_ACCELERATE).toBe(false);

      // 1. DELETE of one key: removes only that key from web-settings.json, restores default in store
      const snapAfterOneDelete = service.remove("READ_USERNAME");
      expect(store.current().READ_USERNAME).toBe(false); // default restored in store
      expect(store.current().AUTO_ACCELERATE).toBe(false); // second key retained
      fileContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(fileContent.READ_USERNAME).toBeUndefined();
      expect(fileContent.AUTO_ACCELERATE).toBe(false);
      expect(snapAfterOneDelete.settings.find((s) => s.key === "READ_USERNAME")?.isOverridden).toBe(false);
      expect(snapAfterOneDelete.settings.find((s) => s.key === "AUTO_ACCELERATE")?.isOverridden).toBe(true);

      // 2. Reset to default value via update: setting AUTO_ACCELERATE back to its default removes override
      const snapAfterReset = service.update({ AUTO_ACCELERATE: true });
      expect(snapAfterReset.settings.find((s) => s.key === "AUTO_ACCELERATE")?.isOverridden).toBe(false);
      expect(store.current().AUTO_ACCELERATE).toBe(true);
      // Since all overrides removed, file was unlinked
      expect(fs.existsSync(filePath)).toBe(false);

      // 3. DELETE of all: save two keys again, then remove()
      service.update({ READ_USERNAME: true, AUTO_ACCELERATE: false });
      expect(fs.existsSync(filePath)).toBe(true);
      const snapAfterAllDelete = service.remove();
      expect(fs.existsSync(filePath)).toBe(false);
      expect(store.current().READ_USERNAME).toBe(false);
      expect(store.current().AUTO_ACCELERATE).toBe(true);
      expect(snapAfterAllDelete.settings.every((s) => !s.isOverridden)).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // Test 11: HTTP
  describe("Test 11: HTTP endpoints", () => {
    it("PUT /api/settings applies Group A live to /say, and GET /api/status reports live engine", async () => {
      const port = 3958;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-http-"));
      const filePath = path.join(tmpDir, "web-settings.json");
      // Distinguish store TTS_ENGINE ("VOICEVOX") from holder primaryName ("COEIROINK")
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "VOICEVOX", READ_USERNAME: true }));
      const engine = new MockEngine("StatusEngine");
      const holder = new EngineHolder({ primary: engine, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engine, 50, undefined, undefined, { store, engineHolder: holder });
      const bot = { isConnected: () => false } as any;

      const server = new HttpServer({
        queue,
        store,
        engineHolder: holder,
        dictionaryService: new DictionaryService(new CsvDictionaryRepository()),
        twitchControlService: new TwitchControlService(bot),
        speechInteractionService: new SpeechInteractionService(queue),
        configSettingsService: new ConfigSettingsService(filePath, store, undefined, undefined, holder),
        port,
        bouyomiPort: 50098,
        enableBouyomiCompat: false,
      });

      server.start();

      try {
        // GET /api/status reports holder's engine name ("COEIROINK"), distinguishing it from store ("VOICEVOX")
        const statusRes = await fetch(`http://127.0.0.1:${port}/api/status`);
        expect(statusRes.status).toBe(200);
        const statusData = (await statusRes.json()) as any;
        expect(statusData.engine).toBe("COEIROINK");
        expect(statusData.engine).not.toBe(store.current().TTS_ENGINE);
        expect(store.current().TTS_ENGINE).toBe("VOICEVOX");
        expect(holder.current().primaryName).toBe("COEIROINK");

        // PUT /api/settings applies Group A live
        const putRes = await fetch(`http://127.0.0.1:${port}/api/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ READ_USERNAME: false }),
        });
        expect(putRes.status).toBe(200);
        expect(store.current().READ_USERNAME).toBe(false);

        // POST /say reflects new setting immediately
        const sayRes = await fetch(`http://127.0.0.1:${port}/say`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "Bob", text: "Test message" }),
        });
        expect(sayRes.status).toBe(200);

        await new Promise((r) => setTimeout(r, 50));
        // Bob was NOT prepended
        expect(engine.spokenTexts[0]).toBe("Test message");
      } finally {
        server.stop();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

describe("PR 2: Engines Live, Swap at Idle, Cut-over, Pending State", () => {
  // Test 5: Idle and in use
  describe("Test 5: Idle and in use", () => {
    it("onIdle fires after normal drain, retry exhaustion, TTL drop, clear, play error", async () => {
      const store = new SettingsStore(parseConfig({}));
      const engine = new MockDisposableEngine("EngineNormal");
      const holder = new EngineHolder({ primary: engine, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engine, 50, undefined, undefined, { store, engineHolder: holder });

      let idleCount = 0;
      queue.onIdle(() => {
        idleCount++;
      });

      // 1. Initially idle
      expect(queue.isIdle()).toBe(true);

      // 2. Normal drain
      await queue.enqueue("Hello normal");
      await new Promise((r) => setTimeout(r, 20));
      expect(queue.isIdle()).toBe(true);
      expect(idleCount).toBeGreaterThanOrEqual(1);

      // 3. Retry exhaustion (failing prepare)
      const failEngine = new MockDisposableEngine("FailEngine");
      failEngine.prepareReject = true;
      const queueFail = new TTSQueue(failEngine, 50, undefined, undefined, { store, engineHolder: holder });
      let failIdleCount = 0;
      queueFail.onIdle(() => {
        failIdleCount++;
      });
      await queueFail.enqueue("Will fail");
      await new Promise((r) => setTimeout(r, 30));
      expect(queueFail.isIdle()).toBe(true);
      expect(failIdleCount).toBeGreaterThanOrEqual(1);

      // 4. TTL drop (enqueued with past timestamp)
      const queueTtl = new TTSQueue(engine, 50, undefined, undefined, { store, engineHolder: holder });
      let ttlIdleCount = 0;
      queueTtl.onIdle(() => {
        ttlIdleCount++;
      });
      await queueTtl.enqueue("Expired text", { enqueuedAt: Date.now() - 100000 });
      await new Promise((r) => setTimeout(r, 30));
      expect(queueTtl.isIdle()).toBe(true);
      expect(ttlIdleCount).toBeGreaterThanOrEqual(1);

      // 5. Play error
      const playFailEngine = new MockDisposableEngine("PlayFailEngine");
      playFailEngine.playReject = true;
      const queuePlayFail = new TTSQueue(playFailEngine, 50, undefined, undefined, { store, engineHolder: holder });
      let playFailIdleCount = 0;
      queuePlayFail.onIdle(() => {
        playFailIdleCount++;
      });
      await queuePlayFail.enqueue("Play error test");
      await new Promise((r) => setTimeout(r, 30));
      expect(queuePlayFail.isIdle()).toBe(true);
      expect(playFailIdleCount).toBeGreaterThanOrEqual(1);

      // 6. clear() during synthesis / playback
      const slowEngine = new MockDisposableEngine("SlowEngine");
      slowEngine.prepareDelayMs = 40;
      const queueSlow = new TTSQueue(slowEngine, 50, undefined, undefined, { store, engineHolder: holder });
      let slowIdleCount = 0;
      queueSlow.onIdle(() => {
        slowIdleCount++;
      });
      const pSlow = queueSlow.enqueue("Slow prepare text");
      queueSlow.clear();
      await pSlow;
      await new Promise((r) => setTimeout(r, 50));
      expect(queueSlow.isIdle()).toBe(true);
      expect(slowIdleCount).toBeGreaterThanOrEqual(1);

      // 7. Throwing listener does not stall the queue (M2)
      let healthyListenerCalled = false;
      queue.onIdle(() => {
        throw new Error("Throwing listener intentional error");
      });
      queue.onIdle(() => {
        healthyListenerCalled = true;
      });
      await queue.enqueue("Safe from listener error");
      await new Promise((r) => setTimeout(r, 20));
      expect(healthyListenerCalled).toBe(true);
      expect(queue.isIdle()).toBe(true);

      // 8. Idempotent pin release
      const pin = queue.pin();
      expect(queue.isIdle()).toBe(false);
      pin.release();
      pin.release(); // release twice counts once
      await new Promise((r) => setTimeout(r, 20));
      expect(queue.isIdle()).toBe(true);
    });

    it("isInUse accurately tracks engine references across pins, queues, and prepares", async () => {
      const store = new SettingsStore(parseConfig({}));
      const engineA = new MockDisposableEngine("EngineA");
      const engineB = new MockDisposableEngine("EngineB");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });

      expect(queue.isInUse(engineA)).toBe(false);
      expect(queue.isInUse(engineB)).toBe(false);

      // 1. Pinned
      const pin = queue.pin();
      expect(queue.isInUse(engineA)).toBe(true);
      expect(queue.isInUse(engineB)).toBe(false);
      pin.release();
      await new Promise((r) => setTimeout(r, 10));
      expect(queue.isInUse(engineA)).toBe(false);

      // 2. Queued items
      engineB.prepareDelayMs = 40;
      const pB = queue.enqueue("Hello B", { engine: engineB });
      expect(queue.isInUse(engineB)).toBe(true);
      await pB;
      await new Promise((r) => setTimeout(r, 20));
      expect(queue.isInUse(engineB)).toBe(false);

      // 3. In-flight prepares (via prefetch while engineA plays)
      engineA.playDelayMs = 60;
      engineB.prepareDelayMs = 60;
      const pA = queue.enqueue("Hello A playing", { engine: engineA });
      await new Promise((r) => setTimeout(r, 10)); // wait for item A to begin playing
      const pB2 = queue.enqueue("Hello B prefetching", { engine: engineB });
      await new Promise((r) => setTimeout(r, 10)); // prefetch started for B
      expect(queue.isInUse(engineB)).toBe(true);
      await Promise.all([pA, pB2]);
      await new Promise((r) => setTimeout(r, 20));
      expect(queue.isInUse(engineB)).toBe(false);
    });
  });

  // Test 6: Swap
  describe("Test 6: Swap", () => {
    it("waiting candidate is not swapped while busy; swapped at idle; old engine dispose called once", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const engineB = new MockDisposableEngine("VOICEVOX");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => (name === "VOICEVOX" ? engineB : engineA),
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Hold pin to make queue busy
      const pin = queue.pin();
      expect(queue.isIdle()).toBe(false);

      // Request engine change to VOICEVOX
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));

      // Candidate is waiting because queue is not idle
      expect(manager.pending()?.stage).toBe("waiting");
      expect(holder.current().primaryName).toBe("COEIROINK");
      expect(engineA.disposeCount).toBe(0);

      // Release pin -> queue becomes idle -> swap occurs!
      pin.release();
      await new Promise((r) => setTimeout(r, 20));

      expect(holder.current().primaryName).toBe("VOICEVOX");
      expect(manager.pending()).toBe(null);
      expect(engineA.disposeCount).toBe(1);
    });

    it("only changed engine is rebuilt; unavailable candidate enters failed stage and keeps old engine", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const engineDead = new MockDisposableEngine("VOICEVOX", false);
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: () => engineDead,
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Apply unavailable engine
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.pending()?.stage).toBe("failed");
      expect(holder.current().primaryName).toBe("COEIROINK");

      // Supersede back to current engine values (M4)
      store.apply({ TTS_ENGINE: "COEIROINK" });
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.pending()).toBe(null);
      expect(holder.current().primaryName).toBe("COEIROINK");
      expect(engineDead.disposeCount).toBe(1); // unused candidate stopped/disposed
    });
  });

  // Test 7: Fallback / Cut-over (Q72-1 b)
  describe("Test 7: Fallback / Cut-over (Q72-1 b)", () => {
    it("60 s after waiting begins, cut-over applies new engine to arrivals while old items finish", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const engineB = new MockDisposableEngine("VOICEVOX");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => (name === "VOICEVOX" ? engineB : engineA),
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Hold a pin representing in-progress comment
      const pinOld = queue.pin();

      // Change setting to VOICEVOX
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.pending()?.stage).toBe("waiting");
      expect(holder.current().primaryName).toBe("COEIROINK");

      // Advance scheduler 60 s -> cut-over triggers!
      scheduler.advance(60000);
      await new Promise((r) => setTimeout(r, 10));

      // Holder is updated to VOICEVOX for new arrivals
      expect(holder.current().primaryName).toBe("VOICEVOX");
      expect(manager.pending()).toBe(null);

      // New arrivals get new engine
      const pinNew = queue.pin();
      expect(pinNew.engines.primaryName).toBe("VOICEVOX");

      // Old engine is NOT yet disposed while pinOld is held
      expect(engineA.disposeCount).toBe(0);
      expect(queue.isInUse(engineA)).toBe(true);

      // Release old pin
      pinOld.release();
      await new Promise((r) => setTimeout(r, 20));

      // Now old engine is disposed!
      expect(engineA.disposeCount).toBe(1);
      pinNew.release();
    });
  });

  // Test 8a: Rebuild predicate (N1)
  describe("Test 8a: Rebuild predicate (N1)", () => {
    it("inactive engine keys and KATAKANA<->IGNORE rebuild nothing; active input rebuilds engine", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK", FOREIGN_LANGUAGE_MODE: "KATAKANA" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      let buildCount = 0;
      const builders: EngineBuilders = {
        createEngine: (name) => {
          buildCount++;
          return new MockDisposableEngine(name);
        },
        createEnglishEngine: () => new MockDisposableEngine("KokoroEng"),
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);
      expect(buildCount).toBe(0);

      // 1. Changing VOICEVOX_SPEED_SCALE while COEIROINK is primary rebuilds nothing
      store.apply({ VOICEVOX_SPEED_SCALE: 1.8 });
      await new Promise((r) => setTimeout(r, 10));
      expect(buildCount).toBe(0);
      expect(manager.pending()).toBe(null);

      // 2. Changing FOREIGN_LANGUAGE_MODE from KATAKANA to IGNORE rebuilds nothing
      store.apply({ FOREIGN_LANGUAGE_MODE: "IGNORE" });
      await new Promise((r) => setTimeout(r, 10));
      expect(buildCount).toBe(0);
      expect(manager.pending()).toBe(null);

      // 3. Changing COEIROINK_HOST (active engine input) rebuilds COEIROINK
      const pinHeld = queue.pin();
      store.apply({ COEIROINK_HOST: "http://127.0.0.1:50033" });
      await new Promise((r) => setTimeout(r, 10));
      expect(buildCount).toBe(1);
      expect(manager.pending()?.target).toBe("COEIROINK");
      pinHeld.release();
      await new Promise((r) => setTimeout(r, 20));
      expect(manager.pending()).toBe(null);

      // 4. Turning on BILINGAL_MODE adds English engine
      store.apply({ BILINGAL_MODE: true });
      await new Promise((r) => setTimeout(r, 10));
      expect(holder.current().english).toBeDefined();

      // 5. Turning off need removes English engine
      store.apply({ BILINGAL_MODE: false, FOREIGN_LANGUAGE_MODE: "KATAKANA" });
      await new Promise((r) => setTimeout(r, 10));
      expect(holder.current().english).toBeUndefined();
    });
  });

  // Test 8b: failed recovery (N2)
  describe("Test 8b: failed recovery (N2)", () => {
    it("10 s re-probe turns failed into waiting once engine becomes available", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const targetEngine = new MockDisposableEngine("VOICEVOX", false);
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: () => targetEngine,
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Switch to VOICEVOX
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.pending()?.stage).toBe("failed");
      expect(manager.pending()?.error).toBeDefined();

      // Make engine available
      targetEngine.available = true;

      // Advance scheduler by 10 s -> re-probe triggers
      scheduler.advance(10000);
      await new Promise((r) => setTimeout(r, 20));

      // Swapped in at idle
      expect(holder.current().primaryName).toBe("VOICEVOX");
      expect(manager.pending()).toBe(null);
    });
  });

  // Test 8d: Q72-2 (c)
  describe("Test 8d: Q72-2 (c)", () => {
    it("pin taken before English addition keeps set without it; English added live without idle wait", async () => {
      const store = new SettingsStore(parseConfig({ FOREIGN_LANGUAGE_MODE: "KATAKANA" }));
      const enginePrimary = new MockDisposableEngine("COEIROINK");
      const engineEng = new MockDisposableEngine("KokoroEng");
      const holder = new EngineHolder({ primary: enginePrimary, primaryName: "COEIROINK" });
      const queue = new TTSQueue(enginePrimary, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: () => enginePrimary,
        createEnglishEngine: () => engineEng,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);
      expect(holder.current().english).toBeUndefined();

      // Pin taken BEFORE English engine exists
      const pinBefore = queue.pin();
      expect(pinBefore.engines.english).toBeUndefined();

      // Turn on NATIVE mode
      store.apply({ FOREIGN_LANGUAGE_MODE: "NATIVE" });
      await new Promise((r) => setTimeout(r, 10));

      // English engine added live at once without idle wait!
      expect(holder.current().english).toBe(engineEng);

      // Speech planned with pinBefore uses KATAKANA guard
      const planBefore = await planSpeech("Hello there!", pinBefore);
      expect(planBefore.engine.name).toBe("COEIROINK");

      // Speech planned with pinAfter uses English engine
      const pinAfter = queue.pin();
      expect(pinAfter.engines.english).toBe(engineEng);
      const planAfter = await planSpeech("Hello there!", pinAfter);
      expect(planAfter.engine.name).toBe("KokoroEng");

      pinBefore.release();
      pinAfter.release();
    });
  });

  // Test 8e: Start-up fallback (R3-2, R3-3)
  describe("Test 8e: Start-up fallback (R3-2, R3-3)", () => {
    it("configured engine kept as failed candidate and re-probed; 120 s retirement cap disposes engine held by hung prepare", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const fallbackEngine = new MockDisposableEngine("VOICEVOX");
      const configuredEngine = new MockDisposableEngine("COEIROINK", false);
      const holder = new EngineHolder({ primary: fallbackEngine, primaryName: "VOICEVOX" });
      const queue = new TTSQueue(fallbackEngine, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      let voicevoxRebuildCount = 0;
      const builders: EngineBuilders = {
        createEngine: (name) => {
          if (name === "COEIROINK") return configuredEngine;
          voicevoxRebuildCount++;
          return fallbackEngine;
        },
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Initial state: primaryName != TTS_ENGINE, so candidate is failed
      expect(manager.pending()?.stage).toBe("failed");
      expect(manager.pending()?.target).toBe("COEIROINK");

      // Changing VOICEVOX input rebuilds fallback VOICEVOX
      store.apply({ VOICEVOX_SPEED_SCALE: 1.4 });
      await new Promise((r) => setTimeout(r, 10));
      expect(voicevoxRebuildCount).toBe(1);

      // Now COEIROINK becomes available
      configuredEngine.available = true;
      scheduler.advance(10000);
      await new Promise((r) => setTimeout(r, 20));

      // Swapped in at idle
      expect(holder.current().primaryName).toBe("COEIROINK");

      // Test 120 s retirement cap (R3-3): simulate a hung prepare on an old engine
      const hungEngine = new MockDisposableEngine("HungOldEngine");
      hungEngine.prepareDelayMs = 999999; // hangs
      const holder2 = new EngineHolder({ primary: hungEngine, primaryName: "COEIROINK" });
      const queue2 = new TTSQueue(hungEngine, 50, undefined, undefined, { store, engineHolder: holder2 });
      const nextEngine = new MockDisposableEngine("NextEngine");
      const builders2: EngineBuilders = {
        createEngine: () => nextEngine,
        createEnglishEngine: () => undefined,
      };
      const manager2 = new EngineManager(store, queue2, holder2, builders2, scheduler);

      // Enqueue hung item: prepare is in-flight
      queue2.enqueue("Hung text");
      expect(queue2.isInUse(hungEngine)).toBe(true);

      // Swap to NextEngine
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));
      expect(manager2.pending()?.stage).toBe("waiting");

      // Advance 60 s to trigger cut-over
      scheduler.advance(60000);
      await new Promise((r) => setTimeout(r, 10));

      expect(holder2.current().primaryName).toBe("VOICEVOX");
      expect(queue2.isInUse(hungEngine)).toBe(true);
      expect(hungEngine.disposeCount).toBe(0);

      // Advance 120 s to trigger retirement cap (R3-3)
      scheduler.advance(120000);
      await new Promise((r) => setTimeout(r, 10));

      expect(hungEngine.disposeCount).toBe(1);
    });
  });

  // Test 9: Clear
  describe("Test 9: Clear", () => {
    it("clear makes queue idle and waiting swap applies immediately", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      engineA.prepareDelayMs = 50;
      const engineB = new MockDisposableEngine("VOICEVOX");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => (name === "VOICEVOX" ? engineB : engineA),
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Enqueue items
      const enqP1 = queue.enqueue("Comment 1");
      const enqP2 = queue.enqueue("Comment 2");

      // Change engine to VOICEVOX
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.pending()?.stage).toBe("waiting");

      // Clear queue
      queue.clear();
      await Promise.allSettled([enqP1, enqP2]);
      await new Promise((r) => setTimeout(r, 60));

      // Swap applied immediately upon clearing!
      expect(holder.current().primaryName).toBe("VOICEVOX");
      expect(manager.pending()).toBe(null);
      expect(engineA.disposeCount).toBe(1);
    });
  });

  // Test 11: HTTP endpoints (PR 2 state)
  describe("Test 11: HTTP endpoints (PR 2 state)", () => {
    it("GET /api/status returns live engine, enginePending, and englishEngine", async () => {
      const port = 3959;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-http2-"));
      const filePath = path.join(tmpDir, "web-settings.json");
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK", FOREIGN_LANGUAGE_MODE: "NATIVE" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const engineEng = new MockDisposableEngine("KokoroEng");
      const holder = new EngineHolder({
        primary: engineA,
        primaryName: "COEIROINK",
        english: engineEng,
        englishName: "KOKORO",
      });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const mockConn: TwitchConnection = {
        isConnected: () => false,
        connect: async () => {},
        disconnect: async () => {},
      };
      const scheduler = new FakeScheduler();

      const manager = new EngineManager(
        store,
        queue,
        holder,
        {
          createEngine: (name) => new MockDisposableEngine(name),
          createEnglishEngine: () => engineEng,
        },
        scheduler
      );

      const server = new HttpServer({
        queue,
        store,
        engineHolder: holder,
        engineManager: manager,
        dictionaryService: new DictionaryService(new CsvDictionaryRepository()),
        twitchControlService: new TwitchControlService(mockConn),
        speechInteractionService: new SpeechInteractionService(queue),
        configSettingsService: new ConfigSettingsService(filePath, store, undefined, undefined, holder),
        port,
        bouyomiPort: 50099,
        enableBouyomiCompat: false,
      });

      server.start();

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/status`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as { engine: string; enginePending: unknown; englishEngine: string };
        expect(data.engine).toBe("COEIROINK");
        expect(data.enginePending).toBe(null);
        expect(data.englishEngine).toBe("KOKORO");

        // When candidate is pending
        const pin = queue.pin();
        store.apply({ TTS_ENGINE: "VOICEVOX" });
        await new Promise((r) => setTimeout(r, 10));

        const res2 = await fetch(`http://127.0.0.1:${port}/api/status`);
        const data2 = (await res2.json()) as { enginePending: { target: string; stage: string } | null };
        expect(data2.enginePending).toBeDefined();
        expect(data2.enginePending?.target).toBe("VOICEVOX");
        expect(data2.enginePending?.stage).toBe("waiting");

        pin.release();
      } finally {
        server.stop();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // Test 12: Reviewer Round 1 Additions (Issue #72 PR 2 revision 2)
  describe("Test 12: Reviewer Round 1 Additions (Issue #72 PR 2 revision 2)", () => {
    it("stopAll disposes active, pending, and retiring engines and cancels retirement timers", async () => {
      const store = new SettingsStore(
        parseConfig({
          TTS_ENGINE: "COEIROINK",
          FOREIGN_LANGUAGE_MODE: "NATIVE",
          ENGLISH_TTS_ENGINE: "KOKORO",
        })
      );
      const engineA = new MockDisposableEngine("COEIROINK");
      const engineB = new MockDisposableEngine("VOICEVOX");
      const engineEng = new MockDisposableEngine("KOKORO");
      const holder = new EngineHolder({
        primary: engineA,
        primaryName: "COEIROINK",
        english: engineEng,
        englishName: "KOKORO",
      });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const manager = new EngineManager(
        store,
        queue,
        holder,
        {
          createEngine: (name) => (name === "VOICEVOX" ? engineB : engineA),
          createEnglishEngine: () => engineEng,
        },
        scheduler
      );

      // Hold pin so retiring engine stays in retiringEngines
      const pin = queue.pin();
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));

      // Advance scheduler 60 s -> cutOver triggers swapPrimary -> engineA is retired
      scheduler.advance(60000);
      await new Promise((r) => setTimeout(r, 10));

      expect(engineA.disposeCount).toBe(0);

      // Call stopAll()
      manager.stopAll();

      expect(engineB.disposeCount).toBe(1);
      expect(engineEng.disposeCount).toBe(1);
      expect(engineA.disposeCount).toBe(1);

      pin.release();
    });

    it("supersede to new values cancels old candidate and probes new candidate", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const engineB = new MockDisposableEngine("VOICEVOX");
      const engineC = new MockDisposableEngine("PIPER");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => {
          if (name === "VOICEVOX") return engineB;
          if (name === "PIPER") return engineC;
          return engineA;
        },
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Hold a pin so queue is busy, keeping candidate waiting
      const pin = queue.pin();

      // Start candidate B
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));
      expect(manager.pending()?.target).toBe("VOICEVOX");

      // Before swap finishes, supersede with candidate C
      store.apply({ TTS_ENGINE: "PIPER" });
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.pending()?.target).toBe("PIPER");
      expect(engineB.disposeCount).toBe(1);

      pin.release();
    });

    it("English swap 60 s cut-over applies new English engine to arrivals while old in-progress finishes", async () => {
      const store = new SettingsStore(
        parseConfig({
          TTS_ENGINE: "COEIROINK",
          FOREIGN_LANGUAGE_MODE: "NATIVE",
          ENGLISH_TTS_ENGINE: "KOKORO",
        })
      );
      const enginePrimary = new MockDisposableEngine("COEIROINK");
      const engineEngA = new MockDisposableEngine("KOKORO");
      const engineEngB = new MockDisposableEngine("PIPER");
      const holder = new EngineHolder({
        primary: enginePrimary,
        primaryName: "COEIROINK",
        english: engineEngA,
        englishName: "KOKORO",
      });
      const queue = new TTSQueue(enginePrimary, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: () => enginePrimary,
        createEnglishEngine: (cfg) => (cfg.ENGLISH_TTS_ENGINE === "PIPER" ? engineEngB : engineEngA),
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Hold a pin representing in-progress English comment
      const pinOld = queue.pin();

      // Switch English engine to PIPER
      store.apply({ ENGLISH_TTS_ENGINE: "PIPER" });
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.englishPending()?.stage).toBe("waiting");
      expect(holder.current().englishName).toBe("KOKORO");

      // Advance scheduler 60 s -> cut-over triggers
      scheduler.advance(60000);
      await new Promise((r) => setTimeout(r, 10));

      expect(holder.current().englishName).toBe("PIPER");
      expect(manager.englishPending()).toBe(null);

      // Old engine A is NOT yet disposed while pinOld is held
      expect(engineEngA.disposeCount).toBe(0);

      // Release pinOld -> engineEngA is disposed
      pinOld.release();
      await new Promise((r) => setTimeout(r, 20));
      expect(engineEngA.disposeCount).toBe(1);
    });

    it("English need turning off cancels pending and retires English engine", async () => {
      const store = new SettingsStore(
        parseConfig({
          TTS_ENGINE: "COEIROINK",
          FOREIGN_LANGUAGE_MODE: "NATIVE",
          ENGLISH_TTS_ENGINE: "KOKORO",
        })
      );
      const enginePrimary = new MockDisposableEngine("COEIROINK");
      const engineEng = new MockDisposableEngine("KOKORO");
      const holder = new EngineHolder({
        primary: enginePrimary,
        primaryName: "COEIROINK",
        english: engineEng,
        englishName: "KOKORO",
      });
      const queue = new TTSQueue(enginePrimary, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const manager = new EngineManager(
        store,
        queue,
        holder,
        {
          createEngine: () => enginePrimary,
          createEnglishEngine: () => engineEng,
        },
        scheduler
      );

      // Turn foreign language mode off
      store.apply({ FOREIGN_LANGUAGE_MODE: "KATAKANA", BILINGAL_MODE: false });
      await new Promise((r) => setTimeout(r, 10));

      expect(holder.current().english).toBeUndefined();
      expect(holder.current().englishName).toBeUndefined();
      expect(manager.englishPending()).toBe(null);
      expect(engineEng.disposeCount).toBe(1);
    });

    it("overflow drop signals end of use for dropped engine item", async () => {
      const store = new SettingsStore(parseConfig({}));
      const engineA = new MockDisposableEngine("EngineA");
      const engineB = new MockDisposableEngine("EngineB");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 2, undefined, undefined, { store, engineHolder: holder });

      engineA.prepareDelayMs = 100;
      engineB.prepareDelayMs = 100;

      // 1. Item 1 starts processing
      const p1 = queue.enqueue("Item 1", { engine: engineA });
      // 2. Item 2 with engineB queued
      const p2 = queue.enqueue("Item 2", { engine: engineB });
      // 3. Item 3 with engineA queued
      const p3 = queue.enqueue("Item 3", { engine: engineA });

      expect(queue.isInUse(engineB)).toBe(true);

      // 4. Enqueue Item 4: queue overflows, oldest pending item (Item 2 with engineB) is dropped
      const p4 = queue.enqueue("Item 4", { engine: engineA });

      expect(queue.isInUse(engineB)).toBe(false);

      queue.clear();
      await Promise.allSettled([p1, p2, p3, p4]);
    });

    it("queued item cut-over: items queued before swap finish on old engine while arrivals use new engine", async () => {
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const engineB = new MockDisposableEngine("VOICEVOX");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => (name === "VOICEVOX" ? engineB : engineA),
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Enqueue an item while engineA is active
      engineA.prepareDelayMs = 30;
      const pOld = queue.enqueue("Queued on old engine", { engine: engineA });

      // Change settings to VOICEVOX
      store.apply({ TTS_ENGINE: "VOICEVOX" });
      await new Promise((r) => setTimeout(r, 10));

      // Trigger 60 s cut-over
      scheduler.advance(60000);
      await new Promise((r) => setTimeout(r, 10));

      // Holder now has VOICEVOX
      expect(holder.current().primaryName).toBe("VOICEVOX");

      // Old engine A is still in use because pOld is running
      expect(queue.isInUse(engineA)).toBe(true);
      expect(engineA.disposeCount).toBe(0);

      await pOld;
      await new Promise((r) => setTimeout(r, 20));

      expect(engineA.disposeCount).toBe(1);
    });

    it("start on a fallback, change configured engine host, assert probed/swapped engine was built with new host", async () => {
      const store = new SettingsStore(
        parseConfig({
          TTS_ENGINE: "COEIROINK",
          COEIROINK_HOST: "http://127.0.0.1:50031",
        })
      );
      const fallbackEngine = new MockDisposableEngine("Mac");
      const createdEngines: Array<{ host: string; engine: MockDisposableEngine }> = [];

      const holder = new EngineHolder({ primary: fallbackEngine, primaryName: "Mac" });
      const queue = new TTSQueue(fallbackEngine, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name, cfg) => {
          if (name === "COEIROINK") {
            const eng = new MockDisposableEngine("COEIROINK", false);
            createdEngines.push({ host: cfg.COEIROINK_HOST, engine: eng });
            return eng;
          }
          return fallbackEngine;
        },
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);
      expect(createdEngines.length).toBe(1);
      const firstEngine = createdEngines[0];
      expect(firstEngine).toBeDefined();
      if (!firstEngine) throw new Error("firstEngine is undefined");
      expect(firstEngine.host).toBe("http://127.0.0.1:50031");
      expect(manager.pending()?.stage).toBe("failed");

      // User changes COEIROINK_HOST
      store.apply({ COEIROINK_HOST: "http://127.0.0.1:50032" });
      await new Promise((r) => setTimeout(r, 10));

      expect(firstEngine.engine.disposeCount).toBe(1);
      expect(createdEngines.length).toBe(2);
      const secondEngine = createdEngines[1];
      expect(secondEngine).toBeDefined();
      if (!secondEngine) throw new Error("secondEngine is undefined");
      expect(secondEngine.host).toBe("http://127.0.0.1:50032");

      // Make new candidate available and re-probe
      secondEngine.engine.available = true;
      scheduler.advance(10000);
      await new Promise((r) => setTimeout(r, 20));

      expect(holder.current().primaryName).toBe("COEIROINK");
      expect(holder.current().primary).toBe(secondEngine.engine);
    });

    it("configured engine swap waits for idle, then a fallback-input save: configured engine ends up primary", async () => {
      const store = new SettingsStore(
        parseConfig({
          TTS_ENGINE: "COEIROINK",
          SPEAKER_JAPANESE: "Kyoko",
        })
      );
      const fallbackEngine = new MockDisposableEngine("Mac");
      const coeiroinkEngine = new MockDisposableEngine("COEIROINK", false);

      const holder = new EngineHolder({ primary: fallbackEngine, primaryName: "Mac" });
      const queue = new TTSQueue(fallbackEngine, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => {
          if (name === "COEIROINK") return coeiroinkEngine;
          return new MockDisposableEngine(name);
        },
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // 1. Hold pin to make queue busy
      const pin = queue.pin();

      // 2. Coeiroink becomes available, so it enters waiting stage and waits for idle
      coeiroinkEngine.available = true;
      scheduler.advance(10000);
      await new Promise((r) => setTimeout(r, 10));
      expect(manager.pending()?.stage).toBe("waiting");

      // 3. While waiting for idle, a fallback-input save occurs
      store.apply({ SPEAKER_JAPANESE: "Otoya" });
      await new Promise((r) => setTimeout(r, 10));

      // 4. Release pin -> queue becomes idle
      pin.release();
      await new Promise((r) => setTimeout(r, 20));

      // Configured engine (COEIROINK) must end up primary
      expect(holder.current().primaryName).toBe("COEIROINK");
      expect(holder.current().primary).toBe(coeiroinkEngine);
    });

    it("start-up candidate with shared key (e.g. MASTER_VOLUME) rebuilds both fallback and configured engine", async () => {
      const store = new SettingsStore(
        parseConfig({
          TTS_ENGINE: "COEIROINK",
          MASTER_VOLUME: 1.0,
        })
      );
      const fallbackEngine = new MockDisposableEngine("VOICEVOX");
      const configuredEngine = new MockDisposableEngine("COEIROINK", false);

      const holder = new EngineHolder({ primary: fallbackEngine, primaryName: "VOICEVOX" });
      const queue = new TTSQueue(fallbackEngine, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const createdEngines: Array<{ name: string; volume: number; engine: MockDisposableEngine }> = [];
      const builders: EngineBuilders = {
        createEngine: (name, cfg) => {
          const eng = new MockDisposableEngine(name, name !== "COEIROINK");
          createdEngines.push({ name, volume: cfg.MASTER_VOLUME, engine: eng });
          return eng;
        },
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);
      expect(manager.pending()?.stage).toBe("failed");

      // Save shared input: MASTER_VOLUME feeds both VOICEVOX and COEIROINK
      store.apply({ MASTER_VOLUME: 1.8 });
      await new Promise((r) => setTimeout(r, 10));

      // Both fallback and configured engines must be rebuilt with the new volume 1.8
      const rebuiltFallback = createdEngines.find((e) => e.name === "VOICEVOX" && e.volume === 1.8);
      const rebuiltConfigured = createdEngines.find((e) => e.name === "COEIROINK" && e.volume === 1.8);
      expect(rebuiltFallback).toBeDefined();
      expect(rebuiltConfigured).toBeDefined();

      // When configured engine becomes available, it swaps with the new volume 1.8
      if (rebuiltConfigured) {
        rebuiltConfigured.engine.available = true;
      }
      scheduler.advance(10000);
      await new Promise((r) => setTimeout(r, 20));

      expect(holder.current().primaryName).toBe("COEIROINK");
      if (rebuiltConfigured) {
        expect(holder.current().primary).toBe(rebuiltConfigured.engine);
      }
    });

    it("a failed restart leaves the manager working so later engine change still applies", async () => {
      const port = 3960;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-restart-fail-"));
      const filePath = path.join(tmpDir, "web-settings.json");
      const store = new SettingsStore(parseConfig({ TTS_ENGINE: "COEIROINK" }));
      const engineA = new MockDisposableEngine("COEIROINK");
      const engineB = new MockDisposableEngine("VOICEVOX");
      const holder = new EngineHolder({ primary: engineA, primaryName: "COEIROINK" });
      const queue = new TTSQueue(engineA, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => (name === "VOICEVOX" ? engineB : engineA),
        createEnglishEngine: () => undefined,
      };
      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // Create a RestartService that fails on spawn
      const failingRestartService = new RestartService({
        execPath: "/bin/echo",
        argv: [],
        cwd: tmpDir,
        platform: "darwin",
        existsSync: () => true,
        spawn: () => {
          throw new Error("Simulated spawn failure");
        },
      });

      const server = new HttpServer({
        queue,
        store,
        engineHolder: holder,
        engineManager: manager,
        dictionaryService: new DictionaryService(new CsvDictionaryRepository()),
        twitchControlService: new TwitchControlService({
          isConnected: () => false,
          connect: async () => {},
          disconnect: async () => {},
        }),
        speechInteractionService: new SpeechInteractionService(queue),
        configSettingsService: new ConfigSettingsService(filePath, store, undefined, undefined, holder),
        port,
        restartService: failingRestartService,
        restartDelayMs: 10,
        bouyomiPort: 50098,
        enableBouyomiCompat: false,
      });

      server.start();

      try {
        // Trigger restart via API
        const res = await fetch(`http://127.0.0.1:${port}/api/restart`, { method: "POST" });
        expect(res.status).toBe(200);

        // Wait for scheduled restart failure and recovery
        await new Promise((r) => setTimeout(r, 60));

        // Engine manager must NOT be stopped! A later engine change must apply
        store.apply({ TTS_ENGINE: "VOICEVOX" });
        await new Promise((r) => setTimeout(r, 20));

        expect(holder.current().primaryName).toBe("VOICEVOX");
        expect(holder.current().primary).toBe(engineB);
        expect(engineA.disposeCount).toBe(1);
      } finally {
        server.stop();
        manager.stopAll();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("rebuilt start-up candidate gets a fresh object with new since and restarts at probing", async () => {
      const store = new SettingsStore(
        parseConfig({
          TTS_ENGINE: "COEIROINK",
          COEIROINK_HOST: "http://127.0.0.1:50031",
        })
      );
      const fallbackEngine = new MockDisposableEngine("Mac");
      const holder = new EngineHolder({ primary: fallbackEngine, primaryName: "Mac" });
      const queue = new TTSQueue(fallbackEngine, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => {
          const eng = new MockDisposableEngine(name, false);
          eng.isAvailableDelayMs = 100;
          return eng;
        },
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);
      // Wait for initial probe to finish
      await new Promise((r) => setTimeout(r, 120));
      const firstPending = manager.pending();
      expect(firstPending).toBeDefined();
      if (!firstPending) throw new Error("firstPending is undefined");
      expect(firstPending.stage).toBe("failed");
      const firstSince = firstPending.since;

      // Small delay then update candidate config
      await new Promise((r) => setTimeout(r, 20));
      store.apply({ COEIROINK_HOST: "http://127.0.0.1:50032" });

      const secondPending = manager.pending();
      expect(secondPending).toBeDefined();
      if (!secondPending) throw new Error("secondPending is undefined");

      // Must be a fresh candidate object with newer since and stage probing
      expect(secondPending).not.toBe(firstPending);
      expect(secondPending.since).toBeGreaterThan(firstSince);
      expect(secondPending.stage).toBe("probing");
    });

    it("fallback rebuild is queued before configured candidate becomes ready: configured engine ends up primary", async () => {
      const store = new SettingsStore(
        parseConfig({
          TTS_ENGINE: "COEIROINK",
          SPEAKER_JAPANESE: "Kyoko",
        })
      );
      const fallbackEngine = new MockDisposableEngine("Mac");
      const coeiroinkEngine = new MockDisposableEngine("COEIROINK", false);

      const holder = new EngineHolder({ primary: fallbackEngine, primaryName: "Mac" });
      const queue = new TTSQueue(fallbackEngine, 50, undefined, undefined, { store, engineHolder: holder });
      const scheduler = new FakeScheduler();

      const builders: EngineBuilders = {
        createEngine: (name) => {
          if (name === "COEIROINK") return coeiroinkEngine;
          return new MockDisposableEngine(name);
        },
        createEnglishEngine: () => undefined,
      };

      const manager = new EngineManager(store, queue, holder, builders, scheduler);

      // 1. Hold pin to make queue busy
      const pin = queue.pin();

      // 2. FIRST: Fallback input changes while queue is busy -> fallback rebuild is queued on idle
      store.apply({ SPEAKER_JAPANESE: "Otoya" });
      await new Promise((r) => setTimeout(r, 10));

      // 3. SECOND: Configured engine becomes available while fallback rebuild is queued
      coeiroinkEngine.available = true;
      scheduler.advance(10000);
      await new Promise((r) => setTimeout(r, 10));
      expect(manager.pending()?.stage).toBe("waiting");

      // 4. Release pin -> queue becomes idle
      pin.release();
      await new Promise((r) => setTimeout(r, 20));

      // Configured engine (COEIROINK) must end up primary
      expect(holder.current().primaryName).toBe("COEIROINK");
      expect(holder.current().primary).toBe(coeiroinkEngine);

      // Observable effect: no rebuild on an identical save after the deferred swap
      store.apply({ SPEAKER_JAPANESE: "Otoya" });
      expect(holder.current().primary).toBe(coeiroinkEngine);
    });
  });
});
