import { describe, expect, it } from "bun:test";
import { parseConfig } from "../config";

describe("parseConfig", () => {
  it("applies defaults and reads auth values", () => {
    const config = parseConfig({}, {
      oauthToken: "oauth:token",
      channelName: "channel",
      username: "bot",
    });

    expect(config.TTS_ENGINE).toBe("COEIROINK");
    expect(config.TW_OAUTH_TOKEN).toBe("oauth:token");
    expect(config.TW_CHANNEL_NAME).toBe("channel");
    expect(config.BOT_USERNAME).toBe("bot");
  });

  it("uses OAuth identity values when optional sample settings are empty", () => {
    const config = parseConfig(
      {
        TW_OAUTH_TOKEN: "",
        TW_CHANNEL_NAME: "",
        BOT_USERNAME: "",
      },
      {
        oauthToken: "oauth:token",
        channelName: "channel",
        username: "bot",
      }
    );

    expect(config.TW_OAUTH_TOKEN).toBe("oauth:token");
    expect(config.TW_CHANNEL_NAME).toBe("channel");
    expect(config.BOT_USERNAME).toBe("bot");
  });

  it("reports invalid enum values with the setting name and allowed values", () => {
    expect(() => parseConfig({ TTS_ENGINE: "UNKNOWN" })).toThrow(
      "TTS_ENGINE must be one of: COEIROINK, VOICEVOX, PIPER, KOKORO, Mac"
    );
  });

  it("reports invalid types with the setting name", () => {
    expect(() => parseConfig({ ENABLE_TTS: "yes" })).toThrow(
      "ENABLE_TTS must be a boolean"
    );
  });

  it("reports out-of-range and non-integer numeric settings", () => {
    expect(() => parseConfig({ HTTP_SERVER_PORT: 70000 })).toThrow(
      "HTTP_SERVER_PORT must be an integer between 1 and 65535"
    );
    expect(() => parseConfig({ VOICEVOX_SPEAKER_ID: 1.5 })).toThrow(
      "VOICEVOX_SPEAKER_ID must be an integer"
    );
  });

  it("validates optional pause length while allowing null to disable it", () => {
    expect(parseConfig({ COEIROINK_PAUSE_LENGTH: null }).COEIROINK_PAUSE_LENGTH).toBeUndefined();
    expect(() => parseConfig({ COEIROINK_PAUSE_LENGTH: -1 })).toThrow(
      "COEIROINK_PAUSE_LENGTH must be a number between 0 and 10"
    );
  });

  it("rejects non-object configuration data", () => {
    expect(() => parseConfig([])).toThrow("default.js must export an object");
  });

  it("passes in-range values through unchanged without warning", () => {
    const origWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: any[]) => {
      warnings.push(args.join(" "));
    };

    try {
      const config = parseConfig({
        COEIROINK_SPEED_SCALE: 1.5,
        VOICEVOX_SPEED_SCALE: 1.2,
        KOKORO_SPEED: 0.8,
        MAX_ACCELERATION_SPEED: 1.8,
        RATE_ENGLISH: 250,
        RATE_JAPANESE: 300,
      });

      expect(config.COEIROINK_SPEED_SCALE).toBe(1.5);
      expect(config.VOICEVOX_SPEED_SCALE).toBe(1.2);
      expect(config.KOKORO_SPEED).toBe(0.8);
      expect(config.MAX_ACCELERATION_SPEED).toBe(1.8);
      expect(config.RATE_ENGLISH).toBe(250);
      expect(config.RATE_JAPANESE).toBe(300);
      expect(warnings).toHaveLength(0);
    } finally {
      console.warn = origWarn;
    }
  });

  it("clamps out-of-range speed and rate settings to engine bounds and logs a warning", () => {
    const origWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: any[]) => {
      warnings.push(args.join(" "));
    };

    try {
      const configHigh = parseConfig({
        COEIROINK_SPEED_SCALE: 4.5,
        RATE_ENGLISH: 400,
      });

      expect(configHigh.COEIROINK_SPEED_SCALE).toBe(2);
      expect(configHigh.RATE_ENGLISH).toBe(350);
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain("COEIROINK_SPEED_SCALE");
      expect(warnings[0]).toContain("4.5");
      expect(warnings[0]).toContain("2");
      expect(warnings[1]).toContain("RATE_ENGLISH");
      expect(warnings[1]).toContain("400");
      expect(warnings[1]).toContain("350");

      warnings.length = 0;
      const configLow = parseConfig({
        COEIROINK_SPEED_SCALE: 0.1,
        RATE_ENGLISH: 50,
      });

      expect(configLow.COEIROINK_SPEED_SCALE).toBe(0.5);
      expect(configLow.RATE_ENGLISH).toBe(100);
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain("COEIROINK_SPEED_SCALE");
      expect(warnings[0]).toContain("0.1");
      expect(warnings[0]).toContain("0.5");
      expect(warnings[1]).toContain("RATE_ENGLISH");
      expect(warnings[1]).toContain("50");
      expect(warnings[1]).toContain("100");
    } finally {
      console.warn = origWarn;
    }
  });

  it("rejects non-numeric values for bounded keys", () => {
    expect(() => parseConfig({ COEIROINK_SPEED_SCALE: "fast" })).toThrow(
      "COEIROINK_SPEED_SCALE must be a number between 0.5 and 2"
    );
    expect(() => parseConfig({ RATE_ENGLISH: "slow" })).toThrow(
      "RATE_ENGLISH must be an integer between 100 and 350"
    );
    expect(() => parseConfig({ RATE_ENGLISH: 200.5 })).toThrow(
      "RATE_ENGLISH must be an integer between 100 and 350"
    );
  });

  it("still throws on out-of-range values for unaffected keys", () => {
    expect(() => parseConfig({ MASTER_VOLUME: 99 })).toThrow(
      "MASTER_VOLUME must be a number between 0 and 5"
    );
  });
});
