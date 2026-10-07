import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  ConfigSettingsService,
  SettingsValidationError,
} from "../application/configSettingsService";
import { CONFIG_SETTINGS } from "../configSettings";

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
    const service = new ConfigSettingsService(tempFilePath);

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

    const service = new ConfigSettingsService(tempFilePath);
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
