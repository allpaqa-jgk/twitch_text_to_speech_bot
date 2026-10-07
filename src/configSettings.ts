import type { BotConfig } from "./config";

export interface ConfigSettingDefinition {
  key: keyof BotConfig;
  label: string;
  group: string;
  type: "text" | "number" | "boolean" | "select";
  options?: readonly string[];
  min?: number;
  max?: number;
  step?: number;
  nullable?: boolean;
}

export const CONFIG_SETTINGS: readonly ConfigSettingDefinition[] = [
  { key: "TTS_ENGINE", label: "音声エンジン", group: "音声エンジン", type: "select", options: ["COEIROINK", "VOICEVOX", "PIPER", "KOKORO", "Mac"] },
  { key: "ENGLISH_TTS_ENGINE", label: "英語音声エンジン", group: "音声エンジン", type: "select", options: ["KOKORO", "PIPER", "Mac"] },
  { key: "FOREIGN_LANGUAGE_MODE", label: "外国語コメントの処理", group: "音声エンジン", type: "select", options: ["KATAKANA", "NATIVE", "IGNORE"] },
  { key: "KOKORO_ENGLISH_VOICE", label: "Kokoro 英語ボイス", group: "音声エンジン", type: "text" },
  { key: "PIPER_MODEL_PATH", label: "Piper モデルパス", group: "音声エンジン", type: "text" },
  { key: "KOKORO_VOICE", label: "Kokoro ボイス", group: "音声エンジン", type: "text" },
  { key: "KOKORO_SPEED", label: "Kokoro 話速", group: "音声エンジン", type: "number", min: 0.5, max: 2, step: 0.05 },
  { key: "COEIROINK_HOST", label: "COEIROINK ホスト", group: "COEIROINK", type: "text" },
  { key: "COEIROINK_PORT", label: "COEIROINK ポート", group: "COEIROINK", type: "number", min: 1, max: 65535, step: 1 },
  { key: "COEIROINK_STYLE_ID", label: "COEIROINK スタイル ID", group: "COEIROINK", type: "number", min: 0, max: Number.MAX_SAFE_INTEGER, step: 1 },
  { key: "COEIROINK_SPEAKER_UUID", label: "COEIROINK 話者 UUID", group: "COEIROINK", type: "text" },
  { key: "COEIROINK_SPEED_SCALE", label: "COEIROINK 話速", group: "COEIROINK", type: "number", min: 0.5, max: 2, step: 0.05 },
  { key: "COEIROINK_VOLUME_SCALE", label: "COEIROINK 音量", group: "COEIROINK", type: "number", min: 0, max: 5, step: 0.1 },
  { key: "COEIROINK_OUTPUT_SAMPLING_RATE", label: "COEIROINK サンプリングレート", group: "COEIROINK", type: "number", min: 8000, max: 192000, step: 1 },
  { key: "COEIROINK_PAUSE_LENGTH", label: "COEIROINK ポーズ秒数", group: "COEIROINK", type: "number", min: 0, max: 10, step: 0.01, nullable: true },
  { key: "VOICEVOX_HOST", label: "VOICEVOX ホスト", group: "VOICEVOX", type: "text" },
  { key: "VOICEVOX_PORT", label: "VOICEVOX ポート", group: "VOICEVOX", type: "number", min: 1, max: 65535, step: 1 },
  { key: "VOICEVOX_SPEAKER_ID", label: "VOICEVOX 話者 ID", group: "VOICEVOX", type: "number", min: 0, max: Number.MAX_SAFE_INTEGER, step: 1 },
  { key: "VOICEVOX_SPEED_SCALE", label: "VOICEVOX 話速", group: "VOICEVOX", type: "number", min: 0.5, max: 2, step: 0.05 },
  { key: "VOICEVOX_VOLUME_SCALE", label: "VOICEVOX 音量", group: "VOICEVOX", type: "number", min: 0, max: 5, step: 0.1 },
  { key: "VOICEVOX_OUTPUT_SAMPLING_RATE", label: "VOICEVOX サンプリングレート", group: "VOICEVOX", type: "number", min: 8000, max: 192000, step: 1 },
  { key: "SPEAKER_ENGLISH", label: "macOS 英語ボイス", group: "macOS 音声", type: "text" },
  { key: "SPEAKER_JAPANESE", label: "macOS 日本語ボイス", group: "macOS 音声", type: "text" },
  { key: "RATE_ENGLISH", label: "macOS 英語話速", group: "macOS 音声", type: "number", min: 100, max: 350, step: 1 },
  { key: "RATE_JAPANESE", label: "macOS 日本語話速", group: "macOS 音声", type: "number", min: 100, max: 350, step: 1 },
  { key: "ENABLE_TTS", label: "音声読み上げを有効化", group: "読み上げ", type: "boolean" },
  { key: "READ_USERNAME", label: "ユーザー名を読む", group: "読み上げ", type: "boolean" },
  { key: "USE_SIMPLE_NAME", label: "簡易ユーザー名を使う", group: "読み上げ", type: "boolean" },
  { key: "STARTING_MESSAGE", label: "起動時メッセージ", group: "読み上げ", type: "text" },
  { key: "MASTER_VOLUME", label: "マスター音量", group: "読み上げ", type: "number", min: 0, max: 5, step: 0.1 },
  { key: "BILINGAL_MODE", label: "バイリンガル読み上げ", group: "読み上げ", type: "boolean" },
  { key: "AUTO_ACCELERATE", label: "コメント量に応じて話速を上げる", group: "読み上げ", type: "boolean" },
  { key: "MAX_ACCELERATION_SPEED", label: "最大加速倍率", group: "読み上げ", type: "number", min: 1, max: 2, step: 0.05 },
  { key: "COMMENT_TTL_SECONDS", label: "コメント有効期限（秒、0で無効）", group: "読み上げ", type: "number", min: 0, max: 86400, step: 1 },
  { key: "COMMENT_REMEMVER_AVAILABLE", label: "辞書学習コマンドを有効化", group: "読み上げ", type: "boolean" },
  { key: "COMMENT_REMEMVER_COMMAND", label: "辞書登録コマンド", group: "読み上げ", type: "text" },
  { key: "COMMENT_FORGET_COMMAND", label: "辞書削除コマンド", group: "読み上げ", type: "text" },
  { key: "ENABLE_TWITCH", label: "Twitch 接続を有効化", group: "Twitch", type: "boolean" },
  { key: "TW_CHANNEL_NAME", label: "読み上げ対象チャンネル", group: "Twitch", type: "text" },
  { key: "BOT_USERNAME", label: "Bot ユーザー名", group: "Twitch", type: "text" },
  { key: "HTTP_TALK_ENABLED", label: "HTTP 読み上げ受付を有効化（/say・多言語デモ）", group: "HTTP / 外部連携", type: "boolean" },
  { key: "HTTP_SERVER_PORT", label: "HTTP サーバーポート", group: "HTTP / 外部連携", type: "number", min: 1, max: 65535, step: 1 },
  { key: "BOUYOMI_COMPAT_ENABLED", label: "棒読みちゃん互換を有効化", group: "HTTP / 外部連携", type: "boolean" },
  { key: "BOUYOMI_COMPAT_PORT", label: "棒読みちゃん互換ポート", group: "HTTP / 外部連携", type: "number", min: 1, max: 65535, step: 1 },
  { key: "DISCORD_TRANSFER_ENABLED", label: "Discord 転送を有効化", group: "HTTP / 外部連携", type: "boolean" },
] as const;

const CONFIG_SETTING_KEYS = new Set<string>(CONFIG_SETTINGS.map(({ key }) => key));
const LEGACY_CONFIG_SETTING_KEYS = new Set(["HTTP_SERVER_ENABLED"]);

export function parseConfigSettings(value: unknown, source: string): Partial<BotConfig> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[Config] ${source} must contain a settings object.`);
  }
  const settings = value as Record<string, unknown>;
  const unknownKey = Object.keys(settings).find(
    (key) => !CONFIG_SETTING_KEYS.has(key) && !LEGACY_CONFIG_SETTING_KEYS.has(key)
  );
  if (unknownKey) {
    throw new Error(`[Config] ${source} contains unsupported setting "${unknownKey}".`);
  }
  return settings as Partial<BotConfig>;
}
