import { describe, expect, it } from "bun:test";
import {
  TwitchControlService,
  type TwitchConnection,
} from "../application/twitchControlService";

class MockConnection implements TwitchConnection {
  public connected = false;

  public isConnected(): boolean {
    return this.connected;
  }

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
  }
}

describe("TwitchControlService", () => {
  it("toggles the connection state", async () => {
    const connection = new MockConnection();
    const service = new TwitchControlService(connection);

    expect(await service.toggle()).toBe(true);
    expect(await service.toggle()).toBe(false);
  });

  it("reports disconnected when no Twitch connection is configured", async () => {
    const service = new TwitchControlService(null);

    expect(service.isConnected()).toBe(false);
    expect(await service.toggle()).toBe(false);
  });

  it("disconnectForShutdown disconnects only when currently connected, and is a no-op otherwise", async () => {
    const connection = new MockConnection();
    const service = new TwitchControlService(connection);

    // No-op when already disconnected.
    await service.disconnectForShutdown();
    expect(connection.connected).toBe(false);

    await connection.connect();
    expect(connection.connected).toBe(true);
    await service.disconnectForShutdown();
    expect(connection.connected).toBe(false);
  });

  it("disconnectForShutdown is a no-op when no Twitch connection is configured", async () => {
    const service = new TwitchControlService(null);
    await expect(service.disconnectForShutdown()).resolves.toBeUndefined();
  });
});
