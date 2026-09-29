import path from "path";
import fs from "fs";
import { paths } from "./paths";
import { parseConfigSettings } from "./configSettings";

export interface BotConfig {
  TTS_MODE: string;
  TTS_ENGINE: "COEIROINK" | "VOICEVOX" | "PIPER" | "KOKORO" | "Mac";
  USE_VOICEVOX?: boolean;
  ENGLISH_TTS_ENGINE: "KOKORO" | "PIPER" | "Mac";
  KOKORO_ENGLISH_VOICE: string;
  PIPER_MODEL_PATH?: string;
  KOKORO_VOICE?: string;
  KOKORO_SPEED?: number;
  COEIROINK_HOST: string;
  COEIROINK_PORT: number;
  COEIROINK_STYLE_ID: number;
  COEIROINK_SPEAKER_UUID?: string;
  COEIROINK_SPEED_SCALE: number;
  COEIROINK_VOLUME_SCALE: number;
  COEIROINK_OUTPUT_SAMPLING_RATE: number;
  COEIROINK_PAUSE_LENGTH?: number | null;
  VOICEVOX_HOST: string;
  VOICEVOX_PORT: number;
  VOICEVOX_SPEAKER_ID: number;
  VOICEVOX_SPEED_SCALE: number;
  VOICEVOX_VOLUME_SCALE: number;
  VOICEVOX_OUTPUT_SAMPLING_RATE: number;
  SPEAKER_ENGLISH: string;
  SPEAKER_JAPANESE: string;
  RATE_ENGLISH: number;
  RATE_JAPANESE: number;
  ENABLE_TTS: boolean;
  READ_USERNAME: boolean;
  USE_SIMPLE_NAME: boolean;
  STARTING_MESSAGE: string;
  MASTER_VOLUME: number;
  BILINGAL_MODE: boolean;
  FOREIGN_LANGUAGE_MODE: "KATAKANA" | "NATIVE" | "IGNORE";
  AUTO_ACCELERATE?: boolean;
  MAX_ACCELERATION_SPEED?: number;
  COMMENT_TTL_SECONDS?: number;
  COMMENT_REMEMVER_AVAILABLE: boolean;
  COMMENT_REMEMVER_COMMAND: string;
  COMMENT_FORGET_COMMAND: string;
  ENABLE_TWITCH: boolean;
  TW_OAUTH_TOKEN: string;
  TW_CHANNEL_NAME: string;
  BOT_USERNAME: string;
  HTTP_SERVER_ENABLED: boolean;
  HTTP_TALK_ENABLED: boolean;
  HTTP_SERVER_PORT: number;
  BOUYOMI_COMPAT_ENABLED: boolean;
  BOUYOMI_COMPAT_PORT: number;
  DISCORD_TRANSFER_ENABLED: boolean;
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_TOKEN?: string;
  DISCORD_CHANNEL_ID?: string;
}

type RawConfig = Record<string, unknown>;

function asConfigRecord(value: unknown, source: string): RawConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[Config] ${source} must export an object.`);
  }
  return value as RawConfig;
}

function readString(
  raw: RawConfig,
  key: string,
  fallback: string,
  options: { allowEmpty?: boolean; emptyUsesFallback?: boolean } = {}
): string {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || (!options.allowEmpty && value.trim() === "")) {
    throw new Error(`[Config] ${key} must be ${options.allowEmpty ? "a string" : "a non-empty string"}.`);
  }
  if (value === "" && options.emptyUsesFallback) return fallback;
  return value;
}

function readBoolean(raw: RawConfig, key: string, fallback: boolean): boolean {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`[Config] ${key} must be a boolean.`);
  }
  return value;
}

function readNumber(
  raw: RawConfig,
  key: string,
  fallback: number,
  range: { min: number; max: number; integer?: boolean }
): number {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < range.min ||
    value > range.max ||
    (range.integer && !Number.isInteger(value))
  ) {
    const kind = range.integer ? "an integer" : "a number";
    throw new Error(`[Config] ${key} must be ${kind} between ${range.min} and ${range.max}.`);
  }
  return value;
}

function readEnum<T extends string>(
  raw: RawConfig,
  key: string,
  fallback: T,
  allowed: readonly T[]
): T {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`[Config] ${key} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function readAuthConfig(filePath: string): RawConfig {
  if (!fs.existsSync(filePath)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new Error(`[Config] Failed to parse "${filePath}": ${String(err)}`);
  }
  const auth = asConfigRecord(parsed, filePath);
  for (const key of ["oauthToken", "channelName", "username"]) {
    const value = auth[key];
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`[Config] ${filePath}: ${key} must be a string.`);
    }
  }
  return auth;
}

