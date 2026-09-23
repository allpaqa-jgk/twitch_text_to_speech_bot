import fs from "fs";
import path from "path";
import os from "os";
import { paths } from "../paths";

// We can use play-sound, or native spawn for afplay / aplay / powershell
const player = require("play-sound")();

export async function playWavBuffer(audioData: Buffer | Uint8Array | ArrayBuffer): Promise<void> {
  const tmpDir = paths.tmpDir();
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const tempFilePath = path.join(
    tmpDir,
    `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
  );

  const buffer = Buffer.isBuffer(audioData)
    ? audioData
    : Buffer.from(audioData as any);

  fs.writeFileSync(tempFilePath, buffer);

  const cleanup = () => {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {
      // ignore
    }
  };

  // 1. On macOS, afplay is built-in and rock-solid via Bun.spawn
  if (process.platform === "darwin") {
    try {
      const proc = Bun.spawn(["afplay", tempFilePath], {
        stdout: "ignore",
        stderr: "inherit",
      });
      await proc.exited;
    } finally {
      cleanup();
    }
    return;
  }

  // 2. On Windows, use .NET SoundPlayer via PowerShell (built-in, no external app required)
  if (process.platform === "win32") {
    try {
      const escapedPath = tempFilePath.replace(/'/g, "''");
      const psCommand = `(New-Object Media.SoundPlayer '${escapedPath}').PlaySync()`;
      const proc = Bun.spawn(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", psCommand],
        {
          stdout: "ignore",
          stderr: "inherit",
        }
      );
      await proc.exited;
    } finally {
      cleanup();
    }
    return;
  }

  // 3. Fallback using play-sound (Linux: aplay, mplayer, etc.)
  return new Promise<void>((resolve, reject) => {
    player.play(tempFilePath, (err: any) => {
      cleanup();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
