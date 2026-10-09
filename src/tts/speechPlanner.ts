import type { TTSEngine } from "./engine";
import type { Pin } from "./queue";
import type { TextTransformer } from "./transformers/types";
import { detectLanguage } from "../text/languageDetector";

export interface SpeechPlanContext {
  transformer?: TextTransformer;
}

export interface SpeechPlanResult {
  text: string;
  engine: TTSEngine;
  ignored: boolean;
  detectedLanguage: string;
}

export async function planSpeech(
  text: string,
  pin: Pick<Pin, "settings" | "engines">,
  ctx?: SpeechPlanContext,
  detectOn?: string
): Promise<SpeechPlanResult> {
  const lang = detectLanguage(detectOn ?? text);
  const isForeign = lang !== "jpn";

  if (pin.settings.FOREIGN_LANGUAGE_MODE === "IGNORE" && isForeign) {
    return {
      text,
      engine: pin.engines.primary,
      ignored: true,
      detectedLanguage: lang,
    };
  }

  if (pin.settings.FOREIGN_LANGUAGE_MODE === "KATAKANA") {
    let transformed = text;
    if (ctx?.transformer) {
      transformed = await ctx.transformer.transform(text);
    }
    return {
      text: transformed,
      engine: pin.engines.primary,
      ignored: false,
      detectedLanguage: lang,
    };
  }

  if (pin.settings.FOREIGN_LANGUAGE_MODE === "NATIVE") {
    if (lang === "eng") {
      if (pin.engines.english) {
        return {
          text,
          engine: pin.engines.english,
          ignored: false,
          detectedLanguage: lang,
        };
      }
      // KATAKANA guard for NATIVE without an English engine (Q72-2 guard)
      let transformed = text;
      if (ctx?.transformer) {
        transformed = await ctx.transformer.transform(text);
      }
      return {
        text: transformed,
        engine: pin.engines.primary,
        ignored: false,
        detectedLanguage: lang,
      };
    }
  }

  return {
    text,
    engine: pin.engines.primary,
    ignored: false,
    detectedLanguage: lang,
  };
}
