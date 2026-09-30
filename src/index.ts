import { config } from "./config";
import { TTSQueue } from "./tts/queue";
import type { TTSEngine } from "./tts/engine";
import { createEnglishEngine, resolvePrimaryEngine } from "./tts/engineFactory";
import { KatakanaTransformer } from "./tts/transformers/katakana";
import { TwitchTTSBot } from "./twitch/client";
import { startTwitchOAuthFlow } from "./twitch/auth";
import { printAvailableSpeakers } from "./tts/speakers";
import { startInteractiveConsole } from "./cli/interactive";
import { runDemoCli } from "./tts/demo";
import { HttpServer } from "./server/httpServer";
import { DictionaryService } from "./application/dictionaryService";
import { CsvDictionaryRepository } from "./storage/csvDictionaryRepository";
import { TwitchControlService } from "./application/twitchControlService";
import { SpeechInteractionService } from "./application/speechInteractionService";
import { RestartService } from "./application/restartService";
import pkg from "../package.json";

const BOT_VERSION = pkg.version || "2.0.1";

// CLI speakers command: ./twitch-tts-bot speakers or --speakers
if (process.argv.includes("speakers") || process.argv.includes("--speakers") || process.argv.includes("voices")) {
  await printAvailableSpeakers();
  process.exit(0);
}

// CLI auth command: ./twitch-tts-bot auth or bun run index.ts auth
if (process.argv.includes("auth") || process.argv.includes("--auth")) {
  console.log("////////////////////////////////////////");
  console.log(`//   Twitch Bot Auth (v${BOT_VERSION})`.padEnd(38, " ") + "//");
  console.log("////////////////////////////////////////");
  try {
    await startTwitchOAuthFlow();
    console.log("認証が完了しました。ボットを通常起動してください。");
    process.exit(0);
  } catch (err) {
    console.error("認証に失敗しました:", err);
    process.exit(1);
  }
}

console.log("////////////////////////////////////////");
console.log(`//   Twitch Text to Speech Bot v${BOT_VERSION}`.padEnd(38, " ") + "//");
console.log("////////////////////////////////////////");

// 1. Select the primary Japanese engine with automatic fallback.
const primaryEngine = await resolvePrimaryEngine(config);

// CLI demo command: ./twitch-tts-bot demo or bun run index.ts demo
if (
  process.argv.includes("demo") ||
  process.argv.includes("--demo") ||
  process.argv.includes("languages")
) {
  const transformer = new KatakanaTransformer();
  await runDemoCli(primaryEngine, transformer);
  process.exit(0);
}
let englishEngine: TTSEngine | undefined;

if (config.FOREIGN_LANGUAGE_MODE === "NATIVE" || config.BILINGAL_MODE) {
  englishEngine = createEnglishEngine(config);
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

// 6. Twitch handling
const bot = new TwitchTTSBot(queue, englishEngine, katakanaTransformer);
const dictionaryService = new DictionaryService(new CsvDictionaryRepository());
const twitchControlService = new TwitchControlService(bot);
const speechInteractionService = new SpeechInteractionService(queue, katakanaTransformer);
// 再起動は Web 管理コンソールからのみ実行可能（誤操作防止のため対話型コンソールには実装しない）
const restartService = new RestartService();

// 7. Start HTTP Server (for Web Management Console, OneComme, CastCraft, Webhooks)
let httpServer: HttpServer | null = null;
if (config.HTTP_SERVER_ENABLED) {
  httpServer = new HttpServer({
    queue,
    transformer: katakanaTransformer,
    englishEngine,
    dictionaryService,
    twitchControlService,
    speechInteractionService,
    restartService,
  });
  httpServer.start();
}

if (!config.ENABLE_TWITCH) {
  console.log("ℹ️  [Twitch] ENABLE_TWITCH=false のため直接接続をスキップしました（HTTP読み上げモードで待機中）");
} else {
  const hasAuth = !!(config.TW_OAUTH_TOKEN && config.TW_CHANNEL_NAME);
  if (hasAuth) {
    bot.start().catch((err) => {
      const errMsg = String(err?.message || err);
      if (
        errMsg.toLowerCase().includes("authentication failed") ||
        errMsg.toLowerCase().includes("auth")
      ) {
        console.error("\n❌ [TwitchBot] Twitch へのログイン認証に失敗しました。");
        console.error(
          "   トークンが期限切れ、またはTwitchのパスワードが変更された可能性があります。"
        );
        console.error("💡 【対処法】");
        console.error(
          "   フォルダ内の config/auth.json を削除してアプリを再起動してください。"
        );
        console.error("   自動でブラウザが開き、新しく連携画面が表示されます。\n");
      } else {
        console.error("[Fatal] Failed to start Twitch Bot:", err);
      }
    });
  } else {
    console.log("ℹ️  [Twitch] 未連携です（YouTube / わんコメ等のHTTP読み上げモードで待機中）");
    console.log("💡 Twitchとも連携したい場合は、対話コンソールで「twitch」または「auth」と入力してください。\n");
  }
}

// 8. Start interactive console for terminal commands (?, speakers, say, clear, twitch, status, q)
startInteractiveConsole(queue, katakanaTransformer, englishEngine, bot, httpServer);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[Shutdown] Stopping bot...");
  if (httpServer) {
    httpServer.stop();
  }
  if (bot) {
    await bot.disconnect();
  }
  queue.clear();
  process.exit(0);
});