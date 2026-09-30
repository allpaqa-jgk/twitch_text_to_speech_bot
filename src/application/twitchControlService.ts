export interface TwitchConnection {
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export class TwitchControlService {
  constructor(private readonly connection: TwitchConnection | null) {}

  public async toggle(): Promise<boolean> {
    if (this.connection) {
      if (this.connection.isConnected()) {
        await this.connection.disconnect();
      } else {
        await this.connection.connect();
      }
    }
    return this.isConnected();
  }

  public isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  /**
   * 再起動処理向け: 現在接続中であれば無条件に切断する（未接続時は何もしない）。
   */
  public async disconnectForShutdown(): Promise<void> {
    if (this.connection?.isConnected()) {
      await this.connection.disconnect();
    }
  }
}
