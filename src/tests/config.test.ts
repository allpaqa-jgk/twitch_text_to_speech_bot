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
});
