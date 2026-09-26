import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { HttpServer } from "../server/httpServer";
import { processComment } from "../tts/commentProcessor";
import { TTSQueue } from "../tts/queue";
import type { TTSEngine } from "../tts/engine";
import { KatakanaTransformer } from "../tts/transformers/katakana";
import { config } from "../config";

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

describe("HttpServer & commentProcessor", () => {
  const TEST_PORT = 3949;
  const TEST_BOUYOMI_PORT = 50089;
  let mockEngine: MockEngine;
  let queue: TTSQueue;
  let transformer: KatakanaTransformer;
  let server: HttpServer;

  beforeAll(() => {
    mockEngine = new MockEngine("HttpMockEngine");
    queue = new TTSQueue(mockEngine);
    transformer = new KatakanaTransformer();
    server = new HttpServer({
      queue,
      transformer,
      port: TEST_PORT,
      bouyomiPort: TEST_BOUYOMI_PORT,
      enableBouyomiCompat: true,
    });
    server.start();
  });

  afterAll(() => {
    server.stop();
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
  });
});
