import type { TTSEngine, PreparedAudio, SpeechOptions } from "../engine";
import { playWavBuffer } from "../audioPlayer";
import { paths } from "../../paths";
import path from "path";
import fs from "fs";

interface KokoroWorkerResponse {
  status: "ok" | "error";
  error?: string;
}

export class KokoroEngine implements TTSEngine {
  public readonly name = "Kokoro";

  private pythonPath: string;
  private scriptPath: string;
  private voice: string;
  private speed: number;
  private lang: string;
  private masterVolume: number;
  private tmpDir: string;
  private disposed = false;

  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private isReady = false;
  private readyPromise: Promise<void> | null = null;
  private startupReject: ((err: Error) => void) | null = null;
  private currentRequest: {
    resolve: (res: KokoroWorkerResponse) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(
    voice = "af_heart",
    speed = 1.0,
    lang = "a",
    pythonPath = paths.pythonBin(),
    scriptPath = path.join(paths.scriptsDir(), "kokoro_worker.py"),
    masterVolume = 1.0,
    tmpDir = paths.tmpDir()
  ) {
    this.voice = voice;
    this.speed = speed;
    this.lang = lang;
    this.pythonPath = pythonPath;
    this.scriptPath = scriptPath;
    this.masterVolume = masterVolume;
    this.tmpDir = tmpDir;
  }

  public async isAvailable(): Promise<boolean> {
    return fs.existsSync(this.pythonPath) && fs.existsSync(this.scriptPath);
  }

  private async ensureWorkerStarted(): Promise<void> {
    if (this.isReady && this.proc) {
      return;
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.startupReject = reject;
      try {
        const env = {
          ...process.env,
          ESPEAK_DATA_PATH: "/opt/homebrew/share/espeak-ng-data",
        };

        const proc = Bun.spawn([this.pythonPath, this.scriptPath], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "inherit",
          env,
        });
        this.proc = proc;

        // Reader loop for worker stdout
        (async () => {
          const reader = proc.stdout.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (this.proc !== proc) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (this.proc !== proc) break;
              const trimmed = line.trim();
              if (!trimmed) continue;

              if (trimmed === "READY") {
                this.isReady = true;
                this.startupReject = null;
                resolve();
                continue;
              }

              // Handle JSON responses
              if (this.currentRequest) {
                const req = this.currentRequest;
                this.currentRequest = null;
                try {
                  const res = JSON.parse(trimmed);
                  req.resolve(res);
                } catch (e: any) {
                  req.reject(e instanceof Error ? e : new Error(String(e)));
                }
              }
            }
          }
        })().catch((err) => {
          if (this.proc !== proc) return;
          console.error("[KokoroEngine] Worker reader error:", err);
          this.isReady = false;
          if (this.startupReject) {
            this.startupReject(err instanceof Error ? err : new Error(String(err)));
            this.startupReject = null;
          }
          if (this.currentRequest) {
            this.currentRequest.reject(err instanceof Error ? err : new Error(String(err)));
            this.currentRequest = null;
          }
          this.readyPromise = null;
        });

        proc.exited.then((code: number) => {
          if (this.proc !== proc) return;
          console.warn(`[KokoroEngine] Worker exited with code ${code}`);
          this.isReady = false;
          this.proc = null;
          this.readyPromise = null;
          const exitErr = new Error(`[KokoroEngine] Worker exited unexpectedly with code ${code}`);
          if (this.startupReject) {
            this.startupReject(exitErr);
            this.startupReject = null;
          }
          if (this.currentRequest) {
            this.currentRequest.reject(exitErr);
            this.currentRequest = null;
          }
        });
      } catch (err: any) {
        this.readyPromise = null;
        this.startupReject = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    return this.readyPromise;
  }

  public async prepare(text: string, options?: SpeechOptions): Promise<PreparedAudio> {
    if (this.disposed) {
      throw new Error("[KokoroEngine] Engine has been disposed");
    }

    if (!text || !text.trim()) {
      return { play: async () => {} };
    }

    await this.ensureWorkerStarted();

    const tmpDir = this.tmpDir;
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const outputPath = path.join(
      tmpDir,
      `kokoro_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
    );

    const effectiveVolume = Math.min(1.0, Math.max(0.0, this.masterVolume));

    const effectiveSpeed = Math.min(
      2.0,
      Math.max(0.5, this.speed * (options?.speedScale ?? 1.0))
    );

    const payload = JSON.stringify({
      text,
      outputPath,
      voice: this.voice,
      speed: effectiveSpeed,
      lang: this.lang,
      volume: effectiveVolume,
    });

    // Wait for response from resident worker.
    // NOTE: TTSQueue guarantees serial execution, so concurrent calls should not
    // happen in practice. This guard prevents silent promise leaks if they ever do.
    const response = await new Promise<KokoroWorkerResponse>((resolve, reject) => {
      if (this.currentRequest) {
        this.currentRequest.reject(new Error("[KokoroEngine] Overwritten by a new request before response was received."));
      }
      this.currentRequest = { resolve, reject };
      this.proc!.stdin.write(payload + "\n");
      this.proc!.stdin.flush();
    });

    if (response.status !== "ok") {
      throw new Error(`Kokoro worker error: ${response.error}`);
    }

    const wavBuffer = fs.readFileSync(outputPath);
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // ignore
    }

    return {
      play: () => playWavBuffer(wavBuffer),
    };
  }

  public async say(text: string, options?: SpeechOptions): Promise<void> {
    const audio = await this.prepare(text, options);
    await audio.play();
  }

  public stop(): void {
    const procToKill = this.proc;
    this.proc = null;
    this.isReady = false;
    this.readyPromise = null;

    if (this.startupReject) {
      const reject = this.startupReject;
      this.startupReject = null;
      reject(new Error("[KokoroEngine] Worker stopped during startup"));
    }

    if (this.currentRequest) {
      const req = this.currentRequest;
      this.currentRequest = null;
      req.reject(new Error("[KokoroEngine] Worker stopped while request was in-flight"));
    }

    if (procToKill) {
      try {
        procToKill.kill();
      } catch {
        // ignore
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.stop();
  }
}
