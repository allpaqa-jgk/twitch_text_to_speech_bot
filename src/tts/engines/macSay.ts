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

    const option = `[[RATE ${this.rate}]]`;
    const escaped = text.replace(/'/g, "'\\''");
    const script = `echo '${option} ${escaped}' | say -v '${this.speaker}'`;

    const proc = Bun.spawn(["bash", "-c", script], {
      stdout: "ignore",
      stderr: "inherit",
    });
    await proc.exited;
  }
}
