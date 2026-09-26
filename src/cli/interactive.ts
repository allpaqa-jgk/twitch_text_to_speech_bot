import readline from "readline";
import type { TTSQueue } from "../tts/queue";
import type { TextTransformer } from "../tts/transformers/types";
import type { TTSEngine } from "../tts/engine";
import { detectLanguage } from "../twitch/languageDetector";
import { printAvailableSpeakers } from "../tts/speakers";
import { enqueueDemo } from "../tts/demo";
import { config } from "../config";

export function startInteractiveConsole(
  queue: TTSQueue,
  transformer?: TextTransformer,
  englishEngine?: TTSEngine
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

      case "status":
        console.log("\n-------------------------------------------------------");
        console.log(`📡 Twitch チャンネル : #${config.TW_CHANNEL_NAME}`);
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
  console.log("  ? / help        : このヘルプを表示します");
  console.log("  speakers / list : インストール済みボイス・スタイルID一覧を表示します");
  console.log("  say / s <テキスト> : 入力したテキストをテスト発声します");
  console.log("  demo / lang     : 主要言語（日・英・中・韓・露・西等）の読み上げデモを実行します");
  console.log("  clear           : 再生中の音声を即時停止し、待ちキューもすべてキャンセルします");
  console.log("  status          : 接続中のチャンネルやキューの待ち件数を表示します");
  console.log("  q / exit        : ボットを終了します");
  console.log("======================================================================\n");
}