export function parseConfig(rawValue: unknown, authValue: unknown = {}): BotConfig {
  const raw = asConfigRecord(rawValue, "default.js");
  const auth = asConfigRecord(authValue, "auth.json");
  const channelName = readString(
    raw,
    "TW_CHANNEL_NAME",
    typeof auth.channelName === "string" ? auth.channelName : "",
    { allowEmpty: true, emptyUsesFallback: true }
  );
  const ttsEngineFallback = readBoolean(raw, "USE_VOICEVOX", false)
    ? "VOICEVOX"
    : "COEIROINK";
  const optionalPause = raw.COEIROINK_PAUSE_LENGTH;
  const pauseLength =
    optionalPause === undefined || optionalPause === null
      ? undefined
      : readNumber(
          { COEIROINK_PAUSE_LENGTH: optionalPause },
          "COEIROINK_PAUSE_LENGTH",
          0.04,
          { min: 0, max: 10 }
        );

  return {
    TTS_MODE: readString(raw, "TTS_MODE", "Mac"),
    TTS_ENGINE: readEnum(raw, "TTS_ENGINE", ttsEngineFallback, [
      "COEIROINK", "VOICEVOX", "PIPER", "KOKORO", "Mac",
    ]),
    USE_VOICEVOX: readBoolean(raw, "USE_VOICEVOX", false),
    ENGLISH_TTS_ENGINE: readEnum(raw, "ENGLISH_TTS_ENGINE", "KOKORO", [
      "KOKORO", "PIPER", "Mac",
    ]),
    KOKORO_ENGLISH_VOICE: readString(raw, "KOKORO_ENGLISH_VOICE", "af_heart"),
    PIPER_MODEL_PATH: readString(raw, "PIPER_MODEL_PATH", "", { allowEmpty: true }),
    KOKORO_VOICE: readString(raw, "KOKORO_VOICE", "jf_alpha"),
    KOKORO_SPEED: readNumber(raw, "KOKORO_SPEED", 1, { min: 0.1, max: 5 }),
    COEIROINK_HOST: readString(raw, "COEIROINK_HOST", "127.0.0.1"),
    COEIROINK_PORT: readNumber(raw, "COEIROINK_PORT", 50032, { min: 1, max: 65535, integer: true }),
    COEIROINK_STYLE_ID: readNumber(raw, "COEIROINK_STYLE_ID", 0, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
    COEIROINK_SPEAKER_UUID: readString(raw, "COEIROINK_SPEAKER_UUID", "", { allowEmpty: true }),
    COEIROINK_SPEED_SCALE: readNumber(raw, "COEIROINK_SPEED_SCALE", 1, { min: 0.1, max: 5 }),
    COEIROINK_VOLUME_SCALE: readNumber(raw, "COEIROINK_VOLUME_SCALE", 1, { min: 0, max: 5 }),
    COEIROINK_OUTPUT_SAMPLING_RATE: readNumber(raw, "COEIROINK_OUTPUT_SAMPLING_RATE", 44100, { min: 8000, max: 192000, integer: true }),
    COEIROINK_PAUSE_LENGTH: pauseLength,
    VOICEVOX_HOST: readString(raw, "VOICEVOX_HOST", "127.0.0.1"),
    VOICEVOX_PORT: readNumber(raw, "VOICEVOX_PORT", 50021, { min: 1, max: 65535, integer: true }),
    VOICEVOX_SPEAKER_ID: readNumber(raw, "VOICEVOX_SPEAKER_ID", 1, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
    VOICEVOX_SPEED_SCALE: readNumber(raw, "VOICEVOX_SPEED_SCALE", 1, { min: 0.1, max: 5 }),
    VOICEVOX_VOLUME_SCALE: readNumber(raw, "VOICEVOX_VOLUME_SCALE", 1, { min: 0, max: 5 }),
    VOICEVOX_OUTPUT_SAMPLING_RATE: readNumber(raw, "VOICEVOX_OUTPUT_SAMPLING_RATE", 24000, { min: 8000, max: 192000, integer: true }),
    SPEAKER_ENGLISH: readString(raw, "SPEAKER_ENGLISH", "Susan"),
    SPEAKER_JAPANESE: readString(raw, "SPEAKER_JAPANESE", "Kyoko"),
    RATE_ENGLISH: readNumber(raw, "RATE_ENGLISH", 150, { min: 1, max: 500, integer: true }),
    RATE_JAPANESE: readNumber(raw, "RATE_JAPANESE", 200, { min: 1, max: 500, integer: true }),
    ENABLE_TTS: readBoolean(raw, "ENABLE_TTS", true),
    READ_USERNAME: readBoolean(raw, "READ_USERNAME", false),
    USE_SIMPLE_NAME: readBoolean(raw, "USE_SIMPLE_NAME", true),
    STARTING_MESSAGE: readString(raw, "STARTING_MESSAGE", "読み上げを起動しました", { allowEmpty: true }),
    MASTER_VOLUME: readNumber(raw, "MASTER_VOLUME", 1, { min: 0, max: 5 }),
    BILINGAL_MODE: readBoolean(raw, "BILINGAL_MODE", false),
    FOREIGN_LANGUAGE_MODE: readEnum(raw, "FOREIGN_LANGUAGE_MODE", "KATAKANA", [
      "KATAKANA", "NATIVE", "IGNORE",
    ]),
    AUTO_ACCELERATE: readBoolean(raw, "AUTO_ACCELERATE", true),
    MAX_ACCELERATION_SPEED: readNumber(raw, "MAX_ACCELERATION_SPEED", 1.6, { min: 1, max: 5 }),
    COMMENT_TTL_SECONDS: readNumber(raw, "COMMENT_TTL_SECONDS", 30, { min: 0, max: 86400 }),
    COMMENT_REMEMVER_AVAILABLE: readBoolean(raw, "COMMENT_REMEMVER_AVAILABLE", true),
    COMMENT_REMEMVER_COMMAND: readString(raw, "COMMENT_REMEMVER_COMMAND", "remember"),
    COMMENT_FORGET_COMMAND: readString(raw, "COMMENT_FORGET_COMMAND", "forget"),
    ENABLE_TWITCH: readBoolean(raw, "ENABLE_TWITCH", true),
    TW_OAUTH_TOKEN: readString(
      raw,
      "TW_OAUTH_TOKEN",
      typeof auth.oauthToken === "string" ? auth.oauthToken : "",
      { allowEmpty: true, emptyUsesFallback: true }
    ),
    TW_CHANNEL_NAME: channelName,
    BOT_USERNAME: readString(
      raw,
      "BOT_USERNAME",
      (typeof auth.username === "string" && auth.username) ||
        (channelName ? `${channelName}_bot` : ""),
      { allowEmpty: true, emptyUsesFallback: true }
    ),
    HTTP_SERVER_ENABLED: readBoolean(raw, "HTTP_SERVER_ENABLED", true),
    HTTP_TALK_ENABLED: readBoolean(raw, "HTTP_TALK_ENABLED", true),
    HTTP_SERVER_PORT: readNumber(raw, "HTTP_SERVER_PORT", 3939, { min: 1, max: 65535, integer: true }),
    BOUYOMI_COMPAT_ENABLED: readBoolean(raw, "BOUYOMI_COMPAT_ENABLED", true),
    BOUYOMI_COMPAT_PORT: readNumber(raw, "BOUYOMI_COMPAT_PORT", 50080, { min: 1, max: 65535, integer: true }),
    DISCORD_TRANSFER_ENABLED: readBoolean(raw, "DISCORD_TRANSFER_ENABLED", false),
    DISCORD_WEBHOOK_URL: readString(raw, "DISCORD_WEBHOOK_URL", "", { allowEmpty: true }),
    DISCORD_TOKEN: readString(raw, "DISCORD_TOKEN", "", { allowEmpty: true }),
    DISCORD_CHANNEL_ID: readString(raw, "DISCORD_CHANNEL_ID", "", { allowEmpty: true }),
  };
}

const configDir = paths.configDir();
const rootConfigPath = path.join(configDir, "default.js");
const samplePath = path.join(configDir, "default.js.sample");
const webSettingsPath = paths.webSettingsJson();
let rawConfig: RawConfig = {};
if (fs.existsSync(rootConfigPath)) {
  rawConfig = asConfigRecord(require(rootConfigPath), rootConfigPath);
} else if (fs.existsSync(samplePath)) {
  console.warn(
    `[Config] "config/default.js" was not found. Falling back to "${samplePath}".`
  );
  rawConfig = asConfigRecord(require(samplePath), samplePath);
} else {
  console.error(
    `[Config] Neither "config/default.js" nor "${samplePath}" was found in ${configDir}.`
  );
}

const authConfig = readAuthConfig(paths.authJson());
export const baseConfig: BotConfig = parseConfig(rawConfig, authConfig);
let webSettings: Partial<BotConfig> = {};
if (fs.existsSync(webSettingsPath)) {
  let parsedSettings: unknown;
  try {
    parsedSettings = JSON.parse(fs.readFileSync(webSettingsPath, "utf-8"));
  } catch (err) {
    throw new Error(`[Config] Failed to parse "${webSettingsPath}": ${String(err)}`);
  }
  webSettings = parseConfigSettings(parsedSettings, webSettingsPath);
  delete webSettings.HTTP_SERVER_ENABLED;
}
export const config: BotConfig = parseConfig({ ...baseConfig, ...webSettings }, authConfig);
