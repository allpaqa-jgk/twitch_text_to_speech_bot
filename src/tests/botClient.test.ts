import { describe, it, expect } from "bun:test";
import { TwitchTTSBot } from "../twitch/client";
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

describe("TwitchTTSBot integration tests", () => {
  it("should route Japanese comments to default engine", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const queue = new TTSQueue(defaultEngine);
    const transformer = new KatakanaTransformer();
    const bot = new TwitchTTSBot(queue, undefined, transformer);

    // Save initial state
    const originalMode = config.FOREIGN_LANGUAGE_MODE;
    const originalEnableTts = config.ENABLE_TTS;
    config.ENABLE_TTS = true;
    config.FOREIGN_LANGUAGE_MODE = "KATAKANA";

    try {
      await bot.handleIncomingMessage("#test", { username: "user1" }, "こんにちは！配信お疲れ様です");
      // Wait for queue processing
      await new Promise((r) => setTimeout(r, 50));

      expect(defaultEngine.spokenTexts.length).toBe(1);
      expect(defaultEngine.spokenTexts[0]).toBe("こんにちは配信お疲れ様です");
    } finally {
      config.FOREIGN_LANGUAGE_MODE = originalMode;
      config.ENABLE_TTS = originalEnableTts;
    }
  });

  it("should convert foreign comments to Katakana in KATAKANA mode", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const queue = new TTSQueue(defaultEngine);
    const transformer = new KatakanaTransformer();
    const bot = new TwitchTTSBot(queue, undefined, transformer);

    const originalMode = config.FOREIGN_LANGUAGE_MODE;
    const originalEnableTts = config.ENABLE_TTS;
    config.ENABLE_TTS = true;
    config.FOREIGN_LANGUAGE_MODE = "KATAKANA";

    try {
      await bot.handleIncomingMessage("#test", { username: "user2" }, "Hello world!");
      await new Promise((r) => setTimeout(r, 50));

      expect(defaultEngine.spokenTexts.length).toBe(1);
      // "Hello world!" -> "ハロー ワールド"
      expect(defaultEngine.spokenTexts[0]).toContain("ハロー");
    } finally {
      config.FOREIGN_LANGUAGE_MODE = originalMode;
      config.ENABLE_TTS = originalEnableTts;
    }
  });

  it("should route English comments to English engine in NATIVE mode", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const englishEngine = new MockEngine("KokoroEnglish");
    const queue = new TTSQueue(defaultEngine);
    const transformer = new KatakanaTransformer();
    const bot = new TwitchTTSBot(queue, englishEngine, transformer);

    const originalMode = config.FOREIGN_LANGUAGE_MODE;
    const originalEnableTts = config.ENABLE_TTS;
    config.ENABLE_TTS = true;
    config.FOREIGN_LANGUAGE_MODE = "NATIVE";

    try {
      await bot.handleIncomingMessage("#test", { username: "user3" }, "Good luck with the game!");
      await new Promise((r) => setTimeout(r, 50));

      // Should be handled by englishEngine, not defaultEngine
      expect(englishEngine.spokenTexts.length).toBe(1);
      expect(englishEngine.spokenTexts[0]).toBe("Good luck with the game");
      expect(defaultEngine.spokenTexts.length).toBe(0);
    } finally {
      config.FOREIGN_LANGUAGE_MODE = originalMode;
      config.ENABLE_TTS = originalEnableTts;
    }
  });

  it("should skip foreign comments in IGNORE mode", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const queue = new TTSQueue(defaultEngine);
    const bot = new TwitchTTSBot(queue);

    const originalMode = config.FOREIGN_LANGUAGE_MODE;
    const originalEnableTts = config.ENABLE_TTS;
    config.ENABLE_TTS = true;
    config.FOREIGN_LANGUAGE_MODE = "IGNORE";

    try {
      await bot.handleIncomingMessage("#test", { username: "user4" }, "Privet kak dela");
      await new Promise((r) => setTimeout(r, 50));

      expect(defaultEngine.spokenTexts.length).toBe(0);
    } finally {
      config.FOREIGN_LANGUAGE_MODE = originalMode;
      config.ENABLE_TTS = originalEnableTts;
    }
  });

  it("should speak cheer messages containing bits normally in KATAKANA mode", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const queue = new TTSQueue(defaultEngine);
    const transformer = new KatakanaTransformer();
    const bot = new TwitchTTSBot(queue, undefined, transformer);

    const originalMode = config.FOREIGN_LANGUAGE_MODE;
    const originalEnableTts = config.ENABLE_TTS;
    config.ENABLE_TTS = true;
    config.FOREIGN_LANGUAGE_MODE = "KATAKANA";

    try {
      await bot.handleIncomingMessage(
        "#test",
        { username: "cheer_user", bits: "100" as any },
        "Cheer100 ナイスプレイ！"
      );
      await new Promise((r) => setTimeout(r, 50));

      expect(defaultEngine.spokenTexts.length).toBe(1);
      expect(defaultEngine.spokenTexts[0]).toContain("チエアー100");
      expect(defaultEngine.spokenTexts[0]).toContain("ナイスプレイ");
    } finally {
      config.FOREIGN_LANGUAGE_MODE = originalMode;
      config.ENABLE_TTS = originalEnableTts;
    }
  });

  it("should deduplicate messages with the same messageId", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const queue = new TTSQueue(defaultEngine);
    const bot = new TwitchTTSBot(queue);

    const originalEnableTts = config.ENABLE_TTS;
    config.ENABLE_TTS = true;

    try {
      const context = { id: "msg-123", username: "user1" };
      await bot.handleIncomingMessage("#test", context, "メッセージ1");
      await bot.handleIncomingMessage("#test", context, "メッセージ1（再送）");
      await new Promise((r) => setTimeout(r, 50));

      expect(defaultEngine.spokenTexts.length).toBe(1);
      expect(defaultEngine.spokenTexts[0]).toBe("メッセージ1");
    } finally {
      config.ENABLE_TTS = originalEnableTts;
    }
  });

  it("should process messages with different messageIds", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const queue = new TTSQueue(defaultEngine);
    const bot = new TwitchTTSBot(queue);

    const originalEnableTts = config.ENABLE_TTS;
    config.ENABLE_TTS = true;

    try {
      await bot.handleIncomingMessage("#test", { id: "msg-1", username: "user1" }, "メッセージ1");
      await bot.handleIncomingMessage("#test", { id: "msg-2", username: "user2" }, "メッセージ2");
      await new Promise((r) => setTimeout(r, 50));

      expect(defaultEngine.spokenTexts.length).toBe(2);
      expect(defaultEngine.spokenTexts[0]).toBe("メッセージ1");
      expect(defaultEngine.spokenTexts[1]).toBe("メッセージ2");
    } finally {
      config.ENABLE_TTS = originalEnableTts;
    }
  });

  it("should maintain ring buffer at max 100 messageIds and evict oldest to prevent memory leak", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const queue = new TTSQueue(defaultEngine);
    const bot = new TwitchTTSBot(queue);

    const originalEnableTts = config.ENABLE_TTS;
    config.ENABLE_TTS = true;

    try {
      for (let i = 0; i < 105; i++) {
        await bot.handleIncomingMessage(
          "#test",
          { id: `msg-${i}`, username: `user${i}` },
          `テスト${i}`
        );
      }
      await new Promise((r) => setTimeout(r, 100));

      expect((bot as any).recentMessageIds.size).toBe(100);
      expect((bot as any).messageIdQueue.length).toBe(100);
      expect((bot as any).recentMessageIds.has("msg-0")).toBe(false);
      expect((bot as any).recentMessageIds.has("msg-4")).toBe(false);
      expect((bot as any).recentMessageIds.has("msg-5")).toBe(true);
      expect((bot as any).recentMessageIds.has("msg-104")).toBe(true);

      const currentCount = defaultEngine.spokenTexts.length;
      await bot.handleIncomingMessage(
        "#test",
        { id: "msg-0", username: "user0" },
        "再送テスト0"
      );
      await new Promise((r) => setTimeout(r, 50));
      expect(defaultEngine.spokenTexts.length).toBe(currentCount + 1);
    } finally {
      config.ENABLE_TTS = originalEnableTts;
    }
  });

  it("should guard against duplicate connect calls while connecting or when connected", async () => {
    const defaultEngine = new MockEngine("DefaultJapanese");
    const queue = new TTSQueue(defaultEngine);
    const bot = new TwitchTTSBot(queue);

    let connectCallCount = 0;
    let finishConnect: () => void = () => {};

    const mockClient = {
      readyState: () => "CLOSED",
      connect: () => {
        connectCallCount++;
        return new Promise<[string, number]>((resolve) => {
          finishConnect = () => resolve(["irc.chat.twitch.tv", 6697]);
        });
      },
      disconnect: async () => {},
    };

    (bot as any).client = mockClient;

    const firstConnectPromise = bot.connect();
    expect((bot as any).isConnecting).toBe(true);

    const secondConnectPromise = bot.connect();

    mockClient.readyState = () => "CONNECTING";
    const thirdConnectPromise = bot.connect();

    finishConnect();
    await Promise.all([firstConnectPromise, secondConnectPromise, thirdConnectPromise]);

    expect(connectCallCount).toBe(1);
    expect((bot as any).isConnecting).toBe(false);

    mockClient.readyState = () => "OPEN";
    await bot.connect();
    expect(connectCallCount).toBe(1);
  });
});


