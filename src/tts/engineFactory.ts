import type { BotConfig } from "../config";
import { CoeiroinkEngine } from "./engines/coeiroink";
import { KokoroEngine } from "./engines/kokoro";
import { MacSayEngine } from "./engines/macSay";
import { PiperEngine } from "./engines/piper";
import { VoicevoxEngine } from "./engines/voicevox";
import type { TTSEngine } from "./engine";

export type EngineName = BotConfig["TTS_ENGINE"];
export type EnglishEngineName = BotConfig["ENGLISH_TTS_ENGINE"];
export type EngineCreator = (name: EngineName, config: BotConfig) => TTSEngine;

export function createEngine(name: EngineName, config: BotConfig): TTSEngine {
  switch (name) {
    case "COEIROINK":
      return new CoeiroinkEngine({
        host: config.COEIROINK_HOST,
        port: config.COEIROINK_PORT,
        styleId: config.COEIROINK_STYLE_ID,
        speakerUuid: config.COEIROINK_SPEAKER_UUID,
        speedScale: config.COEIROINK_SPEED_SCALE,
        volumeScale: config.COEIROINK_VOLUME_SCALE,
        masterVolume: config.MASTER_VOLUME,
        outputSamplingRate: config.COEIROINK_OUTPUT_SAMPLING_RATE,
        pauseLength: config.COEIROINK_PAUSE_LENGTH ?? undefined,
      });
    case "VOICEVOX":
      return new VoicevoxEngine({
        host: config.VOICEVOX_HOST,
        port: config.VOICEVOX_PORT,
        speakerId: config.VOICEVOX_SPEAKER_ID,
        speedScale: config.VOICEVOX_SPEED_SCALE,
        volumeScale: config.VOICEVOX_VOLUME_SCALE,
        masterVolume: config.MASTER_VOLUME,
        outputSamplingRate: config.VOICEVOX_OUTPUT_SAMPLING_RATE,
      });
    case "PIPER":
      return new PiperEngine({
        modelPath: config.PIPER_MODEL_PATH || undefined,
        masterVolume: config.MASTER_VOLUME,
      });
    case "KOKORO":
      return new KokoroEngine(
        config.KOKORO_VOICE,
        config.KOKORO_SPEED,
        "j",
        undefined,
        undefined,
        config.MASTER_VOLUME
      );
    case "Mac":
      return new MacSayEngine(config.SPEAKER_JAPANESE, config.RATE_JAPANESE);
  }
}

export function getFallbackOrder(platform: string): EngineName[] {
  const names: EngineName[] = ["COEIROINK", "VOICEVOX", "PIPER", "KOKORO"];
  if (platform === "darwin") names.push("Mac");
  return names;
}

export async function resolvePrimaryEngine(
  config: BotConfig,
  platform = process.platform,
  creator: EngineCreator = createEngine
): Promise<{ engine: TTSEngine; name: EngineName }> {
  const preferredName = config.TTS_ENGINE;
  const preferredEngine = creator(preferredName, config);
  if (await preferredEngine.isAvailable()) {
    console.log(`[Init] Using ${preferredEngine.name} engine`);
    if (preferredName === "COEIROINK" || preferredName === "VOICEVOX") {
      console.log("       💡 キャラクター・スタイルIDの確認: ./twitch-tts-bot speakers");
    }
    return { engine: preferredEngine, name: preferredName };
  }

  console.warn(
    `\n⚠️  [Init] 設定された音声エンジン "${preferredName}" (${preferredEngine.name}) に接続できませんでした。`
  );
  console.log("[Init] 他の利用可能な音声エンジンを自動探索中...");

  for (const name of getFallbackOrder(platform)) {
    if (name === preferredName) continue;
    const candidate = creator(name, config);
    if (await candidate.isAvailable()) {
      console.log(`\n🎉 [Init] ${candidate.name} の起動を検出しました！`);
      console.log(`   👉 ${candidate.name} に自動フォールバックして起動します。`);
      if (name === "COEIROINK" || name === "VOICEVOX") {
        console.log("   💡 キャラクター・スタイルIDの確認: ./twitch-tts-bot speakers\n");
      }
      return { engine: candidate, name };
    }
  }

  console.warn("⚠️  [Init] 接続可能な音声エンジンが見つかりませんでした。");
  console.warn(`   デフォルト設定 (${preferredEngine.name}) のまま待機します。`);
  console.warn("   COEIROINK または VOICEVOX を起動してください。\n");
  return { engine: preferredEngine, name: preferredName };
}

export function createEnglishEngine(
  config: BotConfig,
  platform = process.platform
): TTSEngine | undefined {
  switch (config.ENGLISH_TTS_ENGINE) {
    case "KOKORO":
      console.log(`[Init] Using Kokoro engine for English (Voice: ${config.KOKORO_ENGLISH_VOICE})`);
      return new KokoroEngine(
        config.KOKORO_ENGLISH_VOICE,
        config.KOKORO_SPEED,
        "a",
        undefined,
        undefined,
        config.MASTER_VOLUME
      );
    case "PIPER":
      console.log("[Init] Using Piper engine for English");
      return new PiperEngine({
        modelPath: config.PIPER_MODEL_PATH || undefined,
        masterVolume: config.MASTER_VOLUME,
      });
    case "Mac":
      if (platform !== "darwin") return undefined;
      console.log(`[Init] Using macOS say engine for English (${config.SPEAKER_ENGLISH})`);
      return new MacSayEngine(config.SPEAKER_ENGLISH, config.RATE_ENGLISH);
  }
}
