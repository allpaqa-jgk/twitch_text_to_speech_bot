import { describe, expect, it } from "bun:test";
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
import { KokoroEngine } from "../tts/engines/kokoro";
import { DictionaryService } from "../application/dictionaryService";
import { CsvDictionaryRepository } from "../storage/csvDictionaryRepository";
import { TwitchControlService } from "../application/twitchControlService";
import { SpeechInteractionService } from "../application/speechInteractionService";
import fs from "fs";
import path from "path";
import os from "os";

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
    const origSpawn = Bun.spawn;

    it("case 1: stop() during in-flight request rejects request immediately", async () => {
      let procKilled = false;
      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const stdoutStream = new ReadableStream<Uint8Array>({
        start(c) {
          stdoutController = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      let exitResolve: (code: number) => void;
      const exitPromise = new Promise<number>((r) => {
        exitResolve = r;
      });

      const mockProc = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: stdoutStream,
        exited: exitPromise,
        kill: () => {
          procKilled = true;
          exitResolve(0);
        },
      };

      Bun.spawn = (() => mockProc) as any;

      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script");
        // Start prepare in background
        const preparePromise = kokoro.prepare("Hello");

        // Wait microtask so request is sent and queued in currentRequest
        await new Promise((r) => setTimeout(r, 10));

        // Call stop while request is in-flight
        kokoro.stop();

        expect(procKilled).toBe(true);
        await expect(preparePromise).rejects.toThrow("Worker stopped while request was in-flight");
      } finally {
        Bun.spawn = origSpawn;
      }
    });

    it("case 2: stop() during worker startup rejects pending startup", async () => {
      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const stdoutStream = new ReadableStream<Uint8Array>({
        start(c) {
          stdoutController = c;
          // Never emit READY
        },
      });

      let exitResolve: (code: number) => void;
      const exitPromise = new Promise<number>((r) => {
        exitResolve = r;
      });

      const mockProc = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: stdoutStream,
        exited: exitPromise,
        kill: () => {
          exitResolve(0);
        },
      };

      Bun.spawn = (() => mockProc) as any;

      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script");
        const preparePromise = kokoro.prepare("Hello");

        await new Promise((r) => setTimeout(r, 10));

        kokoro.stop();

        await expect(preparePromise).rejects.toThrow("Worker stopped during startup");
      } finally {
        Bun.spawn = origSpawn;
      }
    });

    it("case 3 & process identity guard: stop-then-prepare spawns fresh worker and old exit doesn't affect it", async () => {
      let spawnCount = 0;
      let exit1Resolve: (code: number) => void;
      const exit1 = new Promise<number>((r) => {
        exit1Resolve = r;
      });
      let c1: ReadableStreamDefaultController<Uint8Array>;
      const s1 = new ReadableStream<Uint8Array>({
        start(c) {
          c1 = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      let c2: ReadableStreamDefaultController<Uint8Array>;
      const s2 = new ReadableStream<Uint8Array>({
        start(c) {
          c2 = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      const proc1 = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: s1,
        exited: exit1,
        kill: () => {},
      };

      const proc2 = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: s2,
        exited: new Promise<number>(() => {}),
        kill: () => {},
      };

      Bun.spawn = (() => {
        spawnCount++;
        return spawnCount === 1 ? proc1 : proc2;
      }) as any;

      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script");
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
        exit1Resolve!(1);
        await new Promise((r) => setTimeout(r, 10));

        // Kokoro must still be alive with proc2
        expect((kokoro as any).proc).toBe(proc2);
        expect((kokoro as any).isReady).toBe(true);
      } finally {
        Bun.spawn = origSpawn;
      }
    });

    it("case 4: process identity guard prevents stdout line of killed worker from resolving restarted worker request", async () => {
      let spawnCount = 0;
      let c1: ReadableStreamDefaultController<Uint8Array>;
      const s1 = new ReadableStream<Uint8Array>({
        start(c) {
          c1 = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      let c2: ReadableStreamDefaultController<Uint8Array>;
      const s2 = new ReadableStream<Uint8Array>({
        start(c) {
          c2 = c;
          c.enqueue(new TextEncoder().encode("READY\n"));
        },
      });

      const proc1 = {
        stdin: { write: () => {}, flush: () => {} },
        stdout: s1,
        exited: new Promise<number>(() => {}),
        kill: () => {},
      };

      let outputPath2 = "";
      const proc2 = {
        stdin: {
          write: (data: string) => {
            try {
              const payload = JSON.parse(data);
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

      Bun.spawn = (() => {
        spawnCount++;
        return spawnCount === 1 ? proc1 : proc2;
      }) as any;

      try {
        const kokoro = new KokoroEngine("af_heart", 1.0, "a", "/mock/python", "/mock/script");

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
        c1!.enqueue(
          new TextEncoder().encode(
            JSON.stringify({ status: "error", error: "killed worker 1 error" }) + "\n"
          )
        );
        await new Promise((r) => setTimeout(r, 10));

        // Worker 2 emits its own successful response:
        c2!.enqueue(new TextEncoder().encode(JSON.stringify({ status: "ok" }) + "\n"));

        const audio = await p2;
        expect(audio).toBeDefined();
        expect(typeof audio.play).toBe("function");
      } finally {
        Bun.spawn = origSpawn;
      }
    });
  });

  // Test 8c: PR 1 state
  describe("Test 8c: PR 1 state", () => {
    it("engine keys and BILINGAL_MODE do not enter store on save", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-pr1-"));
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
      // Engine keys and BILINGAL_MODE did NOT enter the store in PR 1
      expect(store.current().COEIROINK_HOST).toBe(store.start.COEIROINK_HOST);
      expect(store.current().VOICEVOX_SPEED_SCALE).toBe(store.start.VOICEVOX_SPEED_SCALE);
      expect(store.current().BILINGAL_MODE).toBe(store.start.BILINGAL_MODE);

      // They are marked restartRequired and in restartKeys
      expect(snapshot.restartRequired).toBe(true);
      expect(snapshot.restartKeys).toContain("COEIROINK_HOST");
      expect(snapshot.restartKeys).toContain("VOICEVOX_SPEED_SCALE");
      expect(snapshot.restartKeys).toContain("BILINGAL_MODE");
      expect(snapshot.restartKeys).not.toContain("READ_USERNAME");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // Test 10: Settings service
  describe("Test 10: Settings service", () => {
    it("only applies request keys to store, calculates PR 1 restartRequired/restartKeys accurately", () => {
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

    it("FOREIGN_LANGUAGE_MODE = NATIVE appears in restartKeys only when running set lacks English engine", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-flm-"));
      const filePath = path.join(tmpDir, "web-settings.json");
      const store = new SettingsStore(parseConfig({}));

      // Case 1: Holder has NO English engine
      const holderNoEng = new EngineHolder({ primary: new MockEngine(), primaryName: "COEIROINK" });
      const serviceNoEng = new ConfigSettingsService(filePath, store, undefined, undefined, holderNoEng);
      const snapNoEng = serviceNoEng.update({ FOREIGN_LANGUAGE_MODE: "NATIVE" });
      expect(snapNoEng.restartRequired).toBe(true);
      expect(snapNoEng.restartKeys).toContain("FOREIGN_LANGUAGE_MODE");

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
