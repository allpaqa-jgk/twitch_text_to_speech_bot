import { describe, expect, it } from "bun:test";
import { config } from "../config";
import { TTSQueuePolicy } from "../tts/queuePolicy";

describe("TTSQueuePolicy", () => {
  const policy = new TTSQueuePolicy();

  it("calculates text and queue acceleration without scheduling queue items", () => {
    const origAcceleration = config.AUTO_ACCELERATE;
    const origMaxSpeed = config.MAX_ACCELERATION_SPEED;
    try {
      config.AUTO_ACCELERATE = true;
      config.MAX_ACCELERATION_SPEED = 1.6;
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
    } finally {
      config.AUTO_ACCELERATE = origAcceleration;
      config.MAX_ACCELERATION_SPEED = origMaxSpeed;
    }
  });

  it("applies TTL boundaries, bypass, and disabled TTL as policy decisions", () => {
    const origTtl = config.COMMENT_TTL_SECONDS;
    try {
      config.COMMENT_TTL_SECONDS = 30;
      const item = { text: "comment", enqueuedAt: 1_000 };
      expect(policy.isExpired(item, 31_000)).toBe(false);
      expect(policy.isExpired(item, 31_001)).toBe(true);
      expect(policy.isExpired({ ...item, bypassTtl: true }, 31_001)).toBe(false);

      config.COMMENT_TTL_SECONDS = 0;
      expect(policy.isExpired(item, 100_000)).toBe(false);
    } finally {
      config.COMMENT_TTL_SECONDS = origTtl;
    }
  });

  it("classifies transient failures and exposes the existing retry backoff policy", () => {
    expect(policy.isTransientConnectionOrTimeoutError(new TypeError("fetch failed"))).toBe(true);
    expect(policy.isTransientConnectionOrTimeoutError({ code: "ECONNREFUSED" })).toBe(true);
    expect(policy.isTransientConnectionOrTimeoutError(new Error("invalid request"))).toBe(false);
    expect(policy.retryDelays).toEqual([200, 400]);
  });
});
