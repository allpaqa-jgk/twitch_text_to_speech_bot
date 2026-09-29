import fs from "fs";

/**
 * 再起動を実行する前に呼び出す停止処理のフック集。
 * HTTP/棒読みサーバーの停止、Twitch 切断、キューの破棄・再生停止をこの順で行う。
 */
export interface RestartHooks {
  stopHttpServers: () => void | Promise<void>;
  disconnectTwitch: () => void | Promise<void>;
  clearQueue: () => void | Promise<void>;
  /**
   * 後継プロセスの起動に失敗した場合にのみ呼び出される復旧フック。
   * 既に停止済みの HTTP サーバー等を再起動し、現在のプロセスを引き続き使える状態に戻すために使う。
   */
  recoverAfterFailedRestart?: () => void | Promise<void>;
}

export type LaunchMode = "compiled-binary" | "bun-script";

export interface RestartLaunchInfo {
  supported: boolean;
  command: string;
  args: string[];
  cwd: string;
  mode: LaunchMode;
  reason?: string;
}

export interface RestartResult {
  success: boolean;
  error?: string;
}

export interface SpawnedProcessHandle {
  pid?: number;
  unref?: () => void;
}

export interface SpawnOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  stdio: Array<"ignore" | "inherit" | "pipe">;
}

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => SpawnedProcessHandle;

const defaultSpawn: SpawnFn = (command, args, options) => {
  return Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env as Record<string, string>,
    stdio: options.stdio,
  }) as unknown as SpawnedProcessHandle;
};

export interface RestartServiceOptions {
  execPath?: string;
  argv?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  spawn?: SpawnFn;
  exit?: (code: number) => void;
  existsSync?: (path: string) => boolean;
  /** 停止フック1件あたりの最大待ち時間（ミリ秒）。超過しても後続処理・終了は続行する。既定 3000ms。 */
  hookTimeoutMs?: number;
}

const SUPPORTED_PLATFORMS: NodeJS.Platform[] = ["darwin", "win32", "linux"];

/**
 * Web UI からの再起動要求を、起動モード（Bun スクリプト実行 / コンパイル済みバイナリ実行）に応じて
 * 安全に処理するサービス。既存プロセスのポート開放・Twitch切断・キュー停止を待ってから、
 * 同じ実行ファイル・引数・作業ディレクトリで後継プロセスを起動する。
 */
export class RestartService {
  private readonly execPath: string;
  private readonly argv: string[];
  private readonly cwd: string;
  private readonly env: Record<string, string | undefined>;
  private readonly platform: NodeJS.Platform;
  private readonly spawnFn: SpawnFn;
  private readonly exitFn: (code: number) => void;
  private readonly existsSyncFn: (path: string) => boolean;
  private readonly hookTimeoutMs: number;
  private lastError: string | null = null;

  constructor(options: RestartServiceOptions = {}) {
    this.execPath = options.execPath ?? process.execPath;
    const rawArgv = options.argv ?? process.argv.slice(1);
    // Bun のコンパイル済みバイナリでは argv[1] に仮想パス（/$bunfs/root/...）が入るが、
    // これは後継プロセス起動時に実引数として渡すべきではないため除外する。
    // 除外しないと再起動のたびに argv に蓄積し、後継プロセスに不正な引数が渡ってしまう。
    this.argv = rawArgv.filter((arg) => !arg.startsWith("/$bunfs/"));
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.spawnFn = options.spawn ?? defaultSpawn;
    this.exitFn = options.exit ?? ((code: number) => process.exit(code));
    this.existsSyncFn = options.existsSync ?? ((p: string) => fs.existsSync(p));
    this.hookTimeoutMs = options.hookTimeoutMs ?? 3000;
  }

