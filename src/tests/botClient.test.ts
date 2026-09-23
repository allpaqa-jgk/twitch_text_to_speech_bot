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
});
