import { config } from "./config";
import { TTSQueue } from "./tts/queue";
import { CoeiroinkEngine } from "./tts/engines/coeiroink";
import { VoicevoxEngine } from "./tts/engines/voicevox";
import { MacSayEngine } from "./tts/engines/macSay";
import { PiperEngine } from "./tts/engines/piper";
import { KokoroEngine } from "./tts/engines/kokoro";
import type { TTSEngine } from "./tts/engine";
import { KatakanaTransformer } from "./tts/transformers/katakana";
import { TwitchTTSBot } from "./twitch/client";

console.log("////////////////////////////////////////");
console.log("//   Twitch Text to Speech Bot (v2)   //");
console.log("////////////////////////////////////////");

// 1. Select primary Japanese TTS Engine
let primaryEngine: TTSEngine;

switch (config.TTS_ENGINE) {
  case "COEIROINK":
    console.log(`[Init] Using COEIROINK engine (Style ID: ${config.COEIROINK_STYLE_ID})`);
    primaryEngine = new CoeiroinkEngine();
    break;
  case "VOICEVOX":
    console.log(`[Init] Using VOICEVOX engine (Speaker ID: ${config.VOICEVOX_SPEAKER_ID})`);
    primaryEngine = new VoicevoxEngine();
    break;
  case "PIPER":
    console.log(`[Init] Using Piper TTS engine`);
    primaryEngine = new PiperEngine();
    break;
  case "KOKORO":
    console.log(`[Init] Using Kokoro TTS engine (Voice: ${config.KOKORO_VOICE})`);
    primaryEngine = new KokoroEngine(config.KOKORO_VOICE, config.KOKORO_SPEED, "j");
    break;
  case "Mac":
    console.log(`[Init] Using macOS say engine (${config.SPEAKER_JAPANESE})`);
    primaryEngine = new MacSayEngine();
    break;
  default:
    console.log(`[Init] Fallback to COEIROINK engine`);
    primaryEngine = new CoeiroinkEngine();
    break;
}

// 2. Optional English engine (for NATIVE mode or BILINGAL_MODE)
let englishEngine: TTSEngine | undefined;

if (config.FOREIGN_LANGUAGE_MODE === "NATIVE" || config.BILINGAL_MODE) {
  switch (config.ENGLISH_TTS_ENGINE) {
    case "KOKORO":
      console.log(`[Init] Using Kokoro engine for English (Voice: ${config.KOKORO_ENGLISH_VOICE})`);
      englishEngine = new KokoroEngine(
        config.KOKORO_ENGLISH_VOICE,
        config.KOKORO_SPEED ?? 1.0,
        "a"
      );
      break;
    case "PIPER":
      console.log(`[Init] Using Piper engine for English`);
      englishEngine = config.PIPER_MODEL_PATH
        ? new PiperEngine(config.PIPER_MODEL_PATH)
        : new PiperEngine();
      break;
    case "Mac":
      if (process.platform === "darwin") {
        console.log(`[Init] Using macOS say engine for English (${config.SPEAKER_ENGLISH})`);
        englishEngine = new MacSayEngine(config.SPEAKER_ENGLISH, config.RATE_ENGLISH);
      }
      break;
    default:
      console.log(`[Init] Fallback to Kokoro engine for English (Voice: ${config.KOKORO_ENGLISH_VOICE})`);
      englishEngine = new KokoroEngine(config.KOKORO_ENGLISH_VOICE, 1.0, "a");
      break;
  }
}

// 3. Initialize sequential TTS Queue
const queue = new TTSQueue(primaryEngine);

// 4. Play starting message
if (config.STARTING_MESSAGE) {
  console.log(`[Init] Starting message: "${config.STARTING_MESSAGE}"`);
  queue.enqueue(config.STARTING_MESSAGE);
}

// 5. Initialize text transformer for foreign languages
const katakanaTransformer = new KatakanaTransformer();
console.log(`[Init] Foreign language mode: ${config.FOREIGN_LANGUAGE_MODE}`);

// 6. Start Twitch Bot
const bot = new TwitchTTSBot(queue, englishEngine, katakanaTransformer);

bot.start().catch((err) => {
  console.error("[Fatal] Failed to start Twitch Bot:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Shutdown] Stopping bot...");
  queue.clear();
  process.exit(0);
});