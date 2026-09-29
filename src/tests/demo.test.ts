import { describe, expect, it } from "bun:test";
import { DEMO_ITEMS, prepareDemoSteps } from "../tts/demo";
import { KatakanaTransformer } from "../tts/transformers/katakana";
import type { TextTransformer } from "../tts/transformers/types";

const echoTransformer: TextTransformer = {
  name: "EchoTransformer",
  transform: (text) => `変換:${text}`,
};

describe("demo", () => {
  it("includes Vietnamese and Thai demo entries after Indonesian", () => {
    const indonesianIndex = DEMO_ITEMS.findIndex((item) => item.announce === "インドネシア語を話します");
    const vietnameseIndex = DEMO_ITEMS.findIndex((item) => item.announce === "ベトナム語を話します");
    const thaiIndex = DEMO_ITEMS.findIndex((item) => item.announce === "タイ語を話します");

    expect(indonesianIndex).toBeGreaterThanOrEqual(0);
    expect(vietnameseIndex).toBe(indonesianIndex + 1);
    expect(thaiIndex).toBe(vietnameseIndex + 1);
    expect(DEMO_ITEMS[vietnameseIndex]).toEqual({
      announce: "ベトナム語を話します",
      text: "Xin chào mọi người! Bạn chơi hay lắm, cảm ơn nhé!",
    });
    expect(DEMO_ITEMS[thaiIndex]).toEqual({
      announce: "タイ語を話します",
      text: "สวัสดีครับ! เก่งมาก ขอให้สนุกนะ!",
    });
  });

  it("prepares demo steps with transformed Vietnamese and Thai text", async () => {
    const steps = await prepareDemoSteps(echoTransformer);
    const vietnamese = steps.find((step) => step.announce === "ベトナム語を話します");
    const thai = steps.find((step) => step.announce === "タイ語を話します");

    expect(vietnamese).toEqual({
      announce: "ベトナム語を話します",
      text: "Xin chào mọi người! Bạn chơi hay lắm, cảm ơn nhé!",
      converted: "変換:Xin chào mọi người! Bạn chơi hay lắm, cảm ơn nhé!",
    });
    expect(thai).toEqual({
      announce: "タイ語を話します",
      text: "สวัสดีครับ! เก่งมาก ขอให้สนุกนะ!",
      converted: "変換:สวัสดีครับ! เก่งมาก ขอให้สนุกนะ!",
    });
  });

  it("converts Vietnamese and Thai demo text to katakana without source-script fallback", async () => {
    const steps = await prepareDemoSteps(new KatakanaTransformer());
    const vietnamese = steps.find((step) => step.announce === "ベトナム語を話します");
    const thai = steps.find((step) => step.announce === "タイ語を話します");

    expect(vietnamese?.converted).toContain("シンチャオ");
    expect(vietnamese?.converted).not.toMatch(/\p{Script=Latin}/u);
    expect(thai?.converted).toContain("サワッディー");
    expect(thai?.converted).not.toMatch(/\p{Script=Thai}/u);
  });
});
