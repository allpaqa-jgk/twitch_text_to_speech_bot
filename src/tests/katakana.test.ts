import { describe, expect, it } from "bun:test";
import { KatakanaTransformer } from "../tts/transformers/katakana";

describe("KatakanaTransformer", () => {
  const transformer = new KatakanaTransformer();

  describe("English conversion via CMUdict & loanword rules", () => {
    it("should convert common greetings and Twitch slang", () => {
      expect(transformer.transform("hello")).toBe("ハロー");
      expect(transformer.transform("Hello World")).toBe("ハローワールド");
      expect(transformer.transform("nice stream bro")).toBe("ナイスストリームブロ");
      expect(transformer.transform("gg wp")).toBe("ジージーウェルプレイド");
      expect(transformer.transform("this is test")).toBe("ディスイズテスト");
    });

    it("should convert gaming terms and loanwords naturally with loanword sokuon/chouon rules", () => {
      expect(transformer.transform("twitch")).toBe("ツイッチ");
      expect(transformer.transform("chat")).toBe("チャット");
      expect(transformer.transform("bot")).toBe("ボット");
      expect(transformer.transform("egg")).toBe("エッグ");
      expect(transformer.transform("egging")).toBe("エギング");
      expect(transformer.transform("game")).toBe("ゲーム");
      expect(transformer.transform("play")).toBe("プレイ");
      expect(transformer.transform("player")).toBe("プレイヤー");
      expect(transformer.transform("playing")).toBe("プレイイング");
      expect(transformer.transform("comments")).toBe("コメンツ");
    });

    it("should handle elongated slang like haaaaaaa via phonics fallback", () => {
      expect(transformer.transform("haaaaaaa")).toBe("ハアアアアアア");
    });

    it("should handle smart curly apostrophes and stream acronyms", () => {
      expect(transformer.transform("don’t do that")).toBe("ドーントドゥーザット");
      expect(transformer.transform("fps rpg bgm pvp url")).toBe(
        "エフピーエスアールピージービージーエムピーブイピーユーアールエル"
      );
    });

    it("should convert YouTube, VTuber, and streaming platform terms", () => {
      expect(transformer.transform("YouTube")).toBe("ユーチューブ");
      expect(transformer.transform("YouTube Live")).toBe("ユーチューブライブ");
      expect(transformer.transform("YouTuber")).toBe("ユーチューバー");
      expect(transformer.transform("VTuber")).toBe("ブイチューバー");
      expect(transformer.transform("TikTok")).toBe("ティックトック");
      expect(transformer.transform("Twitter")).toBe("ツイッター");
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
      expect(transformer.transform("¡Hola! amigo")).toBe("オラ！アミーゴ");
      expect(transformer.transform("muchas gracias")).toBe("ムチャスグラシアス");
      expect(transformer.transform("señor")).toBe("セニョール");
    });
  });

  describe("Hangul (Korean) conversion", () => {
    it("should convert Korean phrases into Katakana", () => {
      expect(transformer.transform("안녕하세요")).toBe("アンニョンハセヨ");
      expect(transformer.transform("감사합니다")).toBe("カムサハムニダ");
      expect(
        transformer.transform("안녕하세요! 방송 너무 재미있어요 화이팅!")
      ).toBe("アンニョンハセヨ！パンソンノムチェミイッソヨファイティン！");
      expect(transformer.transform("진짜 대박 잘자요")).toBe(
        "チンチャテバクチャルジャヨ"
      );
    });
  });

  describe("Chinese / Taiwan Mandarin conversion", () => {
    it("should convert Chinese text with Taiwan slang and pronunciations prioritized", () => {
      expect(transformer.transform("你好！玩得很好，加油！")).toBe(
        "ニーハオ！ワンドゥヘンハオ、ジャーヨウ！"
      );
      expect(transformer.transform("大家安安！實況主太強了，謝謝乾爹！")).toBe(
        "ダージアアンアン！シークアンジュータイチャンラ、シエシエガンディエ！"
      );
      expect(transformer.transform("這個是垃圾桶")).toBe(
        "ジャーガーシーレースートン"
      );
      expect(transformer.transform("實況主太厲害了吧")).toBe(
        "シークアンジュータイリーハイラバー"
      );
      expect(transformer.transform("謝謝乾爹")).toBe("シエシエガンディエ");
    });

    it("should strictly preserve Japanese pure Kanji sentences without altering them", () => {
      expect(transformer.transform("了解")).toBe("了解");
      expect(transformer.transform("初見歓迎")).toBe("初見歓迎");
      expect(transformer.transform("神回")).toBe("神回");
    });
  });

  describe("Mixed text (live notification & stream comments)", () => {
    it("should preserve Japanese while converting foreign words", () => {
      expect(transformer.transform("今日の配信 nice だったよ！")).toBe(
        "今日の配信 ナイス だったよ！"
      );
      expect(transformer.transform("みんな hello! Привет!")).toBe(
        "みんな ハロー！プリヴィエト！"
      );
      expect(
        transformer.transform(
          "こんにちは！ Hello! Hola! Привет! 안녕하세요! 你好！"
        )
      ).toBe("こんにちは！ハロー！オラ！プリヴィエト！アンニョンハセヨ！ニーハオ！");
      expect(transformer.transform("twitchで配信中！gg")).toBe(
        "ツイッチで配信中！ジージー"
      );
    });

    it("should convert complex notification comments without spelling out letters", () => {
      expect(
        transformer.transform(
          "haaaaaaa is now live! Streaming Egging On: ちょっとたまご"
        )
      ).toBe("ハアアアアアアイズナウライブ！ストリーミングエギングオン: ちょっとたまご");
    });
  });
});
