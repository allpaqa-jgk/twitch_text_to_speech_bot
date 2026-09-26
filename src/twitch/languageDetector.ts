import { franc } from "franc-min";
import { isChineseText } from "../tts/transformers/chinese";

export type DetectedLanguage =
  | "jpn" // Japanese
  | "eng" // English
  | "rus" // Russian / Cyrillic
  | "spa" // Spanish
  | "kor" // Korean
  | "zho" // Chinese (Traditional / Simplified)
  | "other";

/**
 * Detect language of text, highly optimized for Twitch chat messages
 * (including very short comments like "gg", "nice", "hello").
 */
export function detectLanguage(text: string): DetectedLanguage {
  const trimmed = text.trim();
  if (!trimmed) {
    return "other";
  }

  // 1. Japanese Guard: Hiragana or Katakana present -> 100% Japanese
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(trimmed)) {
    return "jpn";
  }

  // 2. Korean (Hangul Syllables and Jamo)
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(trimmed)) {
    return "kor";
  }

  // 3. Russian / Cyrillic
  if (/[\u0400-\u04FF]/.test(trimmed)) {
    return "rus";
  }

  // 4. Spanish specific characters (inverted marks, ñ, accents)
  if (/[¡¿ñáéíóú]/.test(trimmed)) {
    return "spa";
  }

  // 5. Latin text: check with franc if long enough, default to English for short gaming chat
  if (trimmed.length >= 15) {
    const code = franc(trimmed, {
      only: ["eng", "spa", "fra", "deu", "ita", "por"],
      minLength: 10,
    });
    if (code === "spa") return "spa";
    if (code !== "und") return "eng";
  }

  // Default Latin text to English (covers "gg", "nice stream", "pog", etc.)
  if (/^[A-Za-z0-9\s.,!?'"`~@#$%^&*()_\-+=[\]{}|\\:;<>]+$/.test(trimmed)) {
    return "eng";
  }

  // 6. Chinese / Taiwan Mandarin (Hanzi without Kana)
  if (isChineseText(trimmed)) {
    return "zho";
  }

  // 7. Remaining pure Kanji (e.g. 了解, 初見, 感謝) -> default to Japanese
  if (/[\u4E00-\u9FAF]/.test(trimmed)) {
    return "jpn";
  }

  return "other";
}
