import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { HttpServer } from "../server/httpServer";
import { processComment } from "../application/commentProcessingService";
import { processComment as processCommentFromTtsPath } from "../tts/commentProcessor";
import { TTSQueue } from "../tts/queue";
import type { TTSEngine } from "../tts/engine";
import { KatakanaTransformer } from "../tts/transformers/katakana";
import { config, parseConfig } from "../config";
import { DictionaryService } from "../application/dictionaryService";
import { CsvDictionaryRepository } from "../storage/csvDictionaryRepository";
import { TwitchControlService } from "../application/twitchControlService";
import { SpeechInteractionService } from "../application/speechInteractionService";
import { ConfigSettingsService } from "../application/configSettingsService";
import { csvList } from "../storage/csvList";
import fs from "fs";
import os from "os";
import path from "path";

class MockEngine implements TTSEngine {
  public name: string;
  public spokenTexts: string[] = [];

  constructor(name = "MockEngine") {
    this.name = name;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async say(text: string): Promise<void> {
    this.spokenTexts.push(text);
  }
}

class MockBot {
  public connected = false;
  isConnected(): boolean {
    return this.connected;
  }
  async connect(): Promise<void> {
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

describe("HttpServer & commentProcessor", () => {
  it("keeps the previous TTS module path as a compatibility export", () => {
    expect(processCommentFromTtsPath).toBe(processComment);
  });

  const TEST_PORT = 3949;
  const TEST_BOUYOMI_PORT = 50089;
  let mockEngine: MockEngine;
  let queue: TTSQueue;
  let transformer: KatakanaTransformer;
  let mockBot: MockBot;
  let server: HttpServer;
  let settingsDirectory: string;
  let settingsConfig: typeof config;

  beforeAll(() => {
    mockEngine = new MockEngine("HttpMockEngine");
    queue = new TTSQueue(mockEngine);
    transformer = new KatakanaTransformer();
    mockBot = new MockBot();
    settingsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "twitch-tts-web-settings-"));
    settingsConfig = {
      ...config,
      TW_OAUTH_TOKEN: "oauth-secret-must-not-be-visible",
      DISCORD_TOKEN: "discord-secret-must-not-be-visible",
      DISCORD_WEBHOOK_URL: "https://discord.invalid/webhook-secret",
    };
    server = new HttpServer({
      queue,
      transformer,
      dictionaryService: new DictionaryService(new CsvDictionaryRepository()),
      twitchControlService: new TwitchControlService(mockBot),
      speechInteractionService: new SpeechInteractionService(queue, transformer),
      configSettingsService: new ConfigSettingsService(
        path.join(settingsDirectory, "web-settings.json"),
        settingsConfig,
        settingsConfig
      ),
      port: TEST_PORT,
      bouyomiPort: TEST_BOUYOMI_PORT,
      enableBouyomiCompat: true,
    });
    server.start();
  });

  afterAll(() => {
    server.stop();
    fs.rmSync(settingsDirectory, { recursive: true, force: true });
  });

  describe("HTTP Server endpoints", () => {
    it("should respond to GET /health and GET /status with status ok", async () => {
      const resHealth = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
      expect(resHealth.status).toBe(200);
      const dataHealth = (await resHealth.json()) as any;
      expect(dataHealth.status).toBe("ok");
      expect(typeof dataHealth.queuePending).toBe("number");

      const resStatus = await fetch(`http://127.0.0.1:${TEST_PORT}/status`);
      expect(resStatus.status).toBe(200);
      const dataStatus = (await resStatus.json()) as any;
      expect(dataStatus.status).toBe("ok");
    });

    it("should handle OPTIONS preflight with 204 No Content and CORS headers", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
        method: "OPTIONS",
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });

    it("should return 400 when text is missing or whitespace only in POST /say", async () => {
      const res1 = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "Alice" }),
      });
      expect(res1.status).toBe(400);
      const data1 = (await res1.json()) as any;
      expect(data1.error).toBe("text is required");

