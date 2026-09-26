import tmi from "tmi.js";
import { config } from "../config";
import { escapeMassMention } from "./messageProcessor";
import {
  handleRememberCommand,
  handleForgetCommand,
} from "./commands/remember";
import { sendToDiscord } from "../discord/webhook";
import { processComment } from "../tts/commentProcessor";
import type { TTSQueue } from "../tts/queue";
import type { TTSEngine } from "../tts/engine";
import type { TextTransformer } from "../tts/transformers/types";

export class TwitchTTSBot {
  private client: tmi.Client | null = null;
  private ttsQueue: TTSQueue;
  private englishEngine?: TTSEngine;
  private transformer?: TextTransformer;
  private isManuallyDisconnected = false;
  private reconnectTimer: any = null;

  constructor(
    ttsQueue: TTSQueue,
    englishEngine?: TTSEngine,
    transformer?: TextTransformer
  ) {
    this.ttsQueue = ttsQueue;
    this.englishEngine = englishEngine;
    this.transformer = transformer;
  }

  public setTransformer(transformer?: TextTransformer) {
    this.transformer = transformer;
  }

  public setEnglishEngine(engine?: TTSEngine) {
    this.englishEngine = engine;
  }

  public isConnected(): boolean {
    return (
      !this.isManuallyDisconnected &&
      this.client !== null &&
      this.client.readyState() === "OPEN"
    );
  }

  public async disconnect(): Promise<void> {
    this.isManuallyDisconnected = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // Ignore error if already disconnected
      }
    }
  }

  public async connect(): Promise<void> {
    this.isManuallyDisconnected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.client) {
      await this.start();
      return;
    }
    await this.client.connect();
  }

  public async start(): Promise<void> {
    if (!config.TW_OAUTH_TOKEN || !config.TW_CHANNEL_NAME) {
      console.warn(
        "[TwitchBot] TW_OAUTH_TOKEN or TW_CHANNEL_NAME is missing in config. TTS bot will not connect to Twitch."
      );
      return;
    }

    const opts: tmi.Options = {
      identity: {
        username: config.BOT_USERNAME,
        password: config.TW_OAUTH_TOKEN,
      },
      channels: [config.TW_CHANNEL_NAME],
    };

    this.client = new tmi.Client(opts);

    this.client.on("message", (target, context, msg, self) => {
      this.handleIncomingMessage(target, context, msg, self);
    });

    this.client.on("connected", (addr, port) => {
      console.log(`* [TwitchBot] Connected to ${addr}:${port} on #${config.TW_CHANNEL_NAME}`);
    });

    this.client.on("disconnected", (reason) => {
      if (this.isManuallyDisconnected) {
        return;
      }
      if (String(reason).toLowerCase().includes("authentication failed")) {
        console.error("\n❌ [TwitchBot] 認証エラーにより切断されました。");
        console.error("💡 config/auth.json を削除してアプリを再起動し、再連携してください。\n");
        return;
      }
      console.warn(`* [TwitchBot] Disconnected: ${reason}. Reconnecting in 5s...`);
      this.reconnectTimer = setTimeout(() => {
        if (!this.isManuallyDisconnected) {
          this.client?.connect().catch((err) => console.error("[TwitchBot] Reconnect error:", err));
        }
      }, 5000);
    });

    await this.client.connect();
  }

  public async handleIncomingMessage(
    target: string,
    context: tmi.ChatUserstate,
    rawMsg: string,
    self: boolean = false
  ): Promise<void> {
    if (self) return;

    const trimmedMsg = rawMsg.trim();
    if (!trimmedMsg) return;

    if (config.COMMENT_REMEMVER_AVAILABLE) {
      if (
        trimmedMsg.startsWith(`!${config.COMMENT_REMEMVER_COMMAND}`) ||
        trimmedMsg.startsWith(`!${config.COMMENT_REMEMVER_COMMAND}U`)
      ) {
        const res = handleRememberCommand(trimmedMsg);
        this.client?.say(target, res.replyMessage);
        return;
      }

      if (
        trimmedMsg.startsWith(`!${config.COMMENT_FORGET_COMMAND}`) ||
        trimmedMsg.startsWith(`!${config.COMMENT_FORGET_COMMAND}U`)
      ) {
        const res = handleForgetCommand(trimmedMsg);
        this.client?.say(target, res.replyMessage);
        return;
      }
    }

    if (trimmedMsg.startsWith("!") || trimmedMsg.startsWith("/")) {
      // Ignore unknown commands
      return;
    }

    const rawUsername = context.username || context["display-name"] || "anonymous";

    const result = await processComment(
      { rawUsername, rawText: rawMsg, service: "Twitch" },
      {
        ttsQueue: this.ttsQueue,
        transformer: this.transformer,
        englishEngine: this.englishEngine,
      }
    );

    if (result.ignored) {
      return;
    }

    console.log(`${result.displayName}: ${rawMsg}`);

    // Discord message
    const discordContent = config.READ_USERNAME
      ? `\`${result.displayName}\`: ${escapeMassMention(rawMsg)}`
      : escapeMassMention(rawMsg);
    sendToDiscord(discordContent);
  }
}
