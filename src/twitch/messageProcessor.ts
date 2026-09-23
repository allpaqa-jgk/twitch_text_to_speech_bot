/**
 * Pure functions for sanitizing, formatting, and filtering Twitch chat messages.
 */

export function isEnglishString(text: string): boolean {
  return /^[A-Za-z,.!? ]+$/.test(text.trim());
}

export function simplifyUsername(username: string): string {
  // Remove suffix like _123 or digits at the end
  return username.replace(/(_[\d|\w]+)|(\d+)$/, "");
}

export function formatUsername(
  rawUsername: string,
  usernameConvertList: string[][],
  useSimpleName = true
): string {
  const custom = usernameConvertList.find((row) => row[0] === rawUsername);
  if (custom && custom[1]) {
    return custom[1];
  }
  return useSimpleName ? simplifyUsername(rawUsername) : rawUsername;
}

export function formatMessage(
  rawMessage: string,
  messageConvertList: string[][]
): string {
  let message = rawMessage;

  for (const row of messageConvertList) {
    if (!row || !row[0]) continue;
    const pattern = row[0];
    const replacement = row[1] ?? "";

    try {
      const regex = new RegExp(pattern, "g");
      message = message.replace(regex, replacement);
    } catch {
      // If the pattern is not valid regex, fallback to plain string replacement
      message = message.split(pattern).join(replacement);
    }
  }

  return message;
}

export function isIgnoredMessage(
  rawMessage: string,
  messageIgnoreList: string[][]
): boolean {
  for (const row of messageIgnoreList) {
    if (!row || !row[0]) continue;
    const pattern = row[0];

    try {
      const regex = new RegExp(pattern);
      if (regex.test(rawMessage)) {
        return true;
      }
    } catch {
      if (rawMessage.includes(pattern)) {
        return true;
      }
    }
  }

  return false;
}

export function escapeMassMention(text: string): string {
  return text.replace(/@/g, "`@`");
}

export function escapeTtsErrorString(text: string): string {
  return text
    .replace(/[!?！？`]/g, "")
    .replace(/[\s\u3000]+/g, " ")
    .trim();
}
