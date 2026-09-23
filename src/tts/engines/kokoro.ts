import type { TTSEngine } from "../engine";
import { playWavBuffer } from "../audioPlayer";
import { paths } from "../../paths";
import path from "path";
import fs from "fs";

export class KokoroEngine implements TTSEngine {
  public readonly name = "Kokoro";

  private pythonPath: string;
  private scriptPath: string;
  private voice: string;
  private speed: number;
  private lang: string;

  private proc: any = null;
  private isReady = false;
  private readyPromise: Promise<void> | null = null;
  private currentRequest: {
    resolve: (res: any) => void;
    reject: (err: any) => void;
  } | null = null;

  constructor(
    voice = "af_heart",
    speed = 1.0,
    lang = "a",
    pythonPath = paths.pythonBin(),
    scriptPath = path.join(paths.scriptsDir(), "kokoro_worker.py")
  ) {
    this.voice = voice;
    this.speed = speed;
    this.lang = lang;
    this.pythonPath = pythonPath;
    this.scriptPath = scriptPath;
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
      try {
        const env = {
          ...process.env,
          ESPEAK_DATA_PATH: "/opt/homebrew/share/espeak-ng-data",
        };

        this.proc = Bun.spawn([this.pythonPath, this.scriptPath], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "inherit",
          env,
        });

        // Reader loop for worker stdout
        (async () => {
          const reader = this.proc.stdout.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              if (trimmed === "READY") {
                this.isReady = true;
                resolve();
                continue;
              }

              // Handle JSON responses
              if (this.currentRequest) {
                try {
                  const res = JSON.parse(trimmed);
                  this.currentRequest.resolve(res);
                } catch (e) {
                  this.currentRequest.reject(e);
                }
                this.currentRequest = null;
              }
            }
          }
        })().catch((err) => {
          console.error("[KokoroEngine] Worker reader error:", err);
          this.isReady = false;
          reject(err);
        });

        this.proc.exited.then((code: number) => {
          console.warn(`[KokoroEngine] Worker exited with code ${code}`);
          this.isReady = false;
          this.proc = null;
          this.readyPromise = null;
        });
      } catch (err) {
        this.readyPromise = null;
        reject(err);
      }
    });

    return this.readyPromise;
  }

  public async say(text: string): Promise<void> {
    if (!text || !text.trim()) {
      return;
    }

    await this.ensureWorkerStarted();

    const tmpDir = paths.tmpDir();
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const outputPath = path.join(
      tmpDir,
      `kokoro_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
    );

    const payload = JSON.stringify({
      text,
      outputPath,
      voice: this.voice,
      speed: this.speed,
      lang: this.lang,
    });

    // Wait for response from resident worker
    const response = await new Promise<any>((resolve, reject) => {
      this.currentRequest = { resolve, reject };
      this.proc.stdin.write(payload + "\n");
      this.proc.stdin.flush();
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

    await playWavBuffer(wavBuffer);
  }

  public stop(): void {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        // ignore
      }
      this.proc = null;
      this.isReady = false;
    }
  }
}
