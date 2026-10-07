import path from "path";
import fs from "fs";
import { runWithCompileCleanup } from "./compile";

interface TargetPlatform {
  id: string;
  name: string;
  target?: string; // undefined means host default (mac-arm64)
  binaryName: string;
  zipName: string;
}

const PLATFORMS: TargetPlatform[] = [
  {
    id: "mac-arm64",
    name: "macOS (Apple Silicon / M1 / M2 / M3 / M4)",
    target: "bun-darwin-arm64",
    binaryName: "twitch-tts-bot",
    zipName: "twitch-tts-bot-mac-arm64.zip",
  },
  {
    id: "windows-x64",
    name: "Windows (x64)",
    target: "bun-windows-x64",
    binaryName: "twitch-tts-bot.exe",
    zipName: "twitch-tts-bot-windows-x64.zip",
  },
  {
    id: "linux-x64",
    name: "Linux (x64)",
    target: "bun-linux-x64",
    binaryName: "twitch-tts-bot",
    zipName: "twitch-tts-bot-linux-x64.zip",
  },
];

function resolveRequestedPlatforms(): TargetPlatform[] {
  const requestedPlatformId = process.argv[2];

  if (!requestedPlatformId) {
    return PLATFORMS;
  }

  const requestedPlatform = PLATFORMS.find((platform) => platform.id === requestedPlatformId);
  if (!requestedPlatform) {
    const supportedPlatforms = PLATFORMS.map((platform) => platform.id).join(", ");
    throw new Error(
      `Unknown platform "${requestedPlatformId}". Supported values: ${supportedPlatforms}`
    );
  }

  return [requestedPlatform];
}

async function createZipArchive(zipPath: string, folderName: string, distDir: string) {
  const zipArgs =
    process.platform === "win32"
      ? [
          "powershell",
          "-NoLogo",
          "-NoProfile",
          "-Command",
          `Compress-Archive -Path '${folderName}' -DestinationPath '${path.basename(zipPath)}' -Force`,
        ]
      : ["zip", "-r", zipPath, folderName];

  const zipProc = Bun.spawn(zipArgs, {
    cwd: distDir,
    stdout: "ignore",
    stderr: "inherit",
  });

  const exitCode = await zipProc.exited;
  if (exitCode !== 0) {
    throw new Error(`ZIP creation failed for ${folderName} with exit code ${exitCode}`);
  }
}

async function buildPlatformPackage(p: TargetPlatform, rootDir: string, distDir: string) {
  console.log(`\n======================================================`);
  console.log(`🔨 Building package for ${p.name} ...`);
  console.log(`======================================================`);

  const packageDir = path.join(distDir, `twitch-tts-bot-${p.id}`);
  const zipPath = path.join(distDir, p.zipName);

  // 1. Clean up platform folder and zip
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
  fs.mkdirSync(path.join(packageDir, "models/piper"), { recursive: true });

  // 2. Compile standalone binary with Bun
  const binaryOutput = path.join(packageDir, p.binaryName);
  const buildArgs = [
    "bun",
    "build",
    "./src/index.ts",
    "--compile",
  ];
  if (p.target) {
    buildArgs.push(`--target=${p.target}`);
  }
  buildArgs.push("--outfile", binaryOutput);

  console.log(`==> Compiling standalone binary (${p.binaryName})...`);
  const exitCode = await runWithCompileCleanup(buildArgs, rootDir);
  if (exitCode !== 0) {
    throw new Error(`Bun compilation failed for ${p.name} with exit code ${exitCode}`);
  }

  // Ensure executable permissions
  try {
    fs.chmodSync(binaryOutput, 0o755);
  } catch {
    // ignore
  }

  // 3. Copy resources
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

  // tmp & models
  fs.writeFileSync(path.join(packageDir, "tmp/.keep"), "");
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

  // 4. Create ZIP
  console.log(`==> Creating release ZIP: ${p.zipName}...`);
  const folderName = path.basename(packageDir);
  await createZipArchive(zipPath, folderName, distDir);

  console.log(`✅ ${p.zipName} created (${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

async function buildAll() {
  const rootDir = path.resolve(import.meta.dir, "..");
  const distDir = path.join(rootDir, "dist");

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const requestedPlatforms = resolveRequestedPlatforms();

  for (const p of requestedPlatforms) {
    await buildPlatformPackage(p, rootDir, distDir);
  }

  console.log("\n======================================================");
  console.log(
    requestedPlatforms.length === PLATFORMS.length
      ? "🎉 All packages successfully built!"
      : `🎉 Package successfully built for ${requestedPlatforms[0].name}!`
  );
  console.log("======================================================");
  for (const p of requestedPlatforms) {
    const zipPath = path.join(distDir, p.zipName);
    const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
    console.log(`📦 ${p.zipName.padEnd(35, " ")} (${size} MB) - ${p.name}`);
  }
  console.log("======================================================\n");
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
