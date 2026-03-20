/**
 * Run this once after changing commands or adding the bot to a new server.
 * Usage: npm run register
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID || null;
const APPLICATION_ID = process.env.APPLICATION_ID; // From Developer Portal → Your App → Application ID

if (!TOKEN) {
  console.error('DISCORD_TOKEN missing in .env');
  process.exit(1);
}

const rest = new REST().setToken(TOKEN);

(async () => {
  const clientId =
    APPLICATION_ID || (await rest.get(Routes.oauth2CurrentApplication()).then((a) => a.id));
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: commands });
    console.log('Guild commands registered.');
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Global commands registered.');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
