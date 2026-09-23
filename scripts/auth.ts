import { startTwitchOAuthFlow } from "../src/twitch/auth";

console.log("Starting Twitch authentication flow...");

startTwitchOAuthFlow()
  .then((res) => {
    console.log(`\nReady! You can now start the bot with: bun start`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Twitch authentication failed:", err);
    process.exit(1);
  });
