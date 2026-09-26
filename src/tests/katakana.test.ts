import { describe, expect, it } from "bun:test";
import { KatakanaTransformer } from "../tts/transformers/katakana";

describe("KatakanaTransformer", () => {
  const transformer = new KatakanaTransformer();

  describe("English conversion via CMUdict & loanword rules", () => {
    it("should convert common greetings and Twitch slang", () => {
      expect(transformer.transform("hello")).toBe("ハロー");
      expect(transformer.transform("Hello World")).toBe("ハロー ワールド");
      expect(transformer.transform("nice stream bro")).toBe("ナイス ストリーム ブロ");
      expect(transformer.transform("gg wp")).toBe("ジージー ウェルプレイド");
      expect(transformer.transform("this is test")).toBe("ディス イズ テスト");
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
      expect(transformer.transform("don’t do that")).toBe("ドーント ドゥー ザット");
      expect(transformer.transform("fps rpg bgm pvp url")).toBe(
        "エフピーエス アールピージー ビージーエム ピーブイピー ユーアールエル"
      );
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
      expect(transformer.transform("muchas gracias")).toBe("ムチャス グラシアス");
      expect(transformer.transform("señor")).toBe("セニョール");
    });
  });

  describe("Hangul (Korean) conversion", () => {
    it("should convert Korean phrases into Katakana", () => {
      expect(transformer.transform("안녕하세요")).toBe("アンニョンハセヨ");
      expect(transformer.transform("감사합니다")).toBe("カムサハムニダ");
      expect(
        transformer.transform("안녕하세요! 방송 너무 재미있어요 화이팅!")
      ).toBe("アンニョンハセヨ ! パンソン ノム チェミイッソヨ ファイティン !");
      expect(transformer.transform("진짜 대박 잘자요")).toBe(
        "チンチャ テバク チャルジャヨ"
      );
    });
  });

  describe("Chinese / Taiwan Mandarin conversion", () => {
    it("should convert Chinese text with Taiwan slang and pronunciations prioritized", () => {
      expect(transformer.transform("你好！玩得很好，加油！")).toBe(
        "ニー ハオ！ワン ドゥ ヘン ハオ， ジャーヨウ ！"
      );
      expect(transformer.transform("這個是垃圾遊戲，安安笑死")).toBe(
        "ジャー ガー シー レースー ヨウ シー， アンアン シアオスー"
      );
      expect(transformer.transform("實況主太厲害了吧")).toBe(
        "シークアン ジュー タイ リー ハイ ラ バー"
      );
      expect(transformer.transform("謝謝乾爹")).toBe("シエ シエ ガンディエ");
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
        "みんな ハロー! プリヴィエト!"
      );
      expect(transformer.transform("twitchで配信中！gg")).toBe(
        "ツイッチで配信中！ジージー"
      );
    });

    it("should convert complex notification comments without spelling out letters", () => {
      expect(
        transformer.transform(
          "haaaaaaa is now live! Streaming Egging On: ちょっとたまご"
        )
      ).toBe("ハアアアアアア イズ ナウ ライブ! ストリーミング エギング オン: ちょっとたまご");
    });
  });
});
