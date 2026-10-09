import readline from "readline";
import type { TTSQueue } from "../tts/queue";
import type { TextTransformer } from "../tts/transformers/types";
import type { TwitchTTSBot } from "../twitch/client";
import type { HttpServer } from "../server/httpServer";
import { printAvailableSpeakers } from "../tts/speakers";
import { enqueueDemo } from "../tts/demo";
import { startTwitchOAuthFlow } from "../twitch/auth";
import { openBrowser } from "../utils/browser";
import { settingsStore, type SettingsStore } from "../settingsStore";
import type { EngineHolder } from "../tts/engineHolder";
import { planSpeech } from "../tts/speechPlanner";

export interface InteractiveConsoleContext {
  queue: TTSQueue;
  transformer?: TextTransformer;
  bot?: TwitchTTSBot | null;
  httpServer?: HttpServer | null;
  store?: SettingsStore;
  engineHolder?: EngineHolder;
}

/**
 * 1行分の対話コマンドを解釈・実行する。テストから直接呼び出せるよう
 * startInteractiveConsole から切り出している。
 */
export async function handleInteractiveCommand(
  line: string,
  ctx: InteractiveConsoleContext,
  onExit: () => void = () => process.exit(0)
): Promise<void> {
  const { queue, transformer, bot, httpServer } = ctx;
  const store = ctx.store ?? settingsStore;
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

    case "web":
    case "open":
    case "gui":
    case "w": {
      const port = httpServer ? httpServer.getMainPort() : store.current().HTTP_SERVER_PORT;
      const url = `http://localhost:${port}`;
      console.log(`🌐 ブラウザで Web コンソールを開きます: ${url}`);
      openBrowser(url);
      break;
    }

    case "speakers":
    case "voices":
    case "list":
      await printAvailableSpeakers(store.current());
      break;

    case "say":
    case "s": {
      const textToSay = args.join(" ").trim();
      if (!textToSay) {
        console.log("⚠️ 使用方法: say <喋らせたいテキスト>");
      } else {
        const pin = queue.pin();
        try {
          const planned = await planSpeech(textToSay, pin, { transformer });
          if (planned.ignored) {
            console.log(`ℹ️ [Say] FOREIGN_LANGUAGE_MODE=IGNORE のためスキップされました`);
            break;
          }
          console.log(`🗣️ テスト発声中: "${planned.text}"`);
          queue.enqueue(planned.text, { pin, engine: planned.engine });
        } finally {
          pin.release();
        }
      }
      break;
    }

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
    case "t": {
      const sub = args[0]?.toLowerCase();
      if (sub === "off") {
        if (bot) {
          await bot.disconnect();
        }
        console.log("* [TwitchBot] Twitch から一時的に切断しました。");
        console.log("💡 次回起動時にも反映させるには、config/default.js の ENABLE_TWITCH を false に変更してください。");
      } else if (sub === "on") {
        const current = store.current();
        if (!current.TW_OAUTH_TOKEN || !current.TW_CHANNEL_NAME) {
          console.log("ブラウザを開いて Twitch 認証を行います...\n");
          try {
            const authResult = await startTwitchOAuthFlow();
            store.apply({
              TW_OAUTH_TOKEN: authResult.token,
              TW_CHANNEL_NAME: authResult.login,
              BOT_USERNAME: authResult.login,
            });
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
        const current = store.current();
        if (!current.TW_OAUTH_TOKEN || !current.TW_CHANNEL_NAME || lowerCmd === "auth") {
          console.log("ブラウザを開いて Twitch 認証を行います...\n");
          try {
            const authResult = await startTwitchOAuthFlow();
            store.apply({
              TW_OAUTH_TOKEN: authResult.token,
              TW_CHANNEL_NAME: authResult.login,
              BOT_USERNAME: authResult.login,
            });
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
    }

    case "status": {
      console.log("\n-------------------------------------------------------");
      const current = store.current();
      let twitchStatus = "Disconnected";
      if (!current.TW_OAUTH_TOKEN || !current.TW_CHANNEL_NAME) {
        twitchStatus = "Unauthenticated";
      } else if (bot && bot.isConnected()) {
        twitchStatus = `Connected (#${current.TW_CHANNEL_NAME})`;
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

      const primaryName = ctx.engineHolder
        ? ctx.engineHolder.current().primaryName
        : store.current().TTS_ENGINE;
      console.log(`🗣️ 使用音声エンジン   : ${primaryName}`);
      console.log(`⏳ 再生待ちのコメント : ${queue.pendingCount} 件`);
      console.log("-------------------------------------------------------\n");
      break;
    }

    case "q":
    case "quit":
    case "exit":
      console.log("👋 ボットを終了します。");
      onExit();
      break;

    default:
      console.log(`❓ 不明なコマンド: "${trimmed}" (「?」でコマンド一覧を表示)`);
      break;
  }
}

export function startInteractiveConsole(
  queue: TTSQueue,
  transformer?: TextTransformer,
  bot?: TwitchTTSBot | null,
  httpServer?: HttpServer | null,
  store: SettingsStore = settingsStore,
  engineHolder?: EngineHolder
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
    await handleInteractiveCommand(
      line,
      { queue, transformer, bot, httpServer, store, engineHolder },
      () => {
        rl.close();
        process.exit(0);
      }
    );
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
  console.log("  web / open / gui    : ブラウザで Web 管理コンソールを開きます (http://localhost:3939)");
  console.log("  speakers / list     : インストール済みボイス・スタイルID一覧を表示します");
  console.log("  say / s <テキスト>  : 入力したテキストをテスト発声します");
  console.log("  demo / lang         : 主要言語（日・英・中・韓・露・西等）の読み上げデモを実行します");
  console.log("  clear               : 再生中の音声を即時停止し、待ちキューもすべてキャンセルします");
  console.log("  twitch [on/off]     : Twitch IRC の接続/切断 (わんコメ統合時はoff推奨)");
  console.log("  status              : 接続中のチャンネルやキューの待ち件数を表示します");
  console.log("  ※ アプリの再起動は Web 管理コンソール（🌐 web）からのみ実行できます。");
  console.log("     再起動後、手動でアプリを起動し直すまでこの対話型コンソールは利用できません。");
  console.log("     再起動後にアプリを終了したい場合は、Web 管理コンソールの「⏹ アプリを終了」ボタンをご利用ください。");
  console.log("  q / exit            : ボットを終了します");
  console.log("======================================================================\n");
}
