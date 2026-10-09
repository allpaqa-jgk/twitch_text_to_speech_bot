import type { Server } from "bun";
import { SettingsStore, settingsStore } from "../settingsStore";
import type { EngineHolder } from "../tts/engineHolder";
import type { TTSQueue } from "../tts/queue";
import type { TextTransformer } from "../tts/transformers/types";
import { processComment } from "../application/commentProcessingService";
import { renderWebConsoleHtml } from "./webConsoleHtml";
import type { DictionaryService } from "../application/dictionaryService";
import type { TwitchControlService } from "../application/twitchControlService";
import type { SpeechInteractionService } from "../application/speechInteractionService";
import {
  ConfigSettingsService,
  SettingsValidationError,
} from "../application/configSettingsService";
import { RestartService } from "../application/restartService";
import type { EngineManager } from "../tts/engineManager";

export interface HttpServerOptions {
  queue: TTSQueue;
  transformer?: TextTransformer;
  store?: SettingsStore;
  engineHolder?: EngineHolder;
  engineManager?: EngineManager;
  dictionaryService: DictionaryService;
  twitchControlService: TwitchControlService;
  speechInteractionService: SpeechInteractionService;
  configSettingsService?: ConfigSettingsService;
  restartService?: RestartService;
  port?: number;
  bouyomiPort?: number;
  enableBouyomiCompat?: boolean;
  /** 再起動要求から後継プロセス起動までの遅延（ミリ秒）。HTTP応答をクライアントに届けるための猶予。テスト用にも調整可能。 */
  restartDelayMs?: number;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export class HttpServer {
  private mainServer: Server | null = null;
  private bouyomiServer: Server | null = null;
  private queue: TTSQueue;
  private transformer?: TextTransformer;
  private store: SettingsStore;
  private engineHolder?: EngineHolder;
  private engineManager?: EngineManager;
  private dictionaryService: DictionaryService;
  private twitchControlService: TwitchControlService;
  private speechInteractionService: SpeechInteractionService;
  private configSettingsService: ConfigSettingsService;
  private restartService: RestartService;
  private port: number;
  private bouyomiPort: number;
  private enableBouyomiCompat: boolean;
  private restartDelayMs: number;
  // 再起動・終了リクエストの多重実行を防ぐためのロック。一度どちらかが受理されると
  // 後続の再起動・終了リクエストは新しいプロセス起動まで拒否される。
  private lifecycleActionInProgress: "restart" | "shutdown" | null = null;

  constructor(options: HttpServerOptions) {
    this.queue = options.queue;
    this.transformer = options.transformer;
    this.store = options.store ?? settingsStore;
    this.engineHolder = options.engineHolder;
    this.engineManager = options.engineManager;
    this.dictionaryService = options.dictionaryService;
    this.twitchControlService = options.twitchControlService;
    this.speechInteractionService = options.speechInteractionService;
    this.configSettingsService =
      options.configSettingsService ??
      new ConfigSettingsService(
        undefined,
        this.store,
        undefined,
        undefined,
        this.engineHolder,
        this.engineManager
      );
    this.restartService = options.restartService ?? new RestartService();
    const cur = this.store.current();
    this.port = options.port ?? cur.HTTP_SERVER_PORT;
    this.bouyomiPort = options.bouyomiPort ?? cur.BOUYOMI_COMPAT_PORT;
    this.enableBouyomiCompat = options.enableBouyomiCompat ?? cur.BOUYOMI_COMPAT_ENABLED;
    this.restartDelayMs = options.restartDelayMs ?? 150;
  }

  public isRunning(): boolean {
    return this.mainServer !== null;
  }

  public isBouyomiRunning(): boolean {
    return this.bouyomiServer !== null;
  }

  public getMainPort(): number {
    return this.port;
  }

  public getBouyomiPort(): number {
    return this.bouyomiPort;
  }

  public start(): void {
    // 1. Start Main HTTP Webhook server (default: 3939)
    try {
      this.mainServer = Bun.serve({
        port: this.port,
        hostname: "127.0.0.1",
        fetch: async (req) => {
          return this.handleMainRequest(req);
        },
      });
      console.log(`* [HTTP] HTTP 読み上げサーバー: http://127.0.0.1:${this.port}/say (わんコメ / CastCraft / Webhook連携用)`);
      console.log(`🌐 [Web] 管理コンソール: http://localhost:${this.port} (対話コンソールで「web」と入力するとブラウザで開きます)`);
    } catch (err: any) {
      if (
        err?.code === "EADDRINUSE" ||
        String(err?.message || err).includes("EADDRINUSE") ||
        String(err?.message || err).includes("address already in use")
      ) {
        console.error(
          `❌ [HTTP] ポート ${this.port} は既に他のアプリ（起動中の本アプリの別プロセス等）で使用されているため、HTTP 読み上げサーバー / Web 管理コンソールを起動できませんでした。`
        );
        console.error(
          `💡 【対処法】ポート ${this.port} を使用している他のプロセスを終了するか、config/default.js の HTTP_SERVER_PORT を別の値に変更してから再起動してください。`
        );
      } else {
        console.error(
          `❌ [HTTP] HTTP 読み上げサーバー (ポート ${this.port}) の起動に失敗しました: ${err?.message || err}`
        );
      }
    }

    // 2. Start BouyomiChan compatibility server (default: 50080)
    if (this.enableBouyomiCompat) {
      try {
        this.bouyomiServer = Bun.serve({
          port: this.bouyomiPort,
          hostname: "127.0.0.1",
          fetch: async (req) => {
            return this.handleBouyomiRequest(req);
          },
        });
        console.log(`* [HTTP] 棒読みちゃん互換サーバー: http://127.0.0.1:${this.bouyomiPort}/Talk (わんコメ等の棒読み連携用)`);
      } catch (err: any) {
        if (
          err?.code === "EADDRINUSE" ||
          String(err?.message || err).includes("EADDRINUSE") ||
          String(err?.message || err).includes("address already in use")
        ) {
          console.warn(
            "⚠️  [HTTP] ポート 50080 は既に別のアプリ（棒読みちゃん等）で使用されています。わんコメ側でポート 3939 (/say) を設定するか、棒読みちゃんを停止してください。"
          );
        } else {
          console.warn(
            `⚠️  [HTTP] 棒読みちゃん互換サーバーの起動に失敗しました: ${err?.message || err}`
          );
        }
      }
    }
  }

  public stop(): void {
    if (this.mainServer) {
      try {
        this.mainServer.stop(true);
      } catch {
        // ignore
      }
      this.mainServer = null;
    }

    if (this.bouyomiServer) {
      try {
        this.bouyomiServer.stop(true);
      } catch {
        // ignore
      }
      this.bouyomiServer = null;
    }
  }

  private async handleMainRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Preflight request
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // GET / (Web Management Console)
    if (req.method === "GET" && url.pathname === "/") {
      return new Response(renderWebConsoleHtml(), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...CORS_HEADERS,
        },
      });
    }

    // Health / Legacy Status endpoint
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
      return new Response(
        JSON.stringify({ status: "ok", queuePending: this.queue.pendingCount }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    if (req.method === "GET" && url.pathname === "/api/settings") {
      if (!this.isSameOriginRequest(req)) {
        return new Response(JSON.stringify({ error: "Cross-origin settings requests are not allowed." }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
      try {
        return new Response(JSON.stringify(this.configSettingsService.getSnapshot()), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
    }

    if (req.method === "PUT" && url.pathname === "/api/settings") {
      if (!this.isSameOriginRequest(req)) {
        return new Response(JSON.stringify({ error: "Cross-origin settings requests are not allowed." }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
      let body: unknown;
      try {
        const rawBody = await req.text();
        if (rawBody.length > 64 * 1024) {
          return new Response(JSON.stringify({ error: "Settings payload too large." }), {
            status: 413,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          });
        }
        body = JSON.parse(rawBody);
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }

      try {
        const snapshot = this.configSettingsService.update(body);
        return new Response(JSON.stringify({ success: true, ...snapshot }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      } catch (error) {
        const validationError = error instanceof SettingsValidationError;
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: message }), {
          status: validationError ? 400 : 500,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
    }

    if (req.method === "DELETE" && url.pathname === "/api/settings") {
      if (!this.isSameOriginRequest(req)) {
        return new Response(JSON.stringify({ error: "Cross-origin settings requests are not allowed." }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
      try {
        const key = url.searchParams.get("key") ?? undefined;
        const snapshot = this.configSettingsService.remove(key);
        return new Response(JSON.stringify({ success: true, ...snapshot }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      } catch (error) {
        const validationError = error instanceof SettingsValidationError;
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: message }), {
          status: validationError ? 400 : 500,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
    }

    // GET /api/status
    if (req.method === "GET" && url.pathname === "/api/status") {
      const cur = this.store.current();
      const primaryName = this.engineManager
        ? this.engineManager.current().primaryName
        : this.engineHolder
        ? this.engineHolder.current().primaryName
        : cur.TTS_ENGINE;

      const currentSet = this.engineManager
        ? this.engineManager.current()
        : this.engineHolder?.current();
      const isEnglishNeeded =
        cur.FOREIGN_LANGUAGE_MODE === "NATIVE" || cur.BILINGAL_MODE;
      const englishEngine = currentSet?.english
        ? (currentSet.englishName ?? cur.ENGLISH_TTS_ENGINE)
        : isEnglishNeeded
        ? "unavailable"
        : null;

      return new Response(
        JSON.stringify({
          status: "ok",
          queuePending: this.queue.pendingCount,
          engine: primaryName,
          enginePending: this.engineManager?.pending() ?? null,
          englishEngine,
          englishEnginePending: this.engineManager?.englishPending() ?? null,
          port: this.port,
          bouyomiPort: this.bouyomiPort,
          bouyomiRunning: this.isBouyomiRunning(),
          twitchConnected: this.twitchControlService.isConnected(),
          twitchChannel: cur.TW_CHANNEL_NAME || null,
          restartPending: this.lifecycleActionInProgress !== null,
          restartSupported: this.restartService.getLaunchInfo().supported,
          restartError: this.restartService.getLastError(),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // POST /api/restart
    if (req.method === "POST" && url.pathname === "/api/restart") {
      if (!this.isSameOriginRequest(req)) {
        return new Response(JSON.stringify({ error: "Cross-origin restart requests are not allowed." }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }

      if (this.lifecycleActionInProgress !== null) {
        return this.lifecycleConflictResponse();
      }

      const launchInfo = this.restartService.getLaunchInfo();
      if (!launchInfo.supported) {
        return new Response(
          JSON.stringify({
            success: false,
            error: launchInfo.reason || "この起動方法では再起動をサポートしていません。",
          }),
          {
            status: 409,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      // HTTP応答をクライアントに届けてから、非同期に停止・再起動処理を開始する。
      this.lifecycleActionInProgress = "restart";
      this.scheduleRestart();

      return new Response(
        JSON.stringify({
          success: true,
          message: "再起動を受け付けました。数秒後にアプリが再起動します。",
          mode: launchInfo.mode,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // POST /api/shutdown
    if (req.method === "POST" && url.pathname === "/api/shutdown") {
      if (!this.isSameOriginRequest(req)) {
        return new Response(JSON.stringify({ error: "Cross-origin shutdown requests are not allowed." }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }

      // HTTP応答をクライアントに届けてから、非同期に停止・終了処理を開始する。
      if (this.lifecycleActionInProgress !== null) {
        return this.lifecycleConflictResponse();
      }

      this.lifecycleActionInProgress = "shutdown";
      this.scheduleShutdown();

      return new Response(
        JSON.stringify({
          success: true,
          message: "終了を受け付けました。数秒後にアプリが終了します。",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // POST /api/clear
    if (req.method === "POST" && url.pathname === "/api/clear") {
      this.speechInteractionService.clearQueue();
      return new Response(
        JSON.stringify({ success: true, message: "Queue cleared" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // POST /api/demo
    if (req.method === "POST" && url.pathname === "/api/demo") {
      if (!this.store.current().HTTP_TALK_ENABLED) {
        return new Response(JSON.stringify({ error: "HTTP speech endpoints are disabled." }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
      await this.speechInteractionService.enqueueDemo();
      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // POST /api/twitch/toggle
    if (req.method === "POST" && url.pathname === "/api/twitch/toggle") {
      const connected = await this.twitchControlService.toggle();
      return new Response(
        JSON.stringify({
          success: true,
          connected,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // POST /api/preview
    if (req.method === "POST" && url.pathname === "/api/preview") {
      let body: any = {};
      try {
        const rawText = await req.text();
        if (rawText) {
          body = JSON.parse(rawText);
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      let lines: string[] = [];
      if (Array.isArray(body?.lines)) {
        lines = body.lines.map((l: any) => String(l ?? ""));
      } else if (typeof body?.text === "string") {
        lines = body.text.split(/\r?\n/);
      }

      // Clamp: maximum 20 lines, each line maximum 200 characters
      const clampedLines = lines.slice(0, 20).map((l) => l.slice(0, 200));

      const results = await this.speechInteractionService.preview(clampedLines);

      return new Response(
        JSON.stringify({ results }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // GET /api/dictionary
    if (req.method === "GET" && url.pathname === "/api/dictionary") {
      const result = this.dictionaryService.list(url.searchParams.get("type"));
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    }

    // POST /api/dictionary
    if (req.method === "POST" && url.pathname === "/api/dictionary") {
      let body: any;
      try {
        const rawText = await req.text();
        body = JSON.parse(rawText);
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      const result = this.dictionaryService.upsert(
        body?.type,
        body?.keyword,
        body?.read
      );
      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // DELETE /api/dictionary
    if (req.method === "DELETE" && url.pathname === "/api/dictionary") {
      let typeParam: unknown = url.searchParams.get("type");
      let keyword: unknown = url.searchParams.get("keyword");

      if (typeof keyword !== "string" || !keyword.trim()) {
        try {
          const rawText = await req.text();
          if (rawText) {
            const body = JSON.parse(rawText);
            if (body?.type) typeParam = body.type;
            if (body?.keyword) keyword = body.keyword;
          }
        } catch {
          // ignore
        }
      }

      if (typeof keyword !== "string" || !keyword.trim()) {
        return new Response(
          JSON.stringify({ error: "keyword is required" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      this.dictionaryService.remove(typeParam, keyword);

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // POST /say
    if (req.method === "POST" && url.pathname === "/say") {
      if (!this.store.current().HTTP_TALK_ENABLED) {
        return new Response(JSON.stringify({ error: "HTTP speech endpoints are disabled." }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }
      const contentLength = req.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 512 * 1024) {
        return new Response(
          JSON.stringify({ error: "Payload too large" }),
          {
            status: 413,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      let body: any;
      try {
        const rawBodyText = await req.text();
        if (rawBodyText.length > 512 * 1024) {
          return new Response(
            JSON.stringify({ error: "Payload too large" }),
            {
              status: 413,
              headers: {
                "Content-Type": "application/json",
                ...CORS_HEADERS,
              },
            }
          );
        }
        body = JSON.parse(rawBodyText);
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      const rawText = (body?.text ?? body?.comment ?? body?.message ?? "").toString().trim();
      if (!rawText) {
        return new Response(
          JSON.stringify({ error: "text is required" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      const rawUsername = (body?.username ?? body?.name ?? body?.user ?? "Guest").toString().trim() || "Guest";
      const service = (body?.service ?? "HTTP").toString().trim() || "HTTP";

      // Fire-and-forget enqueue into TTSQueue via commentProcessor
      processComment(
        { rawUsername, rawText, service },
        {
          ttsQueue: this.queue,
          transformer: this.transformer,
        }
      )
        .then((res) => {
          if (!res.ignored) {
            console.log(`[${service}] ${res.displayName}: ${rawText}`);
          }
        })
        .catch((err) => {
          console.error(`[HTTP] Error processing comment:`, err);
        });

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // 404 for all other paths
    return new Response(
      JSON.stringify({ error: "Not Found" }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      }
    );
  }

  /**
   * HTTP応答が送信された後に、HTTP/棒読みサーバーの停止・Twitch切断・キュー停止を行い、
   * 同じ実行ファイル・引数・作業ディレクトリで後継プロセスを起動する。
   */
  private scheduleRestart(): void {
    console.log("♻️ [Restart] Web 管理コンソールからの再起動要求を受け付けました。HTTP/棒読みちゃんサーバーを停止し、Twitchを切断してキューを停止します...");
    console.log("\x1b[31m⚠️ [Restart] 後継プロセス起動後、手動でアプリを起動し直すまで対話型コンソール（ターミナルでのコマンド入力）は利用できません。CUIから終了したい場合は、事前に Web 管理コンソールの「⏹ アプリを終了」ボタンをご利用ください。読み上げ内容は引き続きターミナルに出力されます。\x1b[0m");
    setTimeout(() => {
      void this.restartService
        .performRestart({
          stopHttpServers: () => this.stop(),
          disconnectTwitch: () => this.twitchControlService.disconnectForShutdown(),
          clearQueue: () => {
            this.speechInteractionService.clearQueue();
            this.engineManager?.stopAll();
          },
          recoverAfterFailedRestart: () => this.start(),
        })
        .then((result) => {
          if (!result.success) {
            console.error(
              `❌ [Restart] 再起動に失敗しました: ${result.error ?? "unknown error"}`
            );
            // 後継プロセスは起動しなかったため、このプロセスで再度の再起動・終了要求を受け付けられるようにする。
            this.lifecycleActionInProgress = null;
          }
        });
    }, this.restartDelayMs);
  }

  /**
   * HTTP応答が送信された後に、HTTP/棒読みサーバーの停止・Twitch切断・キュー停止を行い、
   * 後継プロセスを起動せずにアプリを終了する。
   */
  private scheduleShutdown(): void {
    console.log("⏹ [Shutdown] Web 管理コンソールからの終了要求を受け付けました。HTTP/棒読みちゃんサーバーを停止し、Twitchを切断してキューを停止します...");
    setTimeout(() => {
      void this.restartService.performShutdown({
        stopHttpServers: () => this.stop(),
        disconnectTwitch: () => this.twitchControlService.disconnectForShutdown(),
        clearQueue: () => {
          this.speechInteractionService.clearQueue();
          this.engineManager?.stopAll();
        },
      });
    }, this.restartDelayMs);
  }

  private lifecycleConflictResponse(): Response {
    return new Response(
      JSON.stringify({
        success: false,
        error: "再起動または終了処理が既に進行中です。しばらくお待ちください。",
      }),
      {
        status: 409,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      }
    );
  }

  private isSameOriginRequest(req: Request): boolean {
    const requestUrl = new URL(req.url);
    if (
      requestUrl.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(requestUrl.hostname) ||
      Number(requestUrl.port || 80) !== this.port
    ) {
      return false;
    }
    const origin = req.headers.get("origin");
    return !origin || origin === requestUrl.origin;
  }

  private async handleBouyomiRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (req.method === "GET" && (url.pathname === "/Talk" || url.pathname === "/talk")) {
      const rawTextParam = url.searchParams.get("text");
      if (!rawTextParam || !rawTextParam.trim()) {
        return new Response("Error: text is required", {
          status: 400,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...CORS_HEADERS,
          },
        });
      }

      let text = rawTextParam.trim();
      try {
        if (text.includes("%")) {
          text = decodeURIComponent(text);
        }
      } catch {
        // use decoded text as is
      }

      // Fire-and-forget enqueue into TTSQueue via commentProcessor
      processComment(
        { rawUsername: "OneComme", rawText: text, service: "OneComme/Bouyomi" },
        {
          ttsQueue: this.queue,
          transformer: this.transformer,
        }
      )
        .then((res) => {
          if (!res.ignored) {
            console.log(`[OneComme] ${text}`);
          }
        })
        .catch((err) => {
          console.error(`[BouyomiCompat] Error processing comment:`, err);
        });

      return new Response("OK", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...CORS_HEADERS,
        },
      });
    }

    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...CORS_HEADERS,
      },
    });
  }
}
