import type { TTSEngine } from "../engine";
import { playWavBuffer } from "../audioPlayer";
import { paths } from "../../paths";
import { config } from "../../config";
import path from "path";
import fs from "fs";

export class PiperEngine implements TTSEngine {
  public readonly name = "Piper";

  private piperPath: string;
  private modelPath: string;

  constructor(
    modelPath = path.join(
      paths.modelsDir(),
      "piper/ja_JP-hi_fi_captain-medium.onnx"
    ),
    piperPath = paths.piperBin()
  ) {
    this.modelPath = modelPath;
    this.piperPath = piperPath;
  }

  public async isAvailable(): Promise<boolean> {
    return fs.existsSync(this.piperPath) && fs.existsSync(this.modelPath);
  }

  public async say(text: string): Promise<void> {
    if (!text || !text.trim()) {
      return;
    }

    const tmpDir = paths.tmpDir();
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const outputPath = path.join(
      tmpDir,
      `piper_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
    );

    const masterVol = config.MASTER_VOLUME ?? 1.0;
    const piperVol = Math.min(1.0, Math.max(0.0, 0.8 * masterVol)).toFixed(2);

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

    await playWavBuffer(wavBuffer);
  }
}
