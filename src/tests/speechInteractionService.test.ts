import { describe, expect, it } from "bun:test";
import {
  SpeechInteractionService,
  type SpeechQueueControl,
} from "../application/speechInteractionService";
import type { TextTransformer } from "../tts/transformers/types";
import type { EnqueueOptions } from "../tts/queue";

class MockSpeechQueue implements SpeechQueueControl {
  public clearCount = 0;
  public enqueued: Array<{ text: string; options?: EnqueueOptions }> = [];

  public clear(): void {
    this.clearCount++;
  }

  public enqueue(text: string, options?: EnqueueOptions): Promise<void> {
    this.enqueued.push({ text, options });
    return Promise.resolve();
  }
}

const prefixTransformer: TextTransformer = {
  name: "PrefixTransformer",
  transform: (text) => `変換:${text}`,
};

describe("SpeechInteractionService", () => {
  it("clears the queue through its application operation", () => {
    const queue = new MockSpeechQueue();
    const service = new SpeechInteractionService(queue);

    service.clearQueue();

    expect(queue.clearCount).toBe(1);
  });

  it("enqueues demo speech with acceleration and TTL bypass", async () => {
    const queue = new MockSpeechQueue();
    const service = new SpeechInteractionService(queue, prefixTransformer);
    const originalLog = console.log;
    console.log = () => {};

    try {
      await service.enqueueDemo();
    } finally {
      console.log = originalLog;
    }

    expect(queue.enqueued.length).toBeGreaterThan(0);
    expect(queue.enqueued[0].text).toContain("変換:");
    expect(queue.enqueued.every(({ options }) =>
      options?.bypassAcceleration === true && options.bypassTtl === true
    )).toBe(true);
  });

  it("previews detected languages and transformed text", async () => {
    const service = new SpeechInteractionService(
      new MockSpeechQueue(),
      prefixTransformer
    );

    await expect(service.preview([" Hello ", "こんにちは", ""])).resolves.toEqual([
      {
        line: 1,
        original: " Hello ",
        transformed: "変換:Hello",
        lang: "eng",
      },
      {
        line: 2,
        original: "こんにちは",
        transformed: "変換:こんにちは",
        lang: "jpn",
      },
      {
        line: 3,
        original: "",
        transformed: "",
        lang: "other",
      },
    ]);
  });
});
