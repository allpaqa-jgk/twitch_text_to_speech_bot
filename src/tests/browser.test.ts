import { describe, it, expect, spyOn } from "bun:test";
import { openBrowser } from "../utils/browser";

describe("openBrowser", () => {
  it("should spawn the platform-specific browser command without throwing", () => {
    let capturedCmd: any = null;
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation((cmd: any) => {
      capturedCmd = cmd;
      return {} as any;
    });

    try {
      openBrowser("http://localhost:3939");
      expect(spawnSpy).toHaveBeenCalled();
      if (process.platform === "darwin") {
        expect(capturedCmd).toEqual(["open", "http://localhost:3939"]);
      } else if (process.platform === "win32") {
        expect(capturedCmd).toEqual(["rundll32", "url.dll,FileProtocolHandler", "http://localhost:3939"]);
      } else {
        expect(capturedCmd).toEqual(["xdg-open", "http://localhost:3939"]);
      }
    } finally {
      spawnSpy.mockRestore();
    }
  });

  it("should catch and ignore errors if Bun.spawn throws", () => {
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
      throw new Error("Spawn error");
    });

    try {
      expect(() => openBrowser("http://localhost:3939")).not.toThrow();
    } finally {
      spawnSpy.mockRestore();
    }
  });
});