  /**
   * 停止フックを実行し、エラーは握りつぶして続行する。フックが hookTimeoutMs 以内に完了しない場合は
   * 警告を出したうえで待たずに次の処理へ進む（フック自体はバックグラウンドで完了を待たず走り続ける）。
   * Twitch切断など外部I/Oを伴うフックが応答しないケースでも、再起動・終了処理全体が固まらないようにするための保険。
   */
  private async runHook(label: string, fn: () => void | Promise<void>): Promise<void> {
    let settled = false;
    const hookPromise = (async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[Restart] ${label} 中にエラーが発生しました:`, err);
      } finally {
        settled = true;
      }
    })();

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!settled) {
          console.error(
            `⚠️ [Restart] ${label} が ${this.hookTimeoutMs}ms 以内に完了しなかったため、完了を待たずに後続処理へ進みます。`
          );
        }
        resolve();
      }, this.hookTimeoutMs);
    });

    await Promise.race([hookPromise, timeoutPromise]);
  }

  /**
   * 現在の実行ファイル・引数から再起動の可否と、後継プロセスの起動コマンドを判定する。
   * Bun スクリプト実行・コンパイル済みバイナリ実行のどちらでも
   * `process.execPath` + `process.argv.slice(1)` により同じ起動内容を再現できる。
   */
  public getLaunchInfo(): RestartLaunchInfo {
    const execBase = (this.execPath.split(/[\\/]/).pop() || "").toLowerCase();
    const mode: LaunchMode = execBase.includes("bun") ? "bun-script" : "compiled-binary";

    if (!this.execPath) {
      return {
        supported: false,
        command: "",
        args: this.argv,
        cwd: this.cwd,
        mode,
        reason: "実行ファイルのパスを特定できませんでした。",
      };
    }

    if (!this.existsSyncFn(this.execPath)) {
      return {
        supported: false,
        command: this.execPath,
        args: this.argv,
        cwd: this.cwd,
        mode,
        reason:
          "実行ファイルが見つからないため再起動できません（一時実行環境や削除済みバイナリの可能性があります）。手動でアプリを再起動してください。",
      };
    }

    if (!SUPPORTED_PLATFORMS.includes(this.platform)) {
      return {
        supported: false,
        command: this.execPath,
        args: this.argv,
        cwd: this.cwd,
        mode,
        reason: `未対応の OS のため再起動できません: ${this.platform}`,
      };
    }

    return {
      supported: true,
      command: this.execPath,
      args: this.argv,
      cwd: this.cwd,
      mode,
    };
  }

  /** 直近の後継プロセス起動失敗の理由。成功時や未実行時は null。 */
  public getLastError(): string | null {
    return this.lastError;
  }

  /**
   * 停止フックを順番に実行してポート・リソースを解放した後、後継プロセスを起動して現在のプロセスを終了する。
   * 後継プロセスの起動に失敗した場合は現在のプロセスを終了せず、エラー内容を getLastError() に残す。
   */
  public async performRestart(hooks: RestartHooks): Promise<RestartResult> {
    const info = this.getLaunchInfo();
    if (!info.supported) {
      this.lastError = info.reason ?? "再起動はサポートされていません。";
      return { success: false, error: this.lastError };
    }

    // 1. HTTP/棒読みサーバーを停止し、ポートを解放する
    await this.runHook("HTTP サーバーの停止", hooks.stopHttpServers);

    // 2. Twitch 接続を切断する
    await this.runHook("Twitch 切断", hooks.disconnectTwitch);

    // 3. 再生中の音声とキューを停止・破棄する
    await this.runHook("キューの停止", hooks.clearQueue);

    // 4. 同じ実行ファイル・引数・作業ディレクトリで後継プロセスを起動する
    try {
      const child = this.spawnFn(info.command, info.args, {
        cwd: info.cwd,
        env: this.env,
        stdio: ["ignore", "inherit", "inherit"],
      });
      child.unref?.();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error("❌ [Restart] 後継プロセスの起動に失敗しました:", err);
      console.error(
        `💡 【対処法】アプリを手動で再起動してください。実行ファイル: ${info.command} / 引数: ${info.args.join(" ")} / 作業ディレクトリ: ${info.cwd}`
      );
      if (hooks.recoverAfterFailedRestart) {
        try {
          await hooks.recoverAfterFailedRestart();
          console.log("♻️ [Restart] 後継プロセスの起動に失敗したため、現在のプロセスで HTTP サーバー等を復旧しました。");
        } catch (recoverErr) {
          console.error("❌ [Restart] 復旧処理中にエラーが発生しました:", recoverErr);
        }
      }
      return { success: false, error: this.lastError };
    }

    this.lastError = null;
    this.exitFn(0);
    return { success: true };
  }

  /**
   * 停止フックを順番に実行してリソースを解放した後、後継プロセスを起動せずに現在のプロセスを終了する。
   * 再起動後は対話型コンソールが使えなくなるため、Web 管理画面から安全にアプリを終了させる手段として使う。
   */
  public async performShutdown(hooks: RestartHooks): Promise<void> {
    // 1. HTTP/棒読みサーバーを停止し、ポートを解放する
    await this.runHook("HTTP サーバーの停止", hooks.stopHttpServers);

    // 2. Twitch 接続を切断する
    await this.runHook("Twitch 切断", hooks.disconnectTwitch);

    // 3. 再生中の音声とキューを停止・破棄する
    await this.runHook("キューの停止", hooks.clearQueue);

    console.log("✅ [Shutdown] 停止処理が完了しました。このプロセスは終了します（後継プロセスは起動しません）。");
    console.log("💡 [Shutdown] ターミナルの表示がそのまま変化しないように見えても、プロセスは既に終了しています。そのままウィンドウを閉じて問題ありません。");
    this.exitFn(0);
  }
}
