import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleRememberCommand, handleForgetCommand } from "../twitch/commands/remember";
import { csvList } from "../storage/csvList";
import { formatMessage } from "../twitch/messageProcessor";
import fs from "fs";
import path from "path";
import os from "os";

describe("handleRememberCommand security & functionality", () => {
  const originalDataDir = (csvList as any).dataDir;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-remember-test-"));
    (csvList as any).dataDir = tempDir;
    (csvList as any).invalidateCache();
  });

  afterEach(() => {
    (csvList as any).dataDir = originalDataDir;
    (csvList as any).invalidateCache();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should safely escape RegExp characters to prevent ReDoS", () => {
    // Malicious ReDoS pattern
    const malicious = "(a+)+$";
    const res = handleRememberCommand(`!remember ${malicious}=safe`);

    expect(res.replyMessage).toContain("is added (=safe)");

    // Verify stored keyword is escaped
    const list = csvList.readList("messageConvertList");
    expect(list.length).toBe(1);
    expect(list[0][0]).toBe("\\(a\\+\\)\\+\\$");

    // When evaluated by formatMessage, it should treat as literal string and not hang
    const converted = formatMessage("test (a+)+$ end", list);
    expect(converted).toBe("test safe end");

    // Normal text should not trigger catastrophic backtracking
    const attackText = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
    const normalConverted = formatMessage(attackText, list);
    expect(normalConverted).toBe(attackText);
  });

  it("should reject excessively long keywords to prevent abuse", () => {
    const longKeyword = "a".repeat(101);
    const res = handleRememberCommand(`!remember ${longKeyword}=test`);
    expect(res.replyMessage).toContain("Error: Keyword too long");
  });

  it("should reject excessively long replacement text", () => {
    const longReplacement = "b".repeat(201);
    const res = handleRememberCommand(`!remember hello=${longReplacement}`);
    expect(res.replyMessage).toContain("Error: Replacement text too long");
  });

  it("should successfully forget an escaped keyword", () => {
    handleRememberCommand("!remember [test]=hoge");
    const forgetRes = handleForgetCommand("!forget [test]");
    expect(forgetRes.replyMessage).toContain("is forgotten");

    const list = csvList.readList("messageConvertList");
    expect(list.length).toBe(0);
  });
});
