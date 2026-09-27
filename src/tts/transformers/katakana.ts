import type { TextTransformer } from "./types";
import { KatakanaConverter, isChinese } from "@allpaqa/multilingual-katakana";

/**
 * KatakanaTransformer: Adapts @allpaqa/multilingual-katakana to TextTransformer interface.
 */
export class KatakanaTransformer implements TextTransformer {
  public readonly name = "KatakanaTransformer";
  private converter = new KatakanaConverter();

  public transform(text: string): string {
    return this.converter.transform(text);
  }
}

// Backward compatibility export
export { isChinese as isChineseText };
