import { csvList } from "../storage/csvList";
import {
  resolveUsername,
  formatMessage,
  isIgnoredMessage,
  escapeTtsErrorString,
} from "../text/messageProcessor";
import type { TTSQueue } from "../tts/queue";
import type { TTSEngine } from "../tts/engine";
import type { TextTransformer } from "../tts/transformers/types";
import type { Settings, SettingsStore } from "../settingsStore";
import { planSpeech } from "../tts/speechPlanner";

export interface CommentProcessParams {
  rawUsername: string;
  rawText: string;
  service?: string;
}

export interface CommentProcessContext {
  ttsQueue: TTSQueue;
  transformer?: TextTransformer;
  store?: SettingsStore;
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
  settings: Settings;
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
  const pin = ctx.ttsQueue.pin();
  try {
    const rawUsername = params.rawUsername || "Guest";
    const rawText = params.rawText || "";

    // 1. Read Lists for Conversion
    const usernameList = csvList.readList("usernameConvertList");
    const messageList = csvList.readList("messageConvertList");
    const ignoreList = csvList.readList("messageIgnoreList");

    // 2. Format username
    const username = resolveUsername(rawUsername, usernameList, pin.settings.USE_SIMPLE_NAME);
    const displayName = username.displayName;

    // 3. Check Ignore list
    if (isIgnoredMessage(rawText, ignoreList)) {
      return {
        displayName,
        rawText,
        modifiedContent: rawText,
        ignored: true,
        spoken: false,
        settings: pin.settings,
      };
    }

    // 4. Message substitution
    const modifiedContent = formatMessage(rawText, messageList);

    if (username.suppressSpeech) {
      return {
        displayName,
        rawText,
        modifiedContent,
        ignored: false,
        spoken: false,
        settings: pin.settings,
      };
    }

    // 5. If TTS is globally disabled
    if (!pin.settings.ENABLE_TTS) {
      return {
        displayName,
        rawText,
        modifiedContent,
        ignored: false,
        spoken: false,
        settings: pin.settings,
      };
    }

    // 6. Escape TTS error strings
    const sanitizedSegment = escapeTtsErrorString(modifiedContent);
    const textToPlan = pin.settings.READ_USERNAME
      ? `${displayName}: ${sanitizedSegment}`
      : sanitizedSegment;

    // 7. Language detection on comment alone, transformation and engine selection via shared planSpeech
    const plan = await planSpeech(textToPlan, pin, ctx, sanitizedSegment);

    if (plan.ignored) {
      return {
        displayName,
        rawText,
        modifiedContent,
        speechText: plan.text,
        ignored: false,
        spoken: false,
        detectedLanguage: plan.detectedLanguage,
        settings: pin.settings,
      };
    }

    const speechText = plan.text;
    const engineToUse = plan.engine;

    // 8. Enqueue with pinned settings and resolved engine
    ctx.ttsQueue.enqueue(speechText, { pin, engine: engineToUse }).catch((err) => {
      console.error("[TTSQueue] Playback error:", err);
    });

    return {
      displayName,
      rawText,
      modifiedContent,
      speechText,
      ignored: false,
      spoken: true,
      detectedLanguage: plan.detectedLanguage,
      engineToUse,
      settings: pin.settings,
    };
  } finally {
    pin.release();
  }
}
