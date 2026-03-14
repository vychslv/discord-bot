import 'dotenv/config';
import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_USER_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!TOKEN || !OWNER_ID) {
  console.error('Missing DISCORD_TOKEN or OWNER_USER_ID in .env. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

function isOwner(userId) {
  return userId === OWNER_ID;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  {
    name: 'ping',
    description: 'Check if the bot is alive (owner only)',
  },
  {
    name: 'clear',
    description: 'Delete the last N messages in this channel (owner only)',
    options: [
      {
        name: 'count',
        type: 4, // INTEGER
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
      {
        name: 'message',
        type: 3, // STRING
        description: 'The text for the bot to send',
        required: true,
      },
      {
        name: 'channel',
        type: 7, // CHANNEL
        description: 'Channel to send to (default: this channel)',
        required: false,
        channel_types: [0, 5, 11], // GUILD_TEXT, GUILD_ANNOUNCEMENT, GUILD_PUBLIC_THREAD
      },
    ],
  },
];

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const appId = c.application?.id ?? c.user.id;
  const rest = new REST().setToken(TOKEN);
  const body = { body: commands };
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(appId, GUILD_ID), body);
      console.log('Slash commands registered for guild.');
    } else {
      await rest.put(Routes.applicationCommands(appId), body);
      console.log('Slash commands registered globally.');
    }
  } catch (e) {
    console.error('Failed to register commands:', e);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: 'Only the bot owner can use commands.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: 'Pong!', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'clear') {
    const count = interaction.options.getInteger('count', true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = interaction.channel;
      const messages = await channel.messages.fetch({ limit: Math.min(count + 1, 100) });
      const toDelete = messages.filter((m) => !m.pinned);
      const deleted = await channel.bulkDelete(toDelete, true);
      await interaction.editReply({ content: `Deleted ${deleted.size} message(s).` });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: `Error: ${err.message}` }).catch(() => {});
    }
    return;
  }

  if (interaction.commandName === 'send') {
    const text = interaction.options.getString('message', true);
    const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;

    try {
      await targetChannel.send(text);
      await interaction.reply({
        content: `Message sent to ${targetChannel}.`,
        ephemeral: true,
      });
    } catch (err) {
      console.error(err);
      await interaction.reply({
        content: `Failed to send: ${err.message}`,
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

client.login(TOKEN);
