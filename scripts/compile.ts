import fs from "fs";
import path from "path";

const BUN_BUILD_PATTERN = /^\..*\.bun-build$/;

export async function runWithCompileCleanup(
  cmd: string[],
  cwd: string = process.cwd()
): Promise<number> {
  let beforeFiles: Set<string> | null = null;
  try {
    beforeFiles = new Set(
      fs.readdirSync(cwd).filter((name) => BUN_BUILD_PATTERN.test(name))
    );
  } catch (err) {
    console.warn(
      `Warning: failed to snapshot directory "${cwd}" before build; skipping leftover cleanup:`,
      err
    );
  }

  try {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
    return await proc.exited;
  } finally {
    if (beforeFiles !== null) {
      try {
        const currentFiles = fs.readdirSync(cwd);
        for (const name of currentFiles) {
          if (BUN_BUILD_PATTERN.test(name) && !beforeFiles.has(name)) {
            const filePath = path.join(cwd, name);
            try {
              try {
                fs.chmodSync(filePath, 0o666);
              } catch {
                // Ignore chmod error and attempt deletion
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              console.warn(`Warning: failed to remove build leftover "${filePath}":`, err);
            }
          }
        }
      } catch (err) {
        console.warn(`Warning: failed to scan directory "${cwd}" for leftovers:`, err);
      }
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const cmd = ["bun", "build", ...args];
  const exitCode = await runWithCompileCleanup(cmd, process.cwd());
  process.exit(exitCode);
}
