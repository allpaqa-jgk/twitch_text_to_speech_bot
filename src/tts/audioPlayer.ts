import fs from "fs";
import path from "path";
import os from "os";
import { paths } from "../paths";

// We can use play-sound, or native spawn for afplay / aplay / powershell
const player = require("play-sound")();

let activeAudioProcess: any = null;

/**
 * Stop currently playing audio process immediately.
 */
export function stopAudio(): void {
  if (activeAudioProcess) {
    try {
      if (typeof activeAudioProcess.kill === "function") {
        activeAudioProcess.kill();
      }
    } catch {
      // ignore errors during kill
    }
    activeAudioProcess = null;
  }
}

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
    const proc = Bun.spawn(["afplay", tempFilePath], {
      stdout: "ignore",
      stderr: "inherit",
    });
    activeAudioProcess = proc;
    try {
      await proc.exited;
    } finally {
      if (activeAudioProcess === proc) {
        activeAudioProcess = null;
      }
      cleanup();
    }
    return;
  }

  // 2. On Windows, use .NET SoundPlayer via PowerShell (built-in, no external app required)
  if (process.platform === "win32") {
    const escapedPath = tempFilePath.replace(/'/g, "''");
    const psCommand = `(New-Object Media.SoundPlayer '${escapedPath}').PlaySync()`;
    const proc = Bun.spawn(
      ["powershell", "-NoProfile", "-NonInteractive", "-Command", psCommand],
      {
        stdout: "ignore",
        stderr: "inherit",
      }
    );
    activeAudioProcess = proc;
    try {
      await proc.exited;
    } finally {
      if (activeAudioProcess === proc) {
        activeAudioProcess = null;
      }
      cleanup();
    }
    return;
  }

  // 3. Fallback using play-sound (Linux: aplay, mplayer, etc.)
  return new Promise<void>((resolve, reject) => {
    const audioProc = player.play(tempFilePath, (err: any) => {
      cleanup();
      if (activeAudioProcess === audioProc) {
        activeAudioProcess = null;
      }
      // If error occurred but it was terminated deliberately, treat as success/cancel
      if (err && err.killed) {
        resolve();
      } else if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    activeAudioProcess = audioProc;
  });
}
