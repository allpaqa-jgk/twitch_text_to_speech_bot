import { describe, expect, it } from "bun:test";
import { TTSQueue } from "../tts/queue";
import type { TTSEngine } from "../tts/engine";

class MockEngine implements TTSEngine {
  public readonly name = "MockEngine";
  public spokenTexts: string[] = [];
  public delayMs: number;
  public shouldFail: boolean;

  constructor(delayMs = 10, shouldFail = false) {
    this.delayMs = delayMs;
    this.shouldFail = shouldFail;
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async say(text: string): Promise<void> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.shouldFail) {
      throw new Error("Synthetic error");
    }
    this.spokenTexts.push(text);
  }
}

describe("TTSQueue", () => {
  it("should process items sequentially (FIFO)", async () => {
    const mock = new MockEngine(20);
    const queue = new TTSQueue(mock);

    const p1 = queue.enqueue("Message 1");
    const p2 = queue.enqueue("Message 2");
    const p3 = queue.enqueue("Message 3");

    await Promise.all([p1, p2, p3]);

    expect(mock.spokenTexts).toEqual(["Message 1", "Message 2", "Message 3"]);
  });

  it("should continue processing next items even if one fails", async () => {
    let callCount = 0;
    const flakyEngine: TTSEngine = {
      name: "FlakyEngine",
      isAvailable: async () => true,
      say: async (text: string) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Oops, audio error!");
        }
      },
    };

    const queue = new TTSQueue(flakyEngine);

    const p1 = queue.enqueue("First");
    const p2 = queue.enqueue("Failing item");
    const p3 = queue.enqueue("Third");

    await Promise.all([p1, p2, p3]);

    expect(callCount).toBe(3);
  });
});
