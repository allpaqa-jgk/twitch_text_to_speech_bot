import path from "path";
import fs from "fs";

async function buildPackage() {
  const rootDir = path.resolve(import.meta.dir, "..");
  const distDir = path.join(rootDir, "dist");
  const packageDir = path.join(distDir, "twitch-tts-bot");
  const zipPath = path.join(distDir, "twitch-tts-bot-mac-arm64.zip");

  console.log("==> 1. Clean up dist directories...");
  if (fs.existsSync(packageDir)) {
    fs.rmSync(packageDir, { recursive: true, force: true });
  }
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  fs.mkdirSync(path.join(packageDir, "config"), { recursive: true });
  fs.mkdirSync(path.join(packageDir, "data"), { recursive: true });
  fs.mkdirSync(path.join(packageDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(packageDir, "tmp"), { recursive: true });

  console.log("==> 2. Compiling standalone binary with Bun...");
  const binaryOutput = path.join(packageDir, "twitch-tts-bot");
  const buildProc = Bun.spawn(
    [
      "bun",
      "build",
      "./src/index.ts",
      "--compile",
      "--outfile",
      binaryOutput,
    ],
    {
      cwd: rootDir,
      stdout: "inherit",
      stderr: "inherit",
    }
  );

  const exitCode = await buildProc.exited;
  if (exitCode !== 0) {
    throw new Error(`Bun compilation failed with exit code ${exitCode}`);
  }

  // Ensure binary is executable
  fs.chmodSync(binaryOutput, 0o755);

  console.log("==> 3. Copying configuration, data, scripts, and documentation...");
  // config
  fs.copyFileSync(
    path.join(rootDir, "config/default.js.sample"),
    path.join(packageDir, "config/default.js.sample")
  );
  fs.writeFileSync(path.join(packageDir, "config/.keep"), "");

  // data
  const dataFiles = [
    "messageConvertList.csv.sample",
    "messageIgnoreList.csv.sample",
    "usernameConvertList.csv.sample",
    ".keep",
  ];
  for (const f of dataFiles) {
    const src = path.join(rootDir, "data", f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(packageDir, "data", f));
    }
  }

  // tmp
  fs.writeFileSync(path.join(packageDir, "tmp/.keep"), "");

  // models
  fs.mkdirSync(path.join(packageDir, "models/piper"), { recursive: true });
  fs.writeFileSync(path.join(packageDir, "models/piper/.keep"), "");

  // scripts
  const kokoroScript = path.join(rootDir, "scripts/kokoro_worker.py");
  if (fs.existsSync(kokoroScript)) {
    fs.copyFileSync(kokoroScript, path.join(packageDir, "scripts/kokoro_worker.py"));
  }

  // README
  fs.copyFileSync(
    path.join(rootDir, "README.md"),
    path.join(packageDir, "README.md")
  );

  console.log("==> 4. Creating release ZIP archive...");
  const zipProc = Bun.spawn(
    ["zip", "-r", zipPath, "twitch-tts-bot"],
    {
      cwd: distDir,
      stdout: "ignore",
      stderr: "inherit",
    }
  );
  await zipProc.exited;

  console.log("\n========================================");
  console.log("✅ Distribution package successfully built!");
  console.log(`📁 Package Folder: ${packageDir}`);
  console.log(`📦 Release ZIP:    ${zipPath}`);
  console.log("========================================\n");
}

buildPackage().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
