import { describe, expect, it } from "bun:test";
import {
  formatUsername,
  formatMessage,
  isIgnoredMessage,
  simplifyUsername,
  isEnglishString,
} from "../twitch/messageProcessor";

describe("messageProcessor", () => {
  describe("simplifyUsername", () => {
    it("should strip trailing digits and underscores", () => {
      expect(simplifyUsername("user_123")).toBe("user");
      expect(simplifyUsername("player999")).toBe("player");
      expect(simplifyUsername("regularName")).toBe("regularName");
    });
  });

  describe("formatUsername", () => {
    const list = [
      ["alice_bot", "アリスちゃん"],
      ["bob", "ボブさん"],
    ];

    it("should replace username if defined in list", () => {
      expect(formatUsername("alice_bot", list)).toBe("アリスちゃん");
      expect(formatUsername("bob", list)).toBe("ボブさん");
    });

    it("should simplify username if not in list and useSimpleName=true", () => {
      expect(formatUsername("charlie_999", list, true)).toBe("charlie");
    });

    it("should keep raw username if useSimpleName=false", () => {
      expect(formatUsername("charlie_999", list, false)).toBe("charlie_999");
    });
  });

  describe("formatMessage", () => {
    const list = [
      ["草+", "わらわら"],
      ["888+", "ぱちぱち"],
      ["https?://\\S+", "URL省略"],
    ];

    it("should replace matching regular expressions", () => {
      expect(formatMessage("草草草", list)).toBe("わらわら");
      expect(formatMessage("ナイス 88888", list)).toBe("ナイス ぱちぱち");
      expect(formatMessage("見てね https://example.com/test", list)).toBe(
        "見てね URL省略"
      );
    });

    it("should not crash with invalid regex patterns", () => {
      const brokenList = [["[invalid-regex", "代替"]];
      expect(formatMessage("テスト [invalid-regex 文字列", brokenList)).toBe(
        "テスト 代替 文字列"
      );
    });
  });

  describe("isIgnoredMessage", () => {
    const ignoreList = [["^bot:"], ["spam"]];

    it("should return true for ignored patterns", () => {
      expect(isIgnoredMessage("bot: hello", ignoreList)).toBe(true);
      expect(isIgnoredMessage("this is spam message", ignoreList)).toBe(true);
    });

    it("should return false for normal messages", () => {
      expect(isIgnoredMessage("こんにちは！", ignoreList)).toBe(false);
    });
  });

  describe("isEnglishString", () => {
    it("should detect English sentences", () => {
      expect(isEnglishString("Hello world!")).toBe(true);
      expect(isEnglishString("What is this?")).toBe(true);
      expect(isEnglishString("こんにちは")).toBe(false);
      expect(isEnglishString("Hello こんにちは")).toBe(false);
    });
  });
});
