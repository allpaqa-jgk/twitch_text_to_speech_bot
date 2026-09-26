import { config } from "../config";
import { csvList } from "../storage/csvList";
import {
  formatUsername,
  formatMessage,
  isIgnoredMessage,
  escapeTtsErrorString,
} from "../twitch/messageProcessor";
import { detectLanguage } from "../twitch/languageDetector";
import type { TTSQueue } from "./queue";
import type { TTSEngine } from "./engine";
import type { TextTransformer } from "./transformers/types";

export interface CommentProcessParams {
  rawUsername: string;
  rawText: string;
  service?: string;
}

export interface CommentProcessContext {
  ttsQueue: TTSQueue;
  transformer?: TextTransformer;
  englishEngine?: TTSEngine;
}

export interface CommentProcessResult {
  displayName: string;
  rawText: string;
  modifiedContent: string;
  speechText?: string;
  ignored: boolean;
  spoken: boolean;
  detectedLanguage?: string;
  engineToUse?: TTSEngine;
}

/**
 * Common pipeline for comment processing:
 * 1. Username formatting & simplification
 * 2. Message conversion (messageConvertList)
 * 3. Ignore list filtering (messageIgnoreList)
 * 4. Error string escaping (for TTS safe reading)
 * 5. Language detection (Japanese, English, foreign)
 * 6. Multilingual Katakana transformation
 * 7. Enqueue into TTSQueue
 */
export async function processComment(
  params: CommentProcessParams,
  ctx: CommentProcessContext
): Promise<CommentProcessResult> {
  const rawUsername = params.rawUsername || "Guest";
  const rawText = params.rawText || "";

  // 1. Read Lists for Conversion
  const usernameList = csvList.readList("usernameConvertList");
  const messageList = csvList.readList("messageConvertList");
  const ignoreList = csvList.readList("messageIgnoreList");

  // 2. Format username
  const displayName = formatUsername(rawUsername, usernameList, config.USE_SIMPLE_NAME);

  // 3. Check Ignore list
  if (isIgnoredMessage(rawText, ignoreList)) {
    return {
      displayName,
      rawText,
      modifiedContent: rawText,
      ignored: true,
      spoken: false,
    };
  }

  // 4. Message substitution
  const modifiedContent = formatMessage(rawText, messageList);

  // 5. If TTS is globally disabled
  if (!config.ENABLE_TTS) {
    return {
      displayName,
      rawText,
      modifiedContent,
      ignored: false,
      spoken: false,
    };
  }

  // 6. Escape TTS error strings
  const sanitizedSegment = escapeTtsErrorString(modifiedContent);
  let speechText = config.READ_USERNAME
    ? `${displayName}: ${sanitizedSegment}`
    : sanitizedSegment;

  // 7. Language detection
  const lang = detectLanguage(sanitizedSegment);
  const isForeign = lang !== "jpn";

  // If IGNORE mode is enabled, skip reading foreign comments entirely
  if (config.FOREIGN_LANGUAGE_MODE === "IGNORE" && isForeign) {
    return {
      displayName,
      rawText,
      modifiedContent,
      speechText,
      ignored: false,
      spoken: false,
      detectedLanguage: lang,
    };
  }

  // 8. Katakana transformation
  if (config.FOREIGN_LANGUAGE_MODE === "KATAKANA" && ctx.transformer) {
    speechText = await ctx.transformer.transform(speechText);
  }

  // 9. Determine engine (Native English vs Default Japanese)
  let engineToUse: TTSEngine | undefined;
  if (
    config.FOREIGN_LANGUAGE_MODE === "NATIVE" &&
    lang === "eng" &&
    ctx.englishEngine
  ) {
    engineToUse = ctx.englishEngine;
  }

  // 10. Fire-and-forget enqueue (non-blocking!)
  ctx.ttsQueue.enqueue(speechText, engineToUse).catch((err) => {
    console.error("[TTSQueue] Playback error:", err);
  });

  return {
    displayName,
    rawText,
    modifiedContent,
    speechText,
    ignored: false,
    spoken: true,
    detectedLanguage: lang,
    engineToUse,
  };
}
