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

4. **Bot intents (required for some commands)**
   - Developer Portal → Your App → **Bot** → **Privileged Gateway Intents**:
     - Turn on **MESSAGE CONTENT INTENT** (needed for `/send` follow-up capture and `/clear`).
     - Turn on **SERVER MEMBERS INTENT** (needed for `/user` member/join/roles).

5. **Install and run**
   ```bash
   cd discord-bot
   npm install
   npm start
   ```

6. **Register slash commands** (after editing `commands.js`, or if commands are missing in Discord)
   ```bash
   npm run register
   ```

## Commands (only you can use them)

- **`/ping`** – Bot replies with "Pong!" (ephemeral).
- **`/help`** – Lists all commands and short usage (ephemeral).
- **`/status`** – Uptime, WebSocket ping, memory, guild count (ephemeral).
- **`/clear <count>`** – Deletes the last 1–100 messages in the current channel (skips pinned messages). Requires the bot to have "Manage Messages".
- **`/send <channel>`** – Bot asks you to type your message **in the same channel within 10 seconds**; that text (and attachments) is posted to the chosen channel with the same formatting.
- **`/remind <minutes> <message>`** – After the delay, the bot posts a reminder in that channel and pings you.
- **`/edit <message_link> <new_text>`** – Edits a message **sent by this bot** (use Copy Message Link, or `guildId-channelId-messageId`).
- **`/dm <user> <message>`** – Sends a DM from the bot to that user (they must allow DMs from server members / share a server).
- **`/user <member>`** – Shows user ID, account age, server join, nickname, roles, avatar URL.

## Deploy to Railway

Push this folder to a GitHub repo, then in Railway: New Project → Deploy from GitHub → set env vars (`DISCORD_TOKEN`, `OWNER_USER_ID`, optional `GUILD_ID`, optional `APPLICATION_ID`). The bot will run 24/7.

### Updating an already-deployed Railway project

1. **Push your changes** to the branch Railway is connected to (usually `main`):
   ```bash
   git add .
   git commit -m "Update bot"
   git push
   ```
2. Railway will **detect the push**, build, and **redeploy** automatically.
3. Open the Railway project → **Deployments** → latest deploy → **View logs** to confirm the bot started and registered commands.
4. If slash commands look stale, run **`npm run register`** locally with the same `.env` as production (or set env vars and run register in a one-off shell), or rely on the bot’s startup registration in `index.js` (it registers on every boot).

## Security

- Never commit `.env` or share your token (`.env` is in `.gitignore`).
- If the token was ever exposed, reset it in the Developer Portal and update `.env` / Railway variables.
