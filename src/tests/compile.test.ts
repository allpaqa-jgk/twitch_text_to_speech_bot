import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { runWithCompileCleanup } from "../../scripts/compile";

describe("runWithCompileCleanup", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compile-test-"));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          try {
            fs.chmodSync(path.join(tempDir, file), 0o666);
          } catch {
            // Ignore chmod errors
          }
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore removal error
      }
    }
  });

  it("removes leftover file created by the command and returns the exit code", async () => {
    const leftoverName = ".test1-00000000.bun-build";
    const cmd = [
      "bun",
      "-e",
      `require("fs").writeFileSync("${leftoverName}", "created-during-run"); process.exit(0);`,
    ];

    const exitCode = await runWithCompileCleanup(cmd, tempDir);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tempDir, leftoverName))).toBe(false);
  });

  it("preserves a bun-build file that existed before the run", async () => {
    const preExistingName = ".pre-existing-00000000.bun-build";
    const createdName = ".new-00000000.bun-build";
    fs.writeFileSync(path.join(tempDir, preExistingName), "pre-existing-content");

    const cmd = [
      "bun",
      "-e",
      `require("fs").writeFileSync("${createdName}", "new-content"); process.exit(0);`,
    ];

    const exitCode = await runWithCompileCleanup(cmd, tempDir);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tempDir, preExistingName))).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, preExistingName), "utf-8")).toBe("pre-existing-content");
    expect(fs.existsSync(path.join(tempDir, createdName))).toBe(false);
  });

  it("preserves unrelated files created by the command", async () => {
    const unrelatedName = "unrelated.txt";
    const leftoverName = ".cmd-00000000.bun-build";
    const cmd = [
      "bun",
      "-e",
      `require("fs").writeFileSync("${unrelatedName}", "keep me"); require("fs").writeFileSync("${leftoverName}", "clean me"); process.exit(0);`,
    ];

    const exitCode = await runWithCompileCleanup(cmd, tempDir);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tempDir, unrelatedName))).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, unrelatedName), "utf-8")).toBe("keep me");
    expect(fs.existsSync(path.join(tempDir, leftoverName))).toBe(false);
  });

  it("removes leftover file and returns non-zero code when command exits non-zero", async () => {
    const leftoverName = ".err-00000000.bun-build";
    const cmd = [
      "bun",
      "-e",
      `require("fs").writeFileSync("${leftoverName}", "error-run"); process.exit(42);`,
    ];

    const exitCode = await runWithCompileCleanup(cmd, tempDir);

    expect(exitCode).toBe(42);
    expect(fs.existsSync(path.join(tempDir, leftoverName))).toBe(false);
  });

  it("removes a leftover created with mode 0o555", async () => {
    const leftoverName = ".ro-00000000.bun-build";
    const cmd = [
      "bun",
      "-e",
      `const fs = require("fs"); fs.writeFileSync("${leftoverName}", "readonly"); fs.chmodSync("${leftoverName}", 0o555); process.exit(0);`,
    ];

    const exitCode = await runWithCompileCleanup(cmd, tempDir);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tempDir, leftoverName))).toBe(false);
  });
});