      const res2 = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "   " }),
      });
      expect(res2.status).toBe(400);
    });

    it("should keep Web UI available while HTTP speech endpoints are disabled", async () => {
      const original = config.HTTP_TALK_ENABLED;
      config.HTTP_TALK_ENABLED = false;
      try {
        const home = await fetch(`http://127.0.0.1:${TEST_PORT}/`);
        expect(home.status).toBe(200);

        const say = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "HTTP speech must be disabled" }),
        });
        expect(say.status).toBe(403);

        const demo = await fetch(`http://127.0.0.1:${TEST_PORT}/api/demo`, {
          method: "POST",
        });
        expect(demo.status).toBe(403);
      } finally {
        config.HTTP_TALK_ENABLED = original;
      }
    });

    it("should return 400 on invalid JSON in POST /say", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json{{",
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBe("Invalid JSON");
    });

    it("should accept valid comments and enqueue speech via POST /say", async () => {
      mockEngine.spokenTexts = [];
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "こんにちは世界",
          username: "Taro",
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);

      // Wait briefly for queue to process
      await new Promise((r) => setTimeout(r, 60));
      expect(mockEngine.spokenTexts.length).toBeGreaterThan(0);
      expect(mockEngine.spokenTexts[mockEngine.spokenTexts.length - 1]).toContain("こんにちは世界");
    });

    it("should support alternative payload fields (comment, message, name, user)", async () => {
      mockEngine.spokenTexts = [];

      // Test with "comment" and "name"
      const res1 = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: "わんコメからのコメント",
          name: "Hanako",
        }),
      });
      expect(res1.status).toBe(200);

      // Test with "message" and "user"
      const res2 = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "CastCraftからのメッセージ",
          user: "Jiro",
        }),
      });
      expect(res2.status).toBe(200);

      // Wait for queue processing (FIFO with 50ms pause between items)
      const start = Date.now();
      while (mockEngine.spokenTexts.length < 2 && Date.now() - start < 1000) {
        await new Promise((r) => setTimeout(r, 20));
      }

      expect(mockEngine.spokenTexts.some((t) => t.includes("わんコメからのコメント"))).toBe(true);
      expect(mockEngine.spokenTexts.some((t) => t.includes("からのメッセージ"))).toBe(true);
    });

    it("should reject payload exceeding 512KB with 413", async () => {
      const hugeString = "a".repeat(513 * 1024);
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: hugeString }),
      });
      expect(res.status).toBe(413);
    });

    it("should return 404 for unknown endpoints", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/unknown`);
      expect(res.status).toBe(404);
    });
  });

  describe("BouyomiChan compatibility endpoints", () => {
    it("should accept comments via GET /Talk?text=...", async () => {
      mockEngine.spokenTexts = [];
      const text = encodeURIComponent("棒読み互換テストです");
      const res = await fetch(`http://127.0.0.1:${TEST_BOUYOMI_PORT}/Talk?text=${text}`);

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe("OK");

      const start = Date.now();
      while (mockEngine.spokenTexts.length === 0 && Date.now() - start < 1000) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(mockEngine.spokenTexts.length).toBeGreaterThan(0);
      expect(mockEngine.spokenTexts[mockEngine.spokenTexts.length - 1]).toContain("棒読み互換テストです");
    });

    it("should return 400 when text parameter is missing on GET /Talk", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_BOUYOMI_PORT}/Talk`);
      expect(res.status).toBe(400);
    });

    it("should return 404 for unknown paths on Bouyomi port", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_BOUYOMI_PORT}/other`);
      expect(res.status).toBe(404);
    });
  });

  describe("processComment standalone pipeline", () => {
    it("should skip processing if message matches ignore list", async () => {
      // Matches "^Bye Bye .*$" in data/messageIgnoreList.csv
      const res = await processComment(
        { rawUsername: "BotUser", rawText: "Bye Bye everyone" },
        { ttsQueue: queue, transformer }
      );
      expect(res.ignored).toBe(true);
      expect(res.spoken).toBe(false);
    });

    it("should convert foreign text to Katakana when KATAKANA mode is set", async () => {
      const origMode = config.FOREIGN_LANGUAGE_MODE;
      config.FOREIGN_LANGUAGE_MODE = "KATAKANA";
      try {
        const res = await processComment(
          { rawUsername: "ForeignUser", rawText: "Good morning everyone" },
          { ttsQueue: queue, transformer }
        );
        expect(res.ignored).toBe(false);
        expect(res.spoken).toBe(true);
        expect(res.speechText).toContain("モーニング");
      } finally {
        config.FOREIGN_LANGUAGE_MODE = origMode;
      }
    });

    it("should route English text to englishEngine when NATIVE mode is set", async () => {
      const origMode = config.FOREIGN_LANGUAGE_MODE;
      config.FOREIGN_LANGUAGE_MODE = "NATIVE";
      const englishEngine = new MockEngine("EnglishNativeEngine");
      try {
        const res = await processComment(
          { rawUsername: "EnglishUser", rawText: "Hello there!" },
          { ttsQueue: queue, transformer, englishEngine }
        );
        expect(res.ignored).toBe(false);
        expect(res.spoken).toBe(true);
        expect(res.engineToUse).toBe(englishEngine);
      } finally {
        config.FOREIGN_LANGUAGE_MODE = origMode;
      }
    });

    it("should drop foreign comments when IGNORE mode is set", async () => {
      const origMode = config.FOREIGN_LANGUAGE_MODE;
      config.FOREIGN_LANGUAGE_MODE = "IGNORE";
      try {
        const res = await processComment(
          { rawUsername: "RussianUser", rawText: "Привет мир" },
          { ttsQueue: queue, transformer }
        );
        expect(res.ignored).toBe(false);
        expect(res.spoken).toBe(false);
      } finally {
        config.FOREIGN_LANGUAGE_MODE = origMode;
      }
    });

    it("should not speak if ENABLE_TTS is false", async () => {
      const origEnable = config.ENABLE_TTS;
      config.ENABLE_TTS = false;
      try {
        const res = await processComment(
          { rawUsername: "User", rawText: "こんにちは" },
          { ttsQueue: queue, transformer }
        );
        expect(res.spoken).toBe(false);
      } finally {
        config.ENABLE_TTS = origEnable;
      }
    });

    it("should suppress TTS for usernames mapped to an empty reading", async () => {
      const usernameKey = `silent_user_${Date.now()}`;
      const existing = csvList.readList("usernameConvertList");
      csvList.writeList("usernameConvertList", [...existing, [usernameKey, ""]]);

      try {
        const res = await processComment(
          { rawUsername: usernameKey, rawText: "読み上げを止めたいコメント" },
          { ttsQueue: queue, transformer }
        );
        expect(res.ignored).toBe(false);
        expect(res.spoken).toBe(false);
        expect(res.displayName).toBe("silent");
      } finally {
        csvList.writeList(
          "usernameConvertList",
          existing.filter((row) => row[0] !== usernameKey)
        );
      }
    });
  });

  describe("Web Management Console & Realtime Katakana Lab API", () => {
    it("should serve Web Console HTML at GET / with 200 OK and expected elements", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("<title>Twitch TTS Bot - Web Console & Katakana Lab</title>");
      expect(html).toContain('id="status-badges"');
      expect(html).toContain('id="quick-actions"');
      expect(html).toContain('id="say-form"');
      expect(html).toContain('id="lab-textarea"');
      expect(html).toContain('id="lab-table"');
      expect(html).toContain('id="dict-table"');
      expect(html).toContain('id="settings-form"');
      expect(html).toContain('data-tab="tab-settings"');
      expect(html).toContain("readRequired: false");
      expect(html).toContain("readInput.required = Boolean(conf.readRequired)");
      expect(html).toContain("settings-override-default");
      expect(html).toContain('id="btn-reset-all-settings"');
    });

    it("should expose safe settings, persist validated edits, and flag restart-required changes", async () => {
      const crossOriginRead = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        headers: { Origin: "https://attacker.example" },
      });
      expect(crossOriginRead.status).toBe(403);
      const crossOriginWrite = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ENABLE_TTS: false }),
      });
      expect(crossOriginWrite.status).toBe(403);

      const oversizedResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ STARTING_MESSAGE: "x".repeat(65 * 1024) }),
      });
      expect(oversizedResponse.status).toBe(413);

      const getResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`);
      expect(getResponse.status).toBe(200);
      const initial = (await getResponse.json()) as any;
      expect(initial.restartRequired).toBe(false);
      expect(initial.settings.some((item: any) => item.key === "TTS_ENGINE")).toBe(true);
      expect(initial.settings.some((item: any) => item.key === "HTTP_SERVER_ENABLED")).toBe(false);
      expect(initial.settings.find((item: any) => item.key === "TTS_ENGINE").isOverridden).toBe(false);
      expect(
        initial.settings.some((item: any) =>
          ["TW_OAUTH_TOKEN", "DISCORD_TOKEN", "DISCORD_WEBHOOK_URL", "DISCORD_CHANNEL_ID"].includes(item.key)
        )
      ).toBe(false);
      expect(JSON.stringify(initial)).not.toContain("oauth-secret-must-not-be-visible");
      expect(JSON.stringify(initial)).not.toContain("discord-secret-must-not-be-visible");
      expect(JSON.stringify(initial)).not.toContain("webhook-secret");

      const saveUnchangedResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(initial.settings.map((setting: any) => [setting.key, setting.defaultValue]))
        ),
      });
      expect(saveUnchangedResponse.status).toBe(200);
      expect(fs.existsSync(path.join(settingsDirectory, "web-settings.json"))).toBe(false);

      const saveResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ HTTP_SERVER_PORT: 4040, ENABLE_TTS: false }),
      });
      expect(saveResponse.status).toBe(200);
      const saved = (await saveResponse.json()) as any;
      expect(saved.success).toBe(true);
      expect(saved.restartRequired).toBe(true);
      expect(saved.settings.find((item: any) => item.key === "HTTP_SERVER_PORT").value).toBe(4040);
      expect(saved.settings.find((item: any) => item.key === "HTTP_SERVER_PORT").isOverridden).toBe(true);

      const saveDefaultResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ HTTP_SERVER_PORT: settingsConfig.HTTP_SERVER_PORT }),
      });
      expect(saveDefaultResponse.status).toBe(200);
      const afterDefaultSave = JSON.parse(
        fs.readFileSync(path.join(settingsDirectory, "web-settings.json"), "utf-8")
      );
      expect(afterDefaultSave.HTTP_SERVER_PORT).toBeUndefined();
      expect(afterDefaultSave.ENABLE_TTS).toBe(false);

      const saveOverrideAgainResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ HTTP_SERVER_PORT: 4040 }),
      });
      expect(saveOverrideAgainResponse.status).toBe(200);

      const invalidResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ HTTP_SERVER_PORT: 70000 }),
      });
      expect(invalidResponse.status).toBe(400);
      const invalid = (await invalidResponse.json()) as any;
      expect(invalid.error).toContain("HTTP_SERVER_PORT");

      const unauthorizedResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ TW_OAUTH_TOKEN: "attacker-value" }),
      });
      expect(unauthorizedResponse.status).toBe(400);
      expect(fs.readFileSync(path.join(settingsDirectory, "web-settings.json"), "utf-8"))
        .not.toContain("attacker-value");

      const disableServerResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ HTTP_SERVER_ENABLED: false }),
      });
      expect(disableServerResponse.status).toBe(400);

      const legacyService = new ConfigSettingsService(
        path.join(settingsDirectory, "legacy-web-settings.json"),
        settingsConfig,
        settingsConfig
      );
      fs.writeFileSync(
        path.join(settingsDirectory, "legacy-web-settings.json"),
        JSON.stringify({ HTTP_SERVER_ENABLED: false })
      );
      expect(legacyService.getSnapshot().settings.some(
        (item) => item.key === "HTTP_SERVER_ENABLED"
      )).toBe(false);

      const persisted = JSON.parse(
        fs.readFileSync(path.join(settingsDirectory, "web-settings.json"), "utf-8")
      );
      expect(persisted.HTTP_SERVER_PORT).toBe(4040);
      expect(persisted.ENABLE_TTS).toBe(false);
      expect(Object.keys(persisted).sort()).toEqual(["ENABLE_TTS", "HTTP_SERVER_PORT"]);
      expect(persisted.TW_OAUTH_TOKEN).toBeUndefined();
      expect(fs.statSync(path.join(settingsDirectory, "web-settings.json")).mode & 0o777).toBe(0o600);

      const resetPortResponse = await fetch(
        `http://127.0.0.1:${TEST_PORT}/api/settings?key=HTTP_SERVER_PORT`,
        { method: "DELETE" }
      );
      expect(resetPortResponse.status).toBe(200);
      const resetPort = (await resetPortResponse.json()) as any;
      expect(resetPort.settings.find((item: any) => item.key === "HTTP_SERVER_PORT").isOverridden).toBe(false);
      expect(Object.keys(JSON.parse(
        fs.readFileSync(path.join(settingsDirectory, "web-settings.json"), "utf-8")
      ))).toEqual(["ENABLE_TTS"]);

      const unknownResetResponse = await fetch(
        `http://127.0.0.1:${TEST_PORT}/api/settings?key=TW_OAUTH_TOKEN`,
        { method: "DELETE" }
      );
      expect(unknownResetResponse.status).toBe(400);

      const resetAllResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "DELETE",
      });
      expect(resetAllResponse.status).toBe(200);
      expect(fs.existsSync(path.join(settingsDirectory, "web-settings.json"))).toBe(false);

      const savedAgainResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ HTTP_SERVER_PORT: 4040, ENABLE_TTS: false }),
      });
      expect(savedAgainResponse.status).toBe(200);
      const persistedAgain = JSON.parse(
        fs.readFileSync(path.join(settingsDirectory, "web-settings.json"), "utf-8")
      );
      const restartedConfig = parseConfig({ ...settingsConfig, ...persistedAgain });
      const restartedService = new ConfigSettingsService(
        path.join(settingsDirectory, "web-settings.json"),
        restartedConfig,
        settingsConfig
      );
      expect(restartedService.getSnapshot().restartRequired).toBe(false);
    });

    it("should return comprehensive status at GET /api/status", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/status`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe("ok");
      expect(typeof data.queuePending).toBe("number");
      expect(data.engine).toBe(config.TTS_ENGINE);
      expect(data.port).toBe(TEST_PORT);
      expect(data.bouyomiPort).toBe(TEST_BOUYOMI_PORT);
      expect(data.bouyomiRunning).toBe(true);
      expect(typeof data.twitchConnected).toBe("boolean");
      expect(data.twitchConnected).toBe(false);
    });

    it("should clear TTSQueue on POST /api/clear", async () => {
      queue.enqueue("Clear test item 1");
      queue.enqueue("Clear test item 2");
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/clear`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.message).toBe("Queue cleared");
      expect(queue.pendingCount).toBe(0);
    });

    it("should toggle Twitch connection on POST /api/twitch/toggle", async () => {
      expect(mockBot.isConnected()).toBe(false);
      const resToggle1 = await fetch(`http://127.0.0.1:${TEST_PORT}/api/twitch/toggle`, {
        method: "POST",
      });
      expect(resToggle1.status).toBe(200);
      const dataToggle1 = (await resToggle1.json()) as any;
      expect(dataToggle1.success).toBe(true);
      expect(dataToggle1.connected).toBe(true);
      expect(mockBot.isConnected()).toBe(true);

      const resToggle2 = await fetch(`http://127.0.0.1:${TEST_PORT}/api/twitch/toggle`, {
        method: "POST",
      });
      expect(resToggle2.status).toBe(200);
      const dataToggle2 = (await resToggle2.json()) as any;
      expect(dataToggle2.success).toBe(true);
      expect(dataToggle2.connected).toBe(false);
      expect(mockBot.isConnected()).toBe(false);
    });

    it("should enqueue multilingual demo on POST /api/demo", async () => {
      mockEngine.spokenTexts = [];
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/demo`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(mockEngine.spokenTexts.length).toBeGreaterThan(0);
    });

    describe("POST /api/preview", () => {
      it("should convert English, Korean, Chinese, and gaming slang to Katakana", async () => {
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: [
              "Hello guys!",
              "안녕하세요",
              "你好！",
              "gg",
              "草生えたｗｗｗ",
            ],
          }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(Array.isArray(data.results)).toBe(true);
        expect(data.results.length).toBe(5);

        // English
        expect(data.results[0].line).toBe(1);
        expect(data.results[0].original).toBe("Hello guys!");
        expect(data.results[0].lang).toBe("eng");
        expect(data.results[0].transformed).toContain("ハロー");

        // Korean
        expect(data.results[1].line).toBe(2);
        expect(data.results[1].original).toBe("안녕하세요");
        expect(data.results[1].lang).toBe("kor");
        expect(data.results[1].transformed).toBe("アンニョンハセヨ");

        // Chinese
        expect(data.results[2].line).toBe(3);
        expect(data.results[2].original).toBe("你好！");
        expect(data.results[2].lang).toBe("zho");
        expect(data.results[2].transformed).toContain("ニーハオ");

        // Gaming Slang (gg)
        expect(data.results[3].line).toBe(4);
        expect(data.results[3].original).toBe("gg");
        expect(data.results[3].lang).toBe("eng");
        expect(data.results[3].transformed).toBe("ジージー");

        // Japanese
        expect(data.results[4].line).toBe(5);
        expect(data.results[4].lang).toBe("jpn");
      });

      it("should parse newline-separated text string", async () => {
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "Hello\nWorld\ngg",
          }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.results.length).toBe(3);
      });

      it("should limit input to at most 20 lines when 25 lines are sent", async () => {
        const lines25 = Array.from({ length: 25 }, (_, i) => `Line comment ${i + 1}`);
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: lines25 }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.results.length).toBe(20);
        expect(data.results[0].line).toBe(1);
        expect(data.results[19].line).toBe(20);
      });

      it("should clamp a line exceeding 200 chars down to 200 chars", async () => {
        const longLine = "a".repeat(300);
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: longLine }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.results.length).toBe(1);
        expect(data.results[0].original.length).toBe(200);
      });
    });

    describe("Dictionary CRUD endpoints (/api/dictionary)", () => {
      const testKey = "webConsoleTestKey_" + Date.now();
      const testRead = "ウェブテスト読み";

      it("should return dictionary list via GET /api/dictionary", async () => {
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary?type=message`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.type).toBe("message");
        expect(Array.isArray(data.items)).toBe(true);

        const resUser = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary?type=username`);
        expect(resUser.status).toBe(200);
        const dataUser = (await resUser.json()) as any;
        expect(dataUser.type).toBe("username");
        expect(Array.isArray(dataUser.items)).toBe(true);

        const resIgnore = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary?type=ignore`);
        expect(resIgnore.status).toBe(200);
        const dataIgnore = (await resIgnore.json()) as any;
        expect(dataIgnore.type).toBe("ignore");
        expect(Array.isArray(dataIgnore.items)).toBe(true);
      });

      it("should register or update a word via POST /api/dictionary", async () => {
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "message",
            keyword: testKey,
            read: testRead,
          }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.success).toBe(true);
        expect(data.keyword).toBe(testKey);
        expect(data.read).toBe(testRead);

        // Verify it exists in GET
        const listRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary?type=message`);
        const listData = (await listRes.json()) as any;
        const found = listData.items.find((item: any) => item.keyword === testKey);
        expect(found).toBeDefined();
        expect(found.read).toBe(testRead);
      });

      it("should support ignore list CRUD without read requirement", async () => {
        const ignorePattern = "^!testcmd_" + Date.now();
        // 1. Add ignore pattern (read is not required)
        const addRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ignore",
            keyword: ignorePattern,
          }),
        });
        expect(addRes.status).toBe(200);
        const addData = (await addRes.json()) as any;
        expect(addData.success).toBe(true);
        expect(addData.keyword).toBe(ignorePattern);
        expect(addData.read).toBe("");

        // 2. Verify exists in GET
        const listRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary?type=ignore`);
        expect(listRes.status).toBe(200);
        const listData = (await listRes.json()) as any;
        expect(listData.type).toBe("ignore");
        const found = listData.items.find((item: any) => item.keyword === ignorePattern);
        expect(found).toBeDefined();

        // 3. Delete ignore pattern
        const delRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ignore",
            keyword: ignorePattern,
          }),
        });
        expect(delRes.status).toBe(200);
        const delData = (await delRes.json()) as any;
        expect(delData.success).toBe(true);

        // 4. Verify deleted
        const listResAfter = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary?type=ignore`);
        const listDataAfter = (await listResAfter.json()) as any;
        const foundAfter = listDataAfter.items.find((item: any) => item.keyword === ignorePattern);
        expect(foundAfter).toBeUndefined();
      });

      it("should allow an empty username read via POST /api/dictionary", async () => {
        const usernameKey = "silentUser_" + Date.now();
        const addRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "username",
            keyword: usernameKey,
            read: "",
          }),
        });
        expect(addRes.status).toBe(200);
        const addData = (await addRes.json()) as any;
        expect(addData.success).toBe(true);
        expect(addData.keyword).toBe(usernameKey);
        expect(addData.read).toBe("");

        const listRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary?type=username`);
        const listData = (await listRes.json()) as any;
        const found = listData.items.find((item: any) => item.keyword === usernameKey);
        expect(found).toBeDefined();
        expect(found.read).toBe("");

        const delRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "username",
            keyword: usernameKey,
          }),
        });
        expect(delRes.status).toBe(200);
      });

      it("should reject invalid inputs in POST /api/dictionary", async () => {
        // Missing keyword
        const resEmpty = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "message", keyword: "", read: "test" }),
        });
        expect(resEmpty.status).toBe(400);

        // Keyword too long (>100 chars)
        const resLongKey = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "message", keyword: "k".repeat(101), read: "test" }),
        });
        expect(resLongKey.status).toBe(400);

        // Read too long (>200 chars)
        const resLongRead = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "message", keyword: "validKey", read: "r".repeat(201) }),
        });
        expect(resLongRead.status).toBe(400);
      });

      it("should delete a word via DELETE /api/dictionary", async () => {
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "message",
            keyword: testKey,
          }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.success).toBe(true);

        // Verify it was deleted
        const listRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dictionary?type=message`);
        const listData = (await listRes.json()) as any;
        const found = listData.items.find((item: any) => item.keyword === testKey);
        expect(found).toBeUndefined();
      });
    });
  });
});
