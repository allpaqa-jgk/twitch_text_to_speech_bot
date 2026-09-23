import { describe, expect, it } from "bun:test";
import { KatakanaTransformer } from "../tts/transformers/katakana";

describe("KatakanaTransformer", () => {
  const transformer = new KatakanaTransformer();

  describe("English conversion", () => {
    it("should convert common greetings and Twitch slang", () => {
      expect(transformer.transform("hello")).toBe("ハロー");
      expect(transformer.transform("Hello World")).toBe("ハローワールド");
      expect(transformer.transform("nice stream bro")).toBe("ナイスストリームブロ");
      expect(transformer.transform("gg wp")).toBe("ジージーウェルプレイド");
      expect(transformer.transform("thank you")).toBe("サンキュー");
      expect(transformer.transform("this is test")).toBe("ディスイズテスト");
    });

    it("should apply phonics rules for unknown words instead of raw romaji", () => {
      expect(transformer.transform("knight")).toBe("ナイト");
      expect(transformer.transform("station")).toBe("ステーション");
    });
  });

  describe("Cyrillic (Russian) conversion", () => {
    it("should convert Russian words into natural phonetic Katakana", () => {
      expect(transformer.transform("Привет")).toBe("プリヴィエト");
      expect(transformer.transform("Спасибо")).toBe("スパスィーバ");
      expect(transformer.transform("хорошо")).toBe("ハラショー");
    });
  });

  describe("Spanish conversion", () => {
    it("should convert Spanish phrases with silent H and special letters", () => {
      expect(transformer.transform("¡Hola! amigo")).toBe("オラ! アミーゴ");
      expect(transformer.transform("muchas gracias")).toBe("ムチャスグラシアス");
      expect(transformer.transform("señor")).toBe("セニョール");
    });
  });

  describe("Hangul (Korean) conversion", () => {
    it("should convert Korean phrases into Katakana", () => {
      expect(transformer.transform("안녕하세요")).toBe("アンニョンハセヨ");
      expect(transformer.transform("감사합니다")).toBe("カムサハムニダ");
    });
  });

  describe("Mixed text", () => {
    it("should preserve Japanese while converting foreign words", () => {
      expect(transformer.transform("今日の配信 nice だったよ！")).toBe(
        "今日の配信 ナイス だったよ！"
      );
      expect(transformer.transform("みんな hello! Привет!")).toBe(
        "みんな ハロー! プリヴィエト!"
      );
    });
  });
});
