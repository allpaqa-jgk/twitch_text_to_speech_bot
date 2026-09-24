import type { TTSEngine } from "../engine";
import { config } from "../../config";

export class MacSayEngine implements TTSEngine {
  public readonly name = "MacSay";

  private speaker: string;
  private rate: number;

  constructor(speaker = config.SPEAKER_JAPANESE, rate = config.RATE_JAPANESE) {
    this.speaker = speaker;
    this.rate = rate;
  }

  public async isAvailable(): Promise<boolean> {
    return process.platform === "darwin";
  }

  public async say(text: string): Promise<void> {
    if (!text || !text.trim() || process.platform !== "darwin") {
      return;
    }

    const args = ["say", "-v", this.speaker];
    if (this.rate && !isNaN(this.rate)) {
      args.push("-r", String(this.rate));
    }
    args.push(text);

    const proc = Bun.spawn(args, {
      stdout: "ignore",
      stderr: "inherit",
    });
    await proc.exited;
  }
}
