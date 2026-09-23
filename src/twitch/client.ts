import tmi from "tmi.js";
import { config } from "../config";
import { csvList } from "../storage/csvList";
import {
  formatUsername,
  formatMessage,
  isIgnoredMessage,
  escapeMassMention,
  escapeTtsErrorString,
  isEnglishString,
} from "./messageProcessor";
import { detectLanguage } from "./languageDetector";
import { rollDice } from "./commands/dice";
import {
  handleRememberCommand,
  handleForgetCommand,
} from "./commands/remember";
import { sendToDiscord } from "../discord/webhook";
import type { TTSQueue } from "../tts/queue";
import type { TTSEngine } from "../tts/engine";
import type { TextTransformer } from "../tts/transformers/types";

export class TwitchTTSBot {
  private client: tmi.Client | null = null;
  private ttsQueue: TTSQueue;
  private englishEngine?: TTSEngine;
  private transformer?: TextTransformer;

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
      console.warn(`* [TwitchBot] Disconnected: ${reason}. Reconnecting in 5s...`);
      setTimeout(() => {
        this.client?.connect().catch((err) => console.error("[TwitchBot] Reconnect error:", err));
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

    // Handle Commands
    if (trimmedMsg.startsWith("!dice")) {
      const diceResult = rollDice(trimmedMsg);
      this.client?.say(target, diceResult);
      return;
    }

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

    // Read Lists for Conversion
    const usernameList = csvList.readList("usernameConvertList");
    const messageList = csvList.readList("messageConvertList");
    const ignoreList = csvList.readList("messageIgnoreList");

    const rawUsername = context.username || context["display-name"] || "anonymous";
    const displayName = formatUsername(rawUsername, usernameList, config.USE_SIMPLE_NAME);

    // Check Ignore
    if (isIgnoredMessage(rawMsg, ignoreList)) {
      return;
    }

    const modifiedContent = formatMessage(rawMsg, messageList);
    console.log(`${displayName}: ${rawMsg}`);

    // Discord message
    const discordContent = config.READ_USERNAME
      ? `\`${displayName}\`: ${escapeMassMention(rawMsg)}`
      : escapeMassMention(rawMsg);
    sendToDiscord(discordContent);

    // TTS message
    if (!config.ENABLE_TTS) {
      return;
    }

    const sanitizedSegment = escapeTtsErrorString(modifiedContent);
    let speechText = config.READ_USERNAME
      ? `${displayName}: ${sanitizedSegment}`
      : sanitizedSegment;

    const lang = detectLanguage(sanitizedSegment);
    const isForeign = lang !== "jpn";

    // If IGNORE mode is enabled, skip reading foreign comments entirely
    if (config.FOREIGN_LANGUAGE_MODE === "IGNORE" && isForeign) {
      return;
    }

    // Apply Katakana transformation if configured for foreign comments
    if (config.FOREIGN_LANGUAGE_MODE === "KATAKANA" && isForeign && this.transformer) {
      speechText = await this.transformer.transform(speechText);
    }

    // Determine engine (Native English vs Default Japanese)
    let engineToUse: TTSEngine | undefined;
    if (
      config.FOREIGN_LANGUAGE_MODE === "NATIVE" &&
      lang === "eng" &&
      this.englishEngine
    ) {
      engineToUse = this.englishEngine;
    }

    // Enqueue speech (non-blocking, strictly sequential!)
    this.ttsQueue.enqueue(speechText, engineToUse);
  }
}
