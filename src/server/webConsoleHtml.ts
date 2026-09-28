import htmlContent from "./web/index.html" with { type: "text" };

/**
 * Web Management Console & Realtime Katakana Lab HTML Generator
 * Returns the fully self-contained HTML imported from src/server/web/index.html
 */
export function renderWebConsoleHtml(): string {
  return htmlContent;
}
