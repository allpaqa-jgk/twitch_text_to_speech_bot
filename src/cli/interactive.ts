import readline from "readline";
import type { TTSQueue } from "../tts/queue";
import type { TextTransformer } from "../tts/transformers/types";
import type { TTSEngine } from "../tts/engine";
import type { TwitchTTSBot } from "../twitch/client";
import type { HttpServer } from "../server/httpServer";
import { detectLanguage } from "../twitch/languageDetector";
import { printAvailableSpeakers } from "../tts/speakers";
import { enqueueDemo } from "../tts/demo";
import { startTwitchOAuthFlow } from "../twitch/auth";
import { config } from "../config";

export function startInteractiveConsole(
  queue: TTSQueue,
  transformer?: TextTransformer,
  englishEngine?: TTSEngine,
  bot?: TwitchTTSBot | null,
  httpServer?: HttpServer | null
): void {
  // Only start interactive terminal if stdin is a TTY
  if (!process.stdin.isTTY) {
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log("\n======================================================================");
  console.log("🎮 対話型コンソールが有効です (「?」を入力して Enter でヘルプ表示)");
  console.log("======================================================================\n");
  console.log("💡 対話コマンド一覧は「?」または「help」と入力してください。\n");

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const [cmd, ...args] = trimmed.split(/\s+/);
    const lowerCmd = cmd.toLowerCase();

    switch (lowerCmd) {
      case "?":
      case "help":
      case "h":
        printHelp();
        break;

      case "speakers":
      case "voices":
      case "list":
        await printAvailableSpeakers();
        break;

      case "say":
      case "s":
        let textToSay = args.join(" ").trim();
        if (!textToSay) {
          console.log("⚠️ 使用方法: say <喋らせたいテキスト>");
        } else {
          const lang = detectLanguage(textToSay);
          const isForeign = lang !== "jpn";

          if (config.FOREIGN_LANGUAGE_MODE === "IGNORE" && isForeign) {
            console.log(`ℹ️ [Say] FOREIGN_LANGUAGE_MODE=IGNORE のためスキップされました`);
            break;
          }

          if (config.FOREIGN_LANGUAGE_MODE === "KATAKANA" && transformer) {
            textToSay = await transformer.transform(textToSay);
          }

          let engineToUse: TTSEngine | undefined;
          if (
            config.FOREIGN_LANGUAGE_MODE === "NATIVE" &&
            lang === "eng" &&
            englishEngine
          ) {
            engineToUse = englishEngine;
          }

          console.log(`🗣️ テスト発声中: "${textToSay}"`);
          queue.enqueue(textToSay, engineToUse);
        }
        break;

      case "demo":
      case "languages":
      case "lang":
        await enqueueDemo(queue, transformer);
        break;

      case "clear":
        queue.clear();
        console.log("🧹 再生待ちの音声をすべてキャンセルしました。");
        break;

      case "twitch":
      case "auth":
      case "t":
        const sub = args[0]?.toLowerCase();
        if (sub === "off") {
          if (bot) {
            await bot.disconnect();
          }
          console.log("* [TwitchBot] Twitch から一時的に切断しました。");
          console.log("💡 次回起動時にも反映させるには、config/default.js の ENABLE_TWITCH を false に変更してください。");
        } else if (sub === "on") {
          if (!config.TW_OAUTH_TOKEN || !config.TW_CHANNEL_NAME) {
            console.log("ブラウザを開いて Twitch 認証を行います...\n");
            try {
              const authResult = await startTwitchOAuthFlow();
              config.TW_OAUTH_TOKEN = authResult.token;
              config.TW_CHANNEL_NAME = authResult.login;
              config.BOT_USERNAME = authResult.login;
            } catch (err) {
              console.error("Twitch 認証に失敗しました:", err);
              break;
            }
          }
          console.log("* [TwitchBot] Twitch に接続中...");
          if (bot) {
            await bot.connect();
          }
        } else {
          // No argument (or "auth"): toggle or show status / trigger OAuth if unauthenticated
          if (!config.TW_OAUTH_TOKEN || !config.TW_CHANNEL_NAME || lowerCmd === "auth") {
            console.log("ブラウザを開いて Twitch 認証を行います...\n");
            try {
              const authResult = await startTwitchOAuthFlow();
              config.TW_OAUTH_TOKEN = authResult.token;
              config.TW_CHANNEL_NAME = authResult.login;
              config.BOT_USERNAME = authResult.login;
              if (bot) {
                await bot.connect();
              }
            } catch (err) {
              console.error("Twitch 認証に失敗しました:", err);
            }
          } else if (bot && bot.isConnected()) {
            await bot.disconnect();
            console.log("* [TwitchBot] Twitch から一時的に切断しました。");
            console.log("💡 次回起動時にも反映させるには、config/default.js の ENABLE_TWITCH を false に変更してください。");
          } else {
            console.log("* [TwitchBot] Twitch に接続中...");
            if (bot) {
              await bot.connect();
            }
          }
        }
        break;

      case "status":
        console.log("\n-------------------------------------------------------");
        let twitchStatus = "Disconnected";
        if (!config.TW_OAUTH_TOKEN || !config.TW_CHANNEL_NAME) {
          twitchStatus = "Unauthenticated";
        } else if (bot && bot.isConnected()) {
          twitchStatus = `Connected (#${config.TW_CHANNEL_NAME})`;
        } else {
          twitchStatus = "Disconnected";
        }
        console.log(`📡 Twitch 接続状況    : ${twitchStatus}`);

        if (httpServer && httpServer.isRunning()) {
          const bouyomiMsg = httpServer.isBouyomiRunning()
            ? `有効 (Port ${httpServer.getBouyomiPort()})`
            : "停止中/競合";
          console.log(`🌐 HTTP 読み上げ      : 有効 (Port ${httpServer.getMainPort()})`);
          console.log(`📻 棒読みちゃん互換   : ${bouyomiMsg}`);
        } else {
          console.log(`🌐 HTTP 読み上げ      : 無効`);
        }

        console.log(`🗣️ 使用音声エンジン   : ${config.TTS_ENGINE}`);
        console.log(`⏳ 再生待ちのコメント : ${queue.pendingCount} 件`);
        console.log("-------------------------------------------------------\n");
        break;

      case "q":
      case "quit":
      case "exit":
        console.log("👋 ボットを終了します。");
        rl.close();
        process.exit(0);
        break;

      default:
        console.log(`❓ 不明なコマンド: "${trimmed}" (「?」でコマンド一覧を表示)`);
        break;
    }
  });

  rl.on("close", () => {
    // Process terminated
  });
}

function printHelp(): void {
  console.log("\n======================================================================");
  console.log("📖 【対話型コンソール コマンド一覧】");
  console.log("======================================================================");
  console.log("  ? / help            : このヘルプを表示します");
  console.log("  speakers / list     : インストール済みボイス・スタイルID一覧を表示します");
  console.log("  say / s <テキスト>  : 入力したテキストをテスト発声します");
  console.log("  demo / lang         : 主要言語（日・英・中・韓・露・西等）の読み上げデモを実行します");
  console.log("  clear               : 再生中の音声を即時停止し、待ちキューもすべてキャンセルします");
  console.log("  twitch [on/off]     : Twitch IRC の接続/切断 (わんコメ統合時はoff推奨)");
  console.log("  status              : 接続中のチャンネルやキューの待ち件数を表示します");
  console.log("  q / exit            : ボットを終了します");
  console.log("======================================================================\n");
}
