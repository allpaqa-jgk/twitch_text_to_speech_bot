import type { Server } from "bun";
import { config } from "../config";
import type { TTSQueue } from "../tts/queue";
import type { TextTransformer } from "../tts/transformers/types";
import type { TTSEngine } from "../tts/engine";
import { processComment } from "../tts/commentProcessor";
import type { TwitchTTSBot } from "../twitch/client";
import { renderWebConsoleHtml } from "./webConsoleHtml";
import { enqueueDemo } from "../tts/demo";
import { detectLanguage } from "../twitch/languageDetector";
import { csvList, type ListType } from "../storage/csvList";

export interface HttpServerOptions {
  queue: TTSQueue;
  transformer?: TextTransformer;
  englishEngine?: TTSEngine;
  bot?: TwitchTTSBot | null;
  port?: number;
  bouyomiPort?: number;
  enableBouyomiCompat?: boolean;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export class HttpServer {
  private mainServer: Server | null = null;
  private bouyomiServer: Server | null = null;
  private queue: TTSQueue;
  private transformer?: TextTransformer;
  private englishEngine?: TTSEngine;
  private bot: TwitchTTSBot | null = null;
  private port: number;
  private bouyomiPort: number;
  private enableBouyomiCompat: boolean;

  constructor(options: HttpServerOptions) {
    this.queue = options.queue;
    this.transformer = options.transformer;
    this.englishEngine = options.englishEngine;
    this.bot = options.bot ?? null;
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
      console.log(`🌐 [Web] 管理コンソール: http://localhost:${this.port} (対話コンソールで「web」と入力するとブラウザで開きます)`);
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

    // GET /api/status
    if (req.method === "GET" && url.pathname === "/api/status") {
      return new Response(
        JSON.stringify({
          status: "ok",
          queuePending: this.queue.pendingCount,
          engine: config.TTS_ENGINE,
          port: this.port,
          bouyomiPort: this.bouyomiPort,
          bouyomiRunning: this.isBouyomiRunning(),
          twitchConnected: this.bot ? this.bot.isConnected() : false,
          twitchChannel: config.TW_CHANNEL_NAME || null,
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
      this.queue.clear();
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
      await enqueueDemo(this.queue, this.transformer);
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
      if (this.bot) {
        if (this.bot.isConnected()) {
          await this.bot.disconnect();
        } else {
          await this.bot.connect();
        }
      }
      return new Response(
        JSON.stringify({
          success: true,
          connected: this.bot ? this.bot.isConnected() : false,
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

      const results = [];
      for (let i = 0; i < clampedLines.length; i++) {
        const original = clampedLines[i];
        const trimmed = original.trim();
        const lang = detectLanguage(trimmed);
        const transformed = trimmed
          ? (this.transformer ? await this.transformer.transform(trimmed) : trimmed)
          : "";
        results.push({
          line: i + 1,
          original,
          transformed,
          lang,
        });
      }

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
      const typeParam = url.searchParams.get("type");
      let listType: ListType;
      let responseType = "message";
      if (typeParam === "username") {
        listType = "usernameConvertList";
        responseType = "username";
      } else if (typeParam === "ignore") {
        listType = "messageIgnoreList";
        responseType = "ignore";
      } else {
        listType = "messageConvertList";
        responseType = "message";
      }

      const list = csvList.readList(listType);
      return new Response(
        JSON.stringify({
          type: responseType,
          items: list.map(([keyword, read]) => ({
            keyword: keyword ?? "",
            read: read ?? "",
          })),
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

      const keyword = (body?.keyword ?? "").toString().trim();
      const read = (body?.read ?? "").toString().trim();
      const typeParam = body?.type;

      let listType: ListType;
      if (typeParam === "username") {
        listType = "usernameConvertList";
      } else if (typeParam === "ignore") {
        listType = "messageIgnoreList";
      } else {
        listType = "messageConvertList";
      }

      const isIgnore = listType === "messageIgnoreList";

      if (!keyword || (!isIgnore && !read)) {
        return new Response(
          JSON.stringify({ error: isIgnore ? "keyword is required" : "keyword and read are required" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      if (keyword.length > 100) {
        return new Response(
          JSON.stringify({ error: "Keyword too long (max 100 chars)" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      if (!isIgnore && read.length > 200) {
        return new Response(
          JSON.stringify({ error: "Read text too long (max 200 chars)" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      const storedKey = isIgnore ? keyword : keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const list = csvList.readList(listType);
      const index = list.findIndex((row) => row[0] === storedKey || row[0] === keyword);
      if (index >= 0) {
        list[index] = [storedKey, isIgnore ? "" : read];
      } else {
        list.push([storedKey, isIgnore ? "" : read]);
      }
      csvList.writeList(listType, list);

      return new Response(
        JSON.stringify({ success: true, keyword, read: isIgnore ? "" : read }),
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
      let typeParam = url.searchParams.get("type");
      let keyword = url.searchParams.get("keyword")?.trim();

      if (!keyword) {
        try {
          const rawText = await req.text();
          if (rawText) {
            const body = JSON.parse(rawText);
            if (body?.type) typeParam = body.type;
            if (body?.keyword) keyword = String(body.keyword).trim();
          }
        } catch {
          // ignore
        }
      }

      if (!keyword) {
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

      let listType: ListType;
      if (typeParam === "username") {
        listType = "usernameConvertList";
      } else if (typeParam === "ignore") {
        listType = "messageIgnoreList";
      } else {
        listType = "messageConvertList";
      }

      const isIgnore = listType === "messageIgnoreList";
      const storedKey = isIgnore ? keyword : keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const list = csvList.readList(listType);
      const index = list.findIndex((row) => row[0] === storedKey || row[0] === keyword);
      if (index >= 0) {
        list.splice(index, 1);
        csvList.writeList(listType, list);
      }

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
