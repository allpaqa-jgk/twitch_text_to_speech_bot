export function openBrowser(url: string): void {
  const plat = process.platform;
  let cmd: string[];
  if (plat === "darwin") {
    cmd = ["open", url];
  } else if (plat === "win32") {
    cmd = ["rundll32", "url.dll,FileProtocolHandler", url];
  } else {
    cmd = ["xdg-open", url];
  }
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // ignore browser open errors
  }
}
