import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { KatakanaTransformer } from "../tts/transformers/katakana";

describe("KatakanaTransformer Golden Master Tests", () => {
  const transformer = new KatakanaTransformer();
  const fixturePath = path.resolve(import.meta.dir, "fixtures/katakana_cases.json");
  const cases: Record<string, string> = JSON.parse(
    fs.readFileSync(fixturePath, "utf-8")
  );

  // Automatically update fixtures if UPDATE_SNAPSHOT=1 is set
  if (process.env.UPDATE_SNAPSHOT === "1") {
    const updated: Record<string, string> = {};
    for (const input of Object.keys(cases)) {
      updated[input] = transformer.transform(input);
    }
    fs.writeFileSync(fixturePath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
    console.log(`[Snapshot] Updated ${fixturePath} with current transform outputs.`);
  }

  for (const [input, expected] of Object.entries(cases)) {
    it(`transforms "${input}" -> "${expected}"`, () => {
      const actual = transformer.transform(input);
      if (actual !== expected) {
        throw new Error(
          `Snapshot mismatch for input "${input}":\n  Expected: "${expected}"\n  Actual:   "${actual}"`
        );
      }
      expect(actual).toBe(expected);
    });
  }
});
