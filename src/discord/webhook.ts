import type { Settings } from "../settingsStore";
import { settingsStore } from "../settingsStore";

export async function sendToDiscord(
  content: string,
  settings: Settings = settingsStore.current()
): Promise<void> {
  if (!settings.DISCORD_TRANSFER_ENABLED || !content || !content.trim()) {
    return;
  }

  // If a Webhook URL is provided, use it directly (super lightweight!)
  if (settings.DISCORD_WEBHOOK_URL) {
    try {
      await fetch(settings.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.warn("[Discord] Failed to send via Webhook:", err);
    }
    return;
  }

  // If a Bot Token + Channel ID are provided, use Discord REST API directly
  if (settings.DISCORD_TOKEN && settings.DISCORD_CHANNEL_ID) {
    try {
      const url = `https://discord.com/api/v10/channels/${settings.DISCORD_CHANNEL_ID}/messages`;
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bot ${settings.DISCORD_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.warn("[Discord] Failed to send via Bot Token:", err);
    }
  }
}
