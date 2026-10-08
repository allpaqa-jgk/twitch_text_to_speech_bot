import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  ConfigSettingsService,
  SettingsValidationError,
} from "../application/configSettingsService";
import { CONFIG_SETTINGS, settingsForPlatform } from "../configSettings";

describe("ConfigSettingsService bounds validation & rate steps", () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "twitch-tts-settings-test-"));
    tempFilePath = path.join(tempDir, "web-settings.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("throws SettingsValidationError on update with out-of-range value and does not create or mutate settings file", () => {
    const service = new ConfigSettingsService(tempFilePath);

    // File not created when non-existent
    expect(() => service.update({ RATE_ENGLISH: 400 })).toThrow(SettingsValidationError);
    expect(() => service.update({ RATE_ENGLISH: 400 })).toThrow(
      "RATE_ENGLISH must be a number between 100 and 350."
    );
    expect(fs.existsSync(tempFilePath)).toBe(false);

    // File unchanged when it already existed
    fs.writeFileSync(tempFilePath, JSON.stringify({ RATE_ENGLISH: 200 }));
    expect(() => service.update({ RATE_ENGLISH: 400 })).toThrow(SettingsValidationError);
    const persisted = JSON.parse(fs.readFileSync(tempFilePath, "utf-8"));
    expect(persisted).toEqual({ RATE_ENGLISH: 200 });
  });

  it("succeeds on update with in-range rate like 151 and persists it", () => {
    const service = new ConfigSettingsService(tempFilePath, undefined, undefined, "darwin");

    const snapshot = service.update({ RATE_ENGLISH: 151 });
    const setting = snapshot.settings.find((s) => s.key === "RATE_ENGLISH");
    expect(setting?.value).toBe(151);
    expect(setting?.isOverridden).toBe(true);

    expect(fs.existsSync(tempFilePath)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(tempFilePath, "utf-8"));
    expect(persisted.RATE_ENGLISH).toBe(151);
  });

  it("loads an existing settings file containing out-of-range value via getSnapshot() with clamped effective value", () => {
    fs.writeFileSync(tempFilePath, JSON.stringify({ RATE_ENGLISH: 400 }));

    const service = new ConfigSettingsService(tempFilePath, undefined, undefined, "darwin");
    const snapshot = service.getSnapshot();
    const setting = snapshot.settings.find((s) => s.key === "RATE_ENGLISH");
    expect(setting?.value).toBe(350);
    expect(setting?.isOverridden).toBe(true);

    // Existing file content remains as persisted
    const persisted = JSON.parse(fs.readFileSync(tempFilePath, "utf-8"));
    expect(persisted).toEqual({ RATE_ENGLISH: 400 });
  });

  it("verifies rate definitions in CONFIG_SETTINGS have step: 1", () => {
    const rateEnglish = CONFIG_SETTINGS.find((s) => s.key === "RATE_ENGLISH");
    const rateJapanese = CONFIG_SETTINGS.find((s) => s.key === "RATE_JAPANESE");

    expect(rateEnglish).toBeDefined();
    expect(rateEnglish?.step).toBe(1);
    expect(rateEnglish?.min).toBe(100);
    expect(rateEnglish?.max).toBe(350);

    expect(rateJapanese).toBeDefined();
    expect(rateJapanese?.step).toBe(1);
    expect(rateJapanese?.min).toBe(100);
    expect(rateJapanese?.max).toBe(350);
  });
});

