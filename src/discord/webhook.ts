import { config } from "../config";

export async function sendToDiscord(content: string): Promise<void> {
  if (!config.DISCORD_TRANSFER_ENABLED || !content || !content.trim()) {
    return;
  }

  // If a Webhook URL is provided, use it directly (super lightweight!)
  if (config.DISCORD_WEBHOOK_URL) {
    try {
      await fetch(config.DISCORD_WEBHOOK_URL, {
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
  if (config.DISCORD_TOKEN && config.DISCORD_CHANNEL_ID) {
    try {
      const url = `https://discord.com/api/v10/channels/${config.DISCORD_CHANNEL_ID}/messages`;
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bot ${config.DISCORD_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.warn("[Discord] Failed to send via Bot Token:", err);
    }
  }
}
