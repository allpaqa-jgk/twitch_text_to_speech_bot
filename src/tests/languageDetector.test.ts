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
});