describe("ConfigSettingsService platform-based filtering", () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "twitch-tts-platform-settings-test-"));
    tempFilePath = path.join(tempDir, "web-settings.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const macOSKeys = [
    "SPEAKER_ENGLISH",
    "SPEAKER_JAPANESE",
    "RATE_ENGLISH",
    "RATE_JAPANESE",
  ] as const;

  it("settingsForPlatform('darwin') returns every key of CONFIG_SETTINGS in order with Mac option offered", () => {
    const settings = settingsForPlatform("darwin");
    expect(settings.map((s) => s.key)).toEqual(CONFIG_SETTINGS.map((s) => s.key));

    const ttsEngine = settings.find((s) => s.key === "TTS_ENGINE");
    const englishTtsEngine = settings.find((s) => s.key === "ENGLISH_TTS_ENGINE");
    expect(ttsEngine?.options).toContain("Mac");
    expect(englishTtsEngine?.options).toContain("Mac");
  });

  it("settingsForPlatform('win32') and ('linux') contain no macOS keys, no macOS group, and no Mac engine option", () => {
    for (const platform of ["win32", "linux"]) {
      const settings = settingsForPlatform(platform);

      for (const key of macOSKeys) {
        expect(settings.some((s) => s.key === key)).toBe(false);
      }
      expect(settings.some((s) => s.group === "macOS 音声")).toBe(false);

      const ttsEngine = settings.find((s) => s.key === "TTS_ENGINE");
      const englishTtsEngine = settings.find((s) => s.key === "ENGLISH_TTS_ENGINE");
      expect(ttsEngine?.options).not.toContain("Mac");
      expect(englishTtsEngine?.options).not.toContain("Mac");

      const expectedKeys = CONFIG_SETTINGS.filter(
        (s) => !macOSKeys.includes(s.key as (typeof macOSKeys)[number])
      ).map((s) => s.key);
      expect(settings.map((s) => s.key)).toEqual(expectedKeys);

      expect(ttsEngine?.options).toEqual(["COEIROINK", "VOICEVOX", "PIPER", "KOKORO"]);
      expect(englishTtsEngine?.options).toEqual(["KOKORO", "PIPER"]);
    }
  });

  it("filters snapshot settings on win32 and includes them on darwin", () => {
    const winService = new ConfigSettingsService(tempFilePath, undefined, undefined, "win32");
    const winSettings = winService.getSnapshot().settings;
    for (const key of macOSKeys) {
      expect(winSettings.some((s) => s.key === key)).toBe(false);
    }
    const winTts = winSettings.find((s) => s.key === "TTS_ENGINE");
    const winEngTts = winSettings.find((s) => s.key === "ENGLISH_TTS_ENGINE");
    expect(winTts?.options).not.toContain("Mac");
    expect(winEngTts?.options).not.toContain("Mac");

    const darwinService = new ConfigSettingsService(tempFilePath, undefined, undefined, "darwin");
    const darwinSettings = darwinService.getSnapshot().settings;
    for (const key of macOSKeys) {
      expect(darwinSettings.some((s) => s.key === key)).toBe(true);
    }
    const darwinTts = darwinSettings.find((s) => s.key === "TTS_ENGINE");
    const darwinEngTts = darwinSettings.find((s) => s.key === "ENGLISH_TTS_ENGINE");
    expect(darwinTts?.options).toContain("Mac");
    expect(darwinEngTts?.options).toContain("Mac");
  });

  it("omits hidden settings from snapshot on win32 while preserving hidden overrides on save and updating restartRequired", () => {
    fs.writeFileSync(tempFilePath, JSON.stringify({ RATE_ENGLISH: 200 }));
    const service = new ConfigSettingsService(tempFilePath, undefined, undefined, "win32");

    const initialSnapshot = service.getSnapshot();
    expect(initialSnapshot.settings.some((s) => s.key === "RATE_ENGLISH")).toBe(false);

    const updatedSnapshot = service.update({ MASTER_VOLUME: 2 });
    expect(updatedSnapshot.restartRequired).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(tempFilePath, "utf-8"));
    expect(persisted.RATE_ENGLISH).toBe(200);
    expect(persisted.MASTER_VOLUME).toBe(2);
  });

  it("verifies snapshot entries carry no platforms or optionPlatforms property", () => {
    for (const platform of ["darwin", "win32"]) {
      const service = new ConfigSettingsService(tempFilePath, undefined, undefined, platform);
      const snapshot = service.getSnapshot();
      for (const entry of snapshot.settings) {
        expect("platforms" in entry).toBe(false);
        expect("optionPlatforms" in entry).toBe(false);
      }
    }
  });
});

