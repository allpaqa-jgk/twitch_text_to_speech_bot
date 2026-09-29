import { describe, expect, it } from "bun:test";
import {
  DictionaryService,
  type DictionaryKind,
  type DictionaryRepository,
} from "../application/dictionaryService";

class MemoryDictionaryRepository implements DictionaryRepository {
  public readonly lists: Record<DictionaryKind, string[][]> = {
    message: [],
    username: [],
    ignore: [],
  };

  public read(kind: DictionaryKind): string[][] {
    return this.lists[kind].map((row) => [...row]);
  }

  public write(kind: DictionaryKind, rows: string[][]): void {
    this.lists[kind] = rows.map((row) => [...row]);
  }
}

describe("DictionaryService", () => {
  it("lists normalized dictionary entries and defaults unknown types to message", () => {
    const repository = new MemoryDictionaryRepository();
    repository.write("username", [["viewer", "視聴者"]]);
    const service = new DictionaryService(repository);

    expect(service.list("username")).toEqual({
      type: "username",
      items: [{ keyword: "viewer", read: "視聴者" }],
    });
    expect(service.list("unknown")).toEqual({ type: "message", items: [] });
  });

  it("upserts message and username keywords as literal-match regex patterns", () => {
    const repository = new MemoryDictionaryRepository();
    const service = new DictionaryService(repository);

    expect(service.upsert("message", " a+b ", " reading ")).toEqual({
      success: true,
      keyword: "a+b",
      read: "reading",
    });
    expect(repository.read("message")).toEqual([["a\\+b", "reading"]]);

    service.upsert("message", "a+b", "updated");
    expect(repository.read("message")).toEqual([["a\\+b", "updated"]]);

    service.upsert("username", "viewer.name", "viewer");
    expect(repository.read("username")).toEqual([["viewer\\.name", "viewer"]]);
  });

  it("allows an empty read only for username entries", () => {
    const repository = new MemoryDictionaryRepository();
    const service = new DictionaryService(repository);

    expect(service.upsert("username", "silent.viewer", "")).toEqual({
      success: true,
      keyword: "silent.viewer",
      read: "",
    });
    expect(repository.read("username")).toEqual([["silent\\.viewer", ""]]);
    expect(service.upsert("message", "silent.viewer", "")).toEqual({
      success: false,
      error: "keyword and read are required",
    });
  });

  it("preserves ignore patterns without regex escaping and permits an empty read", () => {
    const repository = new MemoryDictionaryRepository();
    const service = new DictionaryService(repository);

    expect(service.upsert("ignore", "^!command", undefined)).toEqual({
      success: true,
      keyword: "^!command",
      read: "",
    });
    expect(repository.read("ignore")).toEqual([["^!command", ""]]);
  });

  it("validates keyword and reading limits", () => {
    const service = new DictionaryService(new MemoryDictionaryRepository());

    expect(service.upsert("message", "", "read")).toEqual({
      success: false,
      error: "keyword and read are required",
    });
    expect(service.upsert("ignore", "", "")).toEqual({
      success: false,
      error: "keyword is required",
    });
    expect(service.upsert("username", "", "")).toEqual({
      success: false,
      error: "keyword is required",
    });
    expect(service.upsert("message", "k".repeat(101), "read")).toEqual({
      success: false,
      error: "Keyword too long (max 100 chars)",
    });
    expect(service.upsert("message", "keyword", "r".repeat(201))).toEqual({
      success: false,
      error: "Read text too long (max 200 chars)",
    });
  });

  it("removes entries using the same key normalization and reports missing entries", () => {
    const repository = new MemoryDictionaryRepository();
    const service = new DictionaryService(repository);
    service.upsert("message", "a+b", "reading");

    expect(service.remove("message", " a+b ")).toBe(true);
    expect(service.remove("message", "a+b")).toBe(false);
    expect(repository.read("message")).toEqual([]);
  });
});
