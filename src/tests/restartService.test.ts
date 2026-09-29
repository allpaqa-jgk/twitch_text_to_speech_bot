import { describe, it, expect } from "bun:test";
import { RestartService } from "../application/restartService";

function createHookTracker() {
  const calls: string[] = [];
  return {
    calls,
    hooks: {
      stopHttpServers: () => {
        calls.push("stopHttpServers");
      },
      disconnectTwitch: async () => {
        calls.push("disconnectTwitch");
      },
      clearQueue: () => {
        calls.push("clearQueue");
      },
    },
  };
}

describe("RestartService", () => {
  it("reports the same execPath + argv.slice(1) relaunch command for a Bun script launch", () => {
    const service = new RestartService({
      execPath: "/usr/local/bin/bun",
      argv: ["/app/src/index.ts", "--foo", "bar"],
      cwd: "/app",
      platform: "darwin",
      existsSync: () => true,
    });

    const info = service.getLaunchInfo();
    expect(info.supported).toBe(true);
    expect(info.mode).toBe("bun-script");
    expect(info.command).toBe("/usr/local/bin/bun");
    expect(info.args).toEqual(["/app/src/index.ts", "--foo", "bar"]);
    expect(info.cwd).toBe("/app");
  });

  it("reports a compiled-binary relaunch command when execPath is not the bun runtime", () => {
    const service = new RestartService({
      execPath: "/opt/twitch-tts-bot/twitch-tts-bot",
      argv: ["--speakers"],
      cwd: "/opt/twitch-tts-bot",
      platform: "linux",
      existsSync: () => true,
    });

    const info = service.getLaunchInfo();
    expect(info.supported).toBe(true);
    expect(info.mode).toBe("compiled-binary");
    expect(info.command).toBe("/opt/twitch-tts-bot/twitch-tts-bot");
    expect(info.args).toEqual(["--speakers"]);
  });

  it("marks restart as unsupported when the executable file cannot be found", () => {
    const service = new RestartService({
      execPath: "/missing/twitch-tts-bot",
      argv: [],
      cwd: "/missing",
      platform: "win32",
      existsSync: () => false,
    });

    const info = service.getLaunchInfo();
    expect(info.supported).toBe(false);
    expect(info.reason).toBeTruthy();
  });

  it("marks restart as unsupported on an unrecognized platform", () => {
    const service = new RestartService({
      execPath: "/usr/local/bin/bun",
      argv: ["/app/src/index.ts"],
      cwd: "/app",
      platform: "sunos" as NodeJS.Platform,
      existsSync: () => true,
    });

    const info = service.getLaunchInfo();
    expect(info.supported).toBe(false);
    expect(info.reason).toContain("sunos");
  });

  it("stops services, then disconnects, then clears the queue, then spawns before exiting (in order)", async () => {
    const { calls, hooks } = createHookTracker();
    const spawnCalls: Array<{ command: string; args: string[]; cwd: string }> = [];
    let exitCode: number | null = null;

    const service = new RestartService({
      execPath: "/usr/local/bin/bun",
      argv: ["/app/src/index.ts", "--foo"],
      cwd: "/app",
      env: { FOO: "bar" },
      platform: "darwin",
      existsSync: () => true,
      spawn: (command, args, options) => {
        calls.push("spawn");
        spawnCalls.push({ command, args, cwd: options.cwd });
        return { pid: 4242, unref: () => calls.push("unref") };
      },
      exit: (code) => {
        calls.push("exit");
        exitCode = code;
      },
    });

    const result = await service.performRestart(hooks);

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      "stopHttpServers",
      "disconnectTwitch",
      "clearQueue",
      "spawn",
      "unref",
      "exit",
    ]);
    expect(spawnCalls).toEqual([
      { command: "/usr/local/bin/bun", args: ["/app/src/index.ts", "--foo"], cwd: "/app" },
    ]);
    expect(exitCode).toBe(0);
    expect(service.getLastError()).toBeNull();
  });

  it("does not spawn or exit when the launch mode is unsupported, and surfaces the reason", async () => {
    const { calls, hooks } = createHookTracker();
    let spawned = false;
    let exited = false;

    const service = new RestartService({
      execPath: "/missing/twitch-tts-bot",
      argv: [],
      cwd: "/missing",
      platform: "darwin",
      existsSync: () => false,
      spawn: () => {
        spawned = true;
        return {};
      },
      exit: () => {
        exited = true;
      },
    });

    const result = await service.performRestart(hooks);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(calls).toEqual([]);
    expect(spawned).toBe(false);
    expect(exited).toBe(false);
    expect(service.getLastError()).toBe(result.error ?? null);
  });

  it("keeps the process alive and surfaces the error when spawning the successor fails", async () => {
    const { calls, hooks } = createHookTracker();
    let exited = false;

    const service = new RestartService({
      execPath: "/usr/local/bin/bun",
      argv: ["/app/src/index.ts"],
      cwd: "/app",
      platform: "darwin",
      existsSync: () => true,
      spawn: () => {
        throw new Error("ENOENT: spawn failed");
      },
      exit: () => {
        exited = true;
      },
    });

    const result = await service.performRestart(hooks);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ENOENT");
    // Shutdown hooks still ran (ports released) even though the successor could not start.
    expect(calls).toEqual(["stopHttpServers", "disconnectTwitch", "clearQueue"]);
    expect(exited).toBe(false);
    expect(service.getLastError()).toContain("ENOENT");
  });

  it("continues the restart sequence even if a shutdown hook throws", async () => {
    const calls: string[] = [];
    let exited = false;

    const service = new RestartService({
      execPath: "/usr/local/bin/bun",
      argv: ["/app/src/index.ts"],
      cwd: "/app",
      platform: "darwin",
      existsSync: () => true,
      spawn: () => {
        calls.push("spawn");
        return { unref: () => calls.push("unref") };
      },
      exit: () => {
        exited = true;
        calls.push("exit");
      },
    });

    const result = await service.performRestart({
      stopHttpServers: () => {
        calls.push("stopHttpServers");
        throw new Error("stop failed");
      },
      disconnectTwitch: () => {
        calls.push("disconnectTwitch");
      },
      clearQueue: () => {
        calls.push("clearQueue");
      },
    });

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      "stopHttpServers",
      "disconnectTwitch",
      "clearQueue",
      "spawn",
      "unref",
      "exit",
    ]);
    expect(exited).toBe(true);
  });
});
