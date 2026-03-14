/**
 * Run this once after changing commands or adding the bot to a new server.
 * Usage: node register-commands.js
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID || null;
const APPLICATION_ID = process.env.APPLICATION_ID; // From Developer Portal → Your App → Application ID

const commands = [
  { name: 'ping', description: 'Check if the bot is alive (owner only)' },
  {
    name: 'clear',
    description: 'Delete the last N messages in this channel (owner only)',
    options: [
      {
        name: 'count',
        type: 4,
        description: 'Number of messages to delete (1–100)',
        required: true,
        min_value: 1,
        max_value: 100,
      },
    ],
  },
  {
    name: 'send',
    description: 'Send a message from the bot to a channel (owner only)',
    options: [
      { name: 'message', type: 3, description: 'The text for the bot to send', required: true },
      {
        name: 'channel',
        type: 7,
        description: 'Channel to send to (default: this channel)',
        required: false,
        channel_types: [0, 5, 11],
      },
    ],
  },
];

if (!TOKEN) {
  console.error('DISCORD_TOKEN missing in .env');
  process.exit(1);
}

const rest = new REST().setToken(TOKEN);

(async () => {
  const clientId = APPLICATION_ID || (await rest.get(Routes.oauth2CurrentApplication()).then((a) => a.id));
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
