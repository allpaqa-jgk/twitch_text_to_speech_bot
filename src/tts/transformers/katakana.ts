import type { TextTransformer } from "./types";
import { KatakanaConverter, isChinese } from "@allpaqa/multilingual-katakana";

// URLs and Twitch-style @mentions must not be mangled into katakana pronunciation.
const URL_PATTERN = /https?:\/\/\S+|www\.\S+/g;
const MENTION_PATTERN = /@\w+/g;

/**
 * KatakanaTransformer: Adapts @allpaqa/multilingual-katakana to TextTransformer interface.
 */
export class KatakanaTransformer implements TextTransformer {
  public readonly name = "KatakanaTransformer";
  private converter = new KatakanaConverter();

  public transform(text: string): string {
    return this.converter.transform(text, { exclude: [URL_PATTERN, MENTION_PATTERN] });
  }
}

// Backward compatibility export
export { isChinese as isChineseText };
