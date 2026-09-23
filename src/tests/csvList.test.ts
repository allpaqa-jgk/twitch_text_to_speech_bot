import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { CsvListStorage } from "../storage/csvList";

/** Create a temporary directory and return a fresh CsvListStorage backed by it */
function makeTempStorage(): { storage: CsvListStorage; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-test-"));
  const storage = new CsvListStorage(dir);
  return { storage, dir };
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("CsvListStorage", () => {
  describe("readList / writeList basics", () => {
    it("returns empty array for empty file", () => {
      const { storage, dir } = makeTempStorage();
      expect(storage.readList("messageConvertList")).toEqual([]);
      cleanup(dir);
    });

    it("reads rows written by writeList", () => {
      const { storage, dir } = makeTempStorage();
      storage.writeList("messageConvertList", [
        ["hello", "ハロー"],
        ["world", "ワールド"],
      ]);
      const rows = storage.readList("messageConvertList");
      expect(rows).toEqual([
        ["hello", "ハロー"],
        ["world", "ワールド"],
      ]);
      cleanup(dir);
    });

    it("handles values containing commas with quoting", () => {
      const { storage, dir } = makeTempStorage();
      storage.writeList("messageConvertList", [["a,b", "c,d"]]);
      const rows = storage.readList("messageConvertList");
      expect(rows[0][0]).toBe("a,b");
      expect(rows[0][1]).toBe("c,d");
      cleanup(dir);
    });
  });

  describe("mtime-based cache", () => {
    it("returns cached data on second readList without disk re-read", () => {
      const { storage, dir } = makeTempStorage();
      storage.writeList("messageIgnoreList", [["spam"]]);

      // First read — populates cache
      const first = storage.readList("messageIgnoreList");
      expect(first).toEqual([["spam"]]);

      // Mutate the file directly behind the storage's back,
      // but keep mtime unchanged (simulate no-change scenario)
      // We do this by re-writing the same content and then manually restoring mtime.
      const filePath = storage.getFilePath("messageIgnoreList");
      const statBefore = fs.statSync(filePath);
      fs.writeFileSync(filePath, "injected\n", "utf-8");
      // Restore original mtime so cache still thinks it's unchanged
      fs.utimesSync(filePath, statBefore.atime, statBefore.mtime);

      // Second read — should return cached (stale) data because mtime didn't change
      const second = storage.readList("messageIgnoreList");
      expect(second).toEqual([["spam"]]);

      cleanup(dir);
    });

    it("invalidates cache and re-reads when file mtime changes", () => {
      const { storage, dir } = makeTempStorage();
      storage.writeList("messageIgnoreList", [["old"]]);

      // First read — populates cache
      storage.readList("messageIgnoreList");

      // Wait 10ms so the OS records a newer mtime on next write
      Bun.sleepSync(10);

      // Directly write a new file with a newer mtime
      const filePath = storage.getFilePath("messageIgnoreList");
      fs.writeFileSync(filePath, "new\n", "utf-8");

      // Should detect the mtime change and return the new content
      const result = storage.readList("messageIgnoreList");
      expect(result).toEqual([["new"]]);

      cleanup(dir);
    });

    it("invalidates cache immediately after writeList", () => {
      const { storage, dir } = makeTempStorage();
      storage.writeList("usernameConvertList", [["alice", "アリス"]]);

      // Populate cache
      storage.readList("usernameConvertList");

      // writeList should invalidate cache so the next read is fresh
      storage.writeList("usernameConvertList", [["bob", "ボブ"]]);

      const result = storage.readList("usernameConvertList");
      expect(result).toEqual([["bob", "ボブ"]]);

      cleanup(dir);
    });
  });

  describe("appendRow / removeByFirstColumn", () => {
    it("appends a row and reads it back", () => {
      const { storage, dir } = makeTempStorage();
      storage.writeList("messageConvertList", [["a", "ア"]]);
      storage.appendRow("messageConvertList", ["b", "イ"]);

      const rows = storage.readList("messageConvertList");
      expect(rows).toHaveLength(2);
      expect(rows[1]).toEqual(["b", "イ"]);
      cleanup(dir);
    });

    it("removes a row by first column key", () => {
      const { storage, dir } = makeTempStorage();
      storage.writeList("messageConvertList", [
        ["keep", "キープ"],
        ["remove", "削除"],
      ]);

      const removed = storage.removeByFirstColumn("messageConvertList", "remove");
      expect(removed).toBe(true);

      const rows = storage.readList("messageConvertList");
      expect(rows).toHaveLength(1);
      expect(rows[0][0]).toBe("keep");
      cleanup(dir);
    });

    it("returns false when key is not found in removeByFirstColumn", () => {
      const { storage, dir } = makeTempStorage();
      storage.writeList("messageConvertList", [["a", "ア"]]);

      const removed = storage.removeByFirstColumn("messageConvertList", "notexist");
      expect(removed).toBe(false);
      cleanup(dir);
    });
  });
});
