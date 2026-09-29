export type DictionaryKind = "message" | "username" | "ignore";

export interface DictionaryItem {
  keyword: string;
  read: string;
}

export interface DictionaryRepository {
  read(kind: DictionaryKind): string[][];
  write(kind: DictionaryKind, rows: string[][]): void;
}

export type DictionaryUpsertResult =
  | { success: true; keyword: string; read: string }
  | { success: false; error: string };

export class DictionaryService {
  constructor(private readonly repository: DictionaryRepository) {}

  public list(kindInput?: unknown): {
    type: DictionaryKind;
    items: DictionaryItem[];
  } {
    const type = this.normalizeKind(kindInput);
    const items = this.repository.read(type).map(([keyword, read]) => ({
      keyword: keyword ?? "",
      read: read ?? "",
    }));
    return { type, items };
  }

  public upsert(
    kindInput: unknown,
    keywordInput: unknown,
    readInput: unknown
  ): DictionaryUpsertResult {
    const type = this.normalizeKind(kindInput);
    const keyword = (keywordInput ?? "").toString().trim();
    const read = (readInput ?? "").toString().trim();
    const isIgnore = type === "ignore";

    if (!keyword || (!isIgnore && !read)) {
      return {
        success: false,
        error: isIgnore ? "keyword is required" : "keyword and read are required",
      };
    }
    if (keyword.length > 100) {
      return { success: false, error: "Keyword too long (max 100 chars)" };
    }
    if (!isIgnore && read.length > 200) {
      return { success: false, error: "Read text too long (max 200 chars)" };
    }

    const storedKey = this.toStoredKey(type, keyword);
    const rows = this.repository.read(type);
    const index = rows.findIndex(
      (row) => row[0] === storedKey || row[0] === keyword
    );
    const storedRead = isIgnore ? "" : read;
    if (index >= 0) {
      rows[index] = [storedKey, storedRead];
    } else {
      rows.push([storedKey, storedRead]);
    }
    this.repository.write(type, rows);

    return { success: true, keyword, read: storedRead };
  }

  public remove(kindInput: unknown, keywordInput: unknown): boolean {
    const type = this.normalizeKind(kindInput);
    const keyword = (keywordInput ?? "").toString().trim();
    if (!keyword) {
      return false;
    }

    const storedKey = this.toStoredKey(type, keyword);
    const rows = this.repository.read(type);
    const index = rows.findIndex(
      (row) => row[0] === storedKey || row[0] === keyword
    );
    if (index < 0) {
      return false;
    }

    rows.splice(index, 1);
    this.repository.write(type, rows);
    return true;
  }

  private normalizeKind(kindInput: unknown): DictionaryKind {
    if (kindInput === "username" || kindInput === "ignore") {
      return kindInput;
    }
    return "message";
  }

  private toStoredKey(kind: DictionaryKind, keyword: string): string {
    if (kind === "ignore") {
      return keyword;
    }
    return keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
