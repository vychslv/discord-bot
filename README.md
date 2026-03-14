# Discord Bot (owner-only)

This bot only responds to **you**. Everyone else gets a short "only the bot owner can use commands" message.

## Setup

1. **Copy the env file**
   - Copy `.env.example` to `.env` in this folder.

2. **Fill in `.env`**
   - **DISCORD_TOKEN** – Your bot token from [Discord Developer Portal](https://discord.com/developers/applications) → Your App → Bot → Reset Token.
   - **OWNER_USER_ID** – Your Discord user ID (only this user can use commands).
     - Enable Developer Mode: Discord → Settings → App Settings → Advanced → Developer Mode.
     - Right‑click your username (e.g. in a server) → "Copy User ID". Paste that into `.env`.
   - **GUILD_ID** (optional) – Your server ID for faster slash command updates. Right‑click the server icon → "Copy Server ID". Leave empty for global commands.

3. **Invite the bot**
   - Developer Portal → Your App → OAuth2 → URL Generator.
   - Scopes: `bot`.
   - Bot permissions: e.g. "Send Messages", "Read Message History", "Manage Messages" (needed for `/clear`).
   - Open the generated URL and add the bot to your server.

4. **Install and run**
   ```bash
   cd discord-bot
   npm install
   npm start
   ```

## Commands (only you can use them)

- **`/ping`** – Bot replies with "Pong!" (ephemeral).
- **`/clear <count>`** – Deletes the last 1–100 messages in the current channel (skips pinned messages). Requires the bot to have "Manage Messages".
- **`/send message <channel>`** – Sends a message from the bot. Use **message** for the text; **channel** is optional (defaults to the channel you run the command in).

## Deploy to Railway

Push this folder to a GitHub repo, then in Railway: New Project → Deploy from GitHub → set env vars (DISCORD_TOKEN, OWNER_USER_ID, optional GUILD_ID). The bot will run 24/7.

## Security

- Never commit `.env` or share your token (`.env` is in `.gitignore`).
- If the token was ever exposed, reset it in the Developer Portal and update `.env`.
