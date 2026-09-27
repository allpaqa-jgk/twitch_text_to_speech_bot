import type { TTSEngine, PreparedAudio, SpeechOptions } from "../engine";
import { config } from "../../config";

export class MacSayEngine implements TTSEngine {
  public readonly name = "MacSay";

  private speaker: string;
  private rate: number;
  private currentProc: any = null;

  constructor(speaker = config.SPEAKER_JAPANESE, rate = config.RATE_JAPANESE) {
    this.speaker = speaker;
    this.rate = rate;
  }

  public async isAvailable(): Promise<boolean> {
    return process.platform === "darwin";
  }

  public stop(): void {
    if (this.currentProc) {
      try {
        if (typeof this.currentProc.kill === "function") {
          this.currentProc.kill();
        }
      } catch {
        // ignore errors
      }
      this.currentProc = null;
    }
  }

  public async prepare(text: string, options?: SpeechOptions): Promise<PreparedAudio> {
    return {
      play: () => this.say(text, options),
    };
  }

  public async say(text: string, options?: SpeechOptions): Promise<void> {
    if (!text || !text.trim() || process.platform !== "darwin") {
      return;
    }

    const args = ["say", "-v", this.speaker];
    if (this.rate && !isNaN(this.rate)) {
      const effectiveRate = Math.min(
        350,
        Math.max(100, Math.round(this.rate * (options?.speedScale ?? 1.0)))
      );
      args.push("-r", String(effectiveRate));
    }
    args.push(text);

    const proc = Bun.spawn(args, {
      stdout: "ignore",
      stderr: "inherit",
    });
    this.currentProc = proc;
    try {
      await proc.exited;
    } finally {
      if (this.currentProc === proc) {
        this.currentProc = null;
      }
    }
  }
}
