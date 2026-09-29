import type { TTSEngine, PreparedAudio, SpeechOptions } from "../engine";
import { playWavBuffer } from "../audioPlayer";
import { paths } from "../../paths";
import path from "path";
import fs from "fs";

export interface PiperEngineOptions {
  modelPath?: string;
  piperPath?: string;
  masterVolume?: number;
}

export class PiperEngine implements TTSEngine {
  public readonly name = "Piper";

  private piperPath: string;
  private modelPath: string;
  private masterVolume: number;

  constructor(options: PiperEngineOptions = {}) {
    this.modelPath = options.modelPath ?? path.join(
      paths.modelsDir(),
      "piper/ja_JP-hi_fi_captain-medium.onnx"
    );
    this.piperPath = options.piperPath ?? paths.piperBin();
    this.masterVolume = options.masterVolume ?? 1;
  }

  public async isAvailable(): Promise<boolean> {
    return fs.existsSync(this.piperPath) && fs.existsSync(this.modelPath);
  }

  public async prepare(text: string, options?: SpeechOptions): Promise<PreparedAudio> {
    if (!text || !text.trim()) {
      return { play: async () => {} };
    }

    const tmpDir = paths.tmpDir();
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const outputPath = path.join(
      tmpDir,
      `piper_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
    );

    const piperVol = Math.min(1.0, Math.max(0.0, 0.8 * this.masterVolume)).toFixed(2);

    const effectiveLengthScale = Math.min(
      2.0,
      Math.max(0.5, 1.0 / (options?.speedScale ?? 1.0))
    );

    const proc = Bun.spawn(
      [
        this.piperPath,
        "--model",
        this.modelPath,
        "--output_file",
        outputPath,
        "--volume",
        piperVol,
        "--noise-scale",
        "0.333",
        "--length-scale",
        String(effectiveLengthScale),
      ],
      {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "inherit",
      }
    );

    proc.stdin.write(text);
    proc.stdin.flush();
    proc.stdin.end();

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Piper exited with code ${exitCode}`);
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
}
