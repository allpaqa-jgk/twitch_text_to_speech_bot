import path from "path";
import fs from "fs";
import os from "os";

/**
 * アプリケーションのルートディレクトリ（プロジェクトルートまたは配布パッケージのディレクトリ）を取得する
 */
export function getAppRootDir(): string {
  // コンパイル済みバイナリかどうかを判定
  // process.execPath が bun 自体ではない場合、コンパイル済みバイナリとして実行されている
  const execBase = path.basename(process.execPath).toLowerCase();
  const isCompiled = !execBase.includes("bun");

  if (isCompiled) {
    const execDir = path.dirname(process.execPath);
    // 実行バイナリと同じ階層に config または data がある場合はそこをルートとする
    if (
      fs.existsSync(path.join(execDir, "config")) ||
      fs.existsSync(path.join(execDir, "data"))
    ) {
      return execDir;
    }
    // なければカレントディレクトリをルートとする
    return process.cwd();
  }

  // 開発時: src/ の親ディレクトリ（プロジェクトルート）
  return path.resolve(import.meta.dir, "..");
}

export const paths = {
  root: getAppRootDir(),
  configDir: () => path.join(getAppRootDir(), "config"),
  dataDir: () => path.join(getAppRootDir(), "data"),
  tmpDir: () => path.join(os.tmpdir(), "twitch_tts_bot"),
  scriptsDir: () => path.join(getAppRootDir(), "scripts"),
  modelsDir: () => path.join(getAppRootDir(), "models"),
  venvDir: () => path.join(getAppRootDir(), ".venv"),
  pythonBin: () =>
    process.platform === "win32"
      ? path.join(getAppRootDir(), ".venv/Scripts/python.exe")
      : path.join(getAppRootDir(), ".venv/bin/python"),
  piperBin: () =>
    process.platform === "win32"
      ? path.join(getAppRootDir(), ".venv/Scripts/piper.exe")
      : path.join(getAppRootDir(), ".venv/bin/piper"),
  authJson: () => path.join(paths.configDir(), "auth.json"),
};
