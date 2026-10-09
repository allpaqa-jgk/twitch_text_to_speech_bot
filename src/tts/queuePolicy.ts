import type { Settings, SettingsStore } from "../settingsStore";
import { settingsStore } from "../settingsStore";

export interface QueuePolicyItem {
  text: string;
  enqueuedAt: number;
  bypassTtl?: boolean;
  settings?: Settings;
}

export class TTSQueuePolicy {
  constructor(private readonly store: SettingsStore = settingsStore) {}

  public calculateSpeedScale(
    text: string,
    pendingItems: readonly Pick<QueuePolicyItem, "text">[],
    settings?: Settings
  ): number {
    const s = settings ?? this.store.current();
    if (!s.AUTO_ACCELERATE) {
      return 1.0;
    }

    let speedByLength = 1.0;
    const len = text.length;
    if (len <= 30) {
      speedByLength = 1.0;
    } else if (len <= 60) {
      speedByLength = 1.15;
    } else if (len <= 90) {
      speedByLength = 1.30;
    } else if (len <= 120) {
      speedByLength = 1.45;
    } else {
      speedByLength = 1.60;
    }

    const queueTotalChars =
      pendingItems.reduce((acc, item) => acc + item.text.length, 0) + text.length;
    const queueCount = pendingItems.length + 1;

    let speedByQueue = 1.0;
    if (queueTotalChars >= 120 || queueCount >= 5) {
      speedByQueue = 1.50;
    } else if (queueTotalChars >= 60 || queueCount >= 3) {
      speedByQueue = 1.25;
    }

    const maxSpeed = s.MAX_ACCELERATION_SPEED ?? 1.6;
    return Math.min(Math.max(speedByLength, speedByQueue), maxSpeed);
  }

  public isExpired(
    item: QueuePolicyItem,
    now = Date.now(),
    settings?: Settings
  ): boolean {
    const s = settings ?? item.settings ?? this.store.current();
    const ttl = s.COMMENT_TTL_SECONDS ?? 30;
    return (
      !item.bypassTtl &&
      ttl > 0 &&
      now - item.enqueuedAt > ttl * 1000
    );
  }

  public isTransientConnectionOrTimeoutError(err: unknown): boolean {
    if (!err) return false;
    const error = (typeof err === "object" || typeof err === "function" ? err : {}) as {
      name?: unknown;
      code?: unknown;
      errno?: unknown;
      message?: unknown;
    };
    if (error.name === "TimeoutError" || error.name === "AbortError") return true;
    if (
      error.code === "ConnectionRefused" ||
      error.code === "ECONNREFUSED" ||
      error.code === "ETIMEDOUT" ||
      error.code === "UND_ERR_CONNECT_TIMEOUT"
    ) {
      return true;
    }
    if (error.errno === 0) return true;

    const message = String(error.message || err);
    return (
      message.includes("ConnectionRefused") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ETIMEDOUT") ||
      message.includes("Unable to connect") ||
      message.includes("fetch failed") ||
      message.includes("timeout") ||
      message.includes("aborted") ||
      message.includes("The operation was aborted") ||
      message.includes("The operation timed out")
    );
  }

  public get retryDelays(): readonly number[] {
    return [200, 400];
  }
}
