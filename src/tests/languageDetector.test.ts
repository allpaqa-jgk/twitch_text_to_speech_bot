import { describe, expect, it } from "bun:test";
import { detectLanguage } from "../twitch/languageDetector";

describe("detectLanguage", () => {
  it("should accurately detect Japanese", () => {
    expect(detectLanguage("こんにちは世界")).toBe("jpn");
    expect(detectLanguage("今日の配信最高だった！")).toBe("jpn");
    expect(detectLanguage("草生えたｗｗｗ")).toBe("jpn");
    expect(detectLanguage("ナイス nice！")).toBe("jpn"); // Japanese mixed
  });

  it("should detect short English gaming comments", () => {
    expect(detectLanguage("nice")).toBe("eng");
    expect(detectLanguage("gg wp")).toBe("eng");
    expect(detectLanguage("hello bro")).toBe("eng");
    expect(detectLanguage("What is this game?")).toBe("eng");
  });

  it("should detect Russian (Cyrillic)", () => {
    expect(detectLanguage("Привет")).toBe("rus");
    expect(detectLanguage("Спасибо за стрим!")).toBe("rus");
    expect(detectLanguage("Как дела?")).toBe("rus");
  });

  it("should detect Spanish", () => {
    expect(detectLanguage("¡Hola! ¿Cómo estás?")).toBe("spa");
    expect(detectLanguage("muchas gracias señor")).toBe("spa");
  });

  it("should detect Korean (Hangul)", () => {
    expect(detectLanguage("안녕하세요")).toBe("kor");
    expect(detectLanguage("감사합니다")).toBe("kor");
  });

  it("should detect Chinese / Taiwan Mandarin while keeping pure Japanese Kanji as Japanese", () => {
    expect(detectLanguage("你好！玩得很好，加油！")).toBe("zho");
    expect(detectLanguage("這個遊戲太強了")).toBe("zho");
    expect(detectLanguage("了解")).toBe("jpn");
    expect(detectLanguage("初見歓迎")).toBe("jpn");
    expect(detectLanguage("神回")).toBe("jpn");
  });
});
