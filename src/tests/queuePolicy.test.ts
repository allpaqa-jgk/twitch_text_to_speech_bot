import { describe, expect, it } from "bun:test";
import { SettingsStore } from "../settingsStore";
import { parseConfig } from "../config";
import { TTSQueuePolicy } from "../tts/queuePolicy";

describe("TTSQueuePolicy", () => {
  it("calculates text and queue acceleration without scheduling queue items", () => {
    const store = new SettingsStore(parseConfig({
      AUTO_ACCELERATE: true,
      MAX_ACCELERATION_SPEED: 1.6,
    }));
    const policy = new TTSQueuePolicy(store);
    expect(policy.calculateSpeedScale("あ".repeat(100), [])).toBe(1.45);
    expect(policy.calculateSpeedScale("あ".repeat(10), [{ text: "あ".repeat(60) }])).toBe(1.25);
    expect(
      policy.calculateSpeedScale("短文", [
        { text: "1" },
        { text: "2" },
        { text: "3" },
        { text: "4" },
      ])
    ).toBe(1.5);
  });

  it("applies TTL boundaries, bypass, and disabled TTL as policy decisions", () => {
    const store = new SettingsStore(parseConfig({
      COMMENT_TTL_SECONDS: 30,
    }));
    const policy = new TTSQueuePolicy(store);
    const item = { text: "comment", enqueuedAt: 1_000, settings: store.current() };
    expect(policy.isExpired(item, 31_000)).toBe(false);
    expect(policy.isExpired(item, 31_001)).toBe(true);
    expect(policy.isExpired({ ...item, bypassTtl: true }, 31_001)).toBe(false);

    store.apply({ COMMENT_TTL_SECONDS: 0 });
    const item0 = { text: "comment", enqueuedAt: 1_000, settings: store.current() };
    expect(policy.isExpired(item0, 100_000)).toBe(false);
  });

  it("classifies transient failures and exposes the existing retry backoff policy", () => {
    const policy = new TTSQueuePolicy();
    expect(policy.isTransientConnectionOrTimeoutError(new TypeError("fetch failed"))).toBe(true);
    expect(policy.isTransientConnectionOrTimeoutError({ code: "ECONNREFUSED" })).toBe(true);
    expect(policy.isTransientConnectionOrTimeoutError(new Error("invalid request"))).toBe(false);
    expect(policy.retryDelays).toEqual([200, 400]);
  });
});
