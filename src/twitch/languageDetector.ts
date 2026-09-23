import { franc } from "franc-min";

export type DetectedLanguage =
  | "jpn" // Japanese
  | "eng" // English
  | "rus" // Russian / Cyrillic
  | "spa" // Spanish
  | "kor" // Korean
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

  // 1. Japanese (Hiragana, Katakana, CJK Kanji)
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(trimmed)) {
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

  return "other";
}
