import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

import { paths } from "../paths";

export type ListType =
  | "messageConvertList"
  | "messageIgnoreList"
  | "usernameConvertList"
  | "emoteList";

export class CsvListStorage {
  private dataDir: string;

  // mtime-based in-memory cache (avoids disk reads on every Twitch message)
  private mtimeCache = new Map<ListType, number>();
  private contentCache = new Map<ListType, string[][]>();

  constructor(dataDir = paths.dataDir()) {
    this.dataDir = dataDir;
    this.ensureDirectory();
  }

  private ensureDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  public getFilePath(type: ListType): string {
    return path.join(this.dataDir, `${type}.csv`);
  }

  public ensureFileExists(type: ListType): void {
    const filePath = this.getFilePath(type);
    if (!fs.existsSync(filePath)) {
      const samplePath = path.join(this.dataDir, `${type}.csv.sample`);
      if (fs.existsSync(samplePath)) {
        try {
          fs.copyFileSync(samplePath, filePath);
        } catch {
          fs.writeFileSync(filePath, "", "utf-8");
        }
      } else {
        fs.writeFileSync(filePath, "", "utf-8");
      }
    }
  }

  /** Invalidate the in-memory cache for a specific list type */
  private invalidateCache(type: ListType): void {
    this.mtimeCache.delete(type);
    this.contentCache.delete(type);
  }

  public readList(type: ListType): string[][] {
    this.ensureFileExists(type);
    const filePath = this.getFilePath(type);

    try {
      const stats = fs.statSync(filePath);
      const cachedMtime = this.mtimeCache.get(type);

      // Return cache if file has not changed since last read
      if (cachedMtime !== undefined && stats.mtimeMs <= cachedMtime) {
        return this.contentCache.get(type)!;
      }

      // File is new or modified — read from disk and update cache
      const content = fs.readFileSync(filePath, "utf-8");
      const data: string[][] = content.trim()
        ? parse(content, { relaxColumnCount: true, skipEmptyLines: true })
        : [];

      this.mtimeCache.set(type, stats.mtimeMs);
      this.contentCache.set(type, data);
      return data;
    } catch (err) {
      console.error(`[CsvListStorage] Error reading ${type}:`, err);
      return [];
    }
  }

  public writeList(type: ListType, data: string[][]): void {
    this.ensureFileExists(type);
    const filePath = this.getFilePath(type);

    const lines = data.map((row) =>
      row
        .map((col) => {
          if (col.includes(",") || col.includes('"') || col.includes("\n")) {
            return `"${col.replace(/"/g, '""')}"`;
          }
          return col;
        })
        .join(",")
    );

    fs.writeFileSync(filePath, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf-8");

    // Invalidate cache immediately so the next readList() picks up the new content
    this.invalidateCache(type);
  }

  public appendRow(type: ListType, row: string[]): void {
    const list = this.readList(type);
    list.push(row);
    this.writeList(type, list);
  }

  public removeByFirstColumn(type: ListType, key: string): boolean {
    const list = this.readList(type);
    const initialLen = list.length;
    const filtered = list.filter((row) => row[0] !== key);
    if (filtered.length !== initialLen) {
      this.writeList(type, filtered);
      return true;
    }
    return false;
  }
}

export const csvList = new CsvListStorage();
