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

  public readList(type: ListType): string[][] {
    this.ensureFileExists(type);
    const filePath = this.getFilePath(type);

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.trim()) {
        return [];
      }
      return parse(content, {
        relaxColumnCount: true,
        skipEmptyLines: true,
      });
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
