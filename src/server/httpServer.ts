import type { Server } from "bun";
import { config } from "../config";
import type { TTSQueue } from "../tts/queue";
import type { TextTransformer } from "../tts/transformers/types";
import type { TTSEngine } from "../tts/engine";
import { processComment } from "../tts/commentProcessor";

export interface HttpServerOptions {
  queue: TTSQueue;
  transformer?: TextTransformer;
  englishEngine?: TTSEngine;
  port?: number;
  bouyomiPort?: number;
  enableBouyomiCompat?: boolean;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export class HttpServer {
  private mainServer: Server | null = null;
  private bouyomiServer: Server | null = null;
  private queue: TTSQueue;
  private transformer?: TextTransformer;
  private englishEngine?: TTSEngine;
  private port: number;
  private bouyomiPort: number;
  private enableBouyomiCompat: boolean;

  constructor(options: HttpServerOptions) {
    this.queue = options.queue;
    this.transformer = options.transformer;
    this.englishEngine = options.englishEngine;
    this.port = options.port ?? config.HTTP_SERVER_PORT;
    this.bouyomiPort = options.bouyomiPort ?? config.BOUYOMI_COMPAT_PORT;
    this.enableBouyomiCompat = options.enableBouyomiCompat ?? config.BOUYOMI_COMPAT_ENABLED;
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
    } catch (err: any) {
      console.error(`❌ [HTTP] HTTP 読み上げサーバー (ポート ${this.port}) の起動に失敗しました:`, err);
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
          console.warn("⚠️  [HTTP] 棒読みちゃん互換サーバーの起動に失敗しました:", err);
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

    // Health / Status endpoint
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

    // POST /say
    if (req.method === "POST" && url.pathname === "/say") {
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
          englishEngine: this.englishEngine,
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
          englishEngine: this.englishEngine,
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
