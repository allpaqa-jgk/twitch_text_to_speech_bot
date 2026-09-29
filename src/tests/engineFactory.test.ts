import { describe, expect, it } from "bun:test";
import { parseConfig } from "../config";
import {
  createEngine,
  createEnglishEngine,
  getFallbackOrder,
  resolvePrimaryEngine,
  type EngineName,
} from "../tts/engineFactory";
import type { TTSEngine } from "../tts/engine";

function mockEngine(name: EngineName, available: boolean): TTSEngine {
  return {
    name,
    isAvailable: async () => available,
    say: async () => {},
  };
}

describe("engine factory", () => {
  it("tries the configured engine first, then uses the first available platform fallback", async () => {
    const attempted: EngineName[] = [];
    const config = parseConfig({ TTS_ENGINE: "COEIROINK" });
    const selected = await resolvePrimaryEngine(config, "linux", (name) => {
      attempted.push(name);
      return mockEngine(name, name === "PIPER");
    });

    expect(attempted).toEqual(["COEIROINK", "VOICEVOX", "PIPER"]);
    expect(selected.name).toBe("PIPER");
  });

  it("only includes the macOS engine in fallback candidates on macOS", () => {
    expect(getFallbackOrder("linux")).toEqual(["COEIROINK", "VOICEVOX", "PIPER", "KOKORO"]);
    expect(getFallbackOrder("darwin")).toEqual([
      "COEIROINK", "VOICEVOX", "PIPER", "KOKORO", "Mac",
    ]);
  });

  it("passes configured server settings into the selected engine", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return new Response("", { status: 200 });
    }) as typeof fetch;

    try {
      const engine = createEngine(
        "COEIROINK",
        parseConfig({ COEIROINK_HOST: "tts.example", COEIROINK_PORT: 12345 })
      );
      expect(await engine.isAvailable()).toBe(true);
      expect(requestedUrls).toEqual(["http://tts.example:12345/v1/speakers"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps macOS say unavailable as an English engine on other platforms", () => {
    const config = parseConfig({ ENGLISH_TTS_ENGINE: "Mac" });
    expect(createEnglishEngine(config, "linux")).toBeUndefined();
    expect(createEnglishEngine(config, "darwin")?.name).toBe("MacSay");
  });

  it("returns the preferred engine when no candidate is available", async () => {
    const config = parseConfig({ TTS_ENGINE: "KOKORO" });
    const selected = await resolvePrimaryEngine(config, "win32", (name) =>
      mockEngine(name, false)
    );

    expect(selected.name).toBe("KOKORO");
  });

  it("uses the preferred engine without probing fallbacks when it is available", async () => {
    const attempted: EngineName[] = [];
    const config = parseConfig({ TTS_ENGINE: "VOICEVOX" });
    const selected = await resolvePrimaryEngine(config, "linux", (name) => {
      attempted.push(name);
      return mockEngine(name, true);
    });

    expect(attempted).toEqual(["VOICEVOX"]);
    expect(selected.name).toBe("VOICEVOX");
  });
});
