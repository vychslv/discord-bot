import 'dotenv/config';
import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { commands } from './commands.js';

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_USER_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!TOKEN || !OWNER_ID) {
  console.error(
    'Missing DISCORD_TOKEN or OWNER_USER_ID in .env. Copy .env.example to .env and fill it in.',
  );
  process.exit(1);
}

function isOwner(userId) {
  return userId === OWNER_ID;
}

/** @param {string} url */
function parseDiscordMessageUrl(url) {
  const trimmed = url.trim();
  const m = trimmed.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (m) return { guildId: m[1], channelId: m[2], messageId: m[3] };
  const m2 = trimmed.match(/^(\d+)-(\d+)-(\d+)$/);
  if (m2) return { guildId: m2[1], channelId: m2[2], messageId: m2[3] };
  return null;
}

const startedAt = Date.now();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

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

const HELP_TEXT = [
  '**Owner commands**',
  '`/ping` — quick alive check.',
  '`/help` — this list.',
  '`/status` — uptime, WebSocket ping, memory.',
  '`/clear count:N` — bulk-delete last N messages (Manage Messages).',
  '`/send channel:#…` — then type your message **in this channel within 10 seconds**; bot posts it to the chosen channel with the same formatting.',
  '`/remind minutes:N message:…` — pings you in this channel when time is up.',
  '`/edit message_link:… new_text:…` — edit a message **from this bot** (use Copy Message Link).',
  '`/dm user:@… message:…` — bot DMs that user.',
  '`/user member:@…` — ID, account age, server join, roles, avatar.',
  '',
  '**Developer Portal → Bot:** enable **Message Content Intent** and **Server Members Intent** for `/send` and `/user`.',
].join('\n');

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

  if (interaction.commandName === 'help') {
    await interaction.reply({ content: HELP_TEXT, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'status') {
    const uptimeSec = Math.floor(process.uptime());
    const hrs = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;
    const mem = process.memoryUsage();
    const mb = (n) => (n / 1024 / 1024).toFixed(1);
    const ping = client.ws.ping;
    const lines = [
      `**Uptime:** ${hrs}h ${mins}m ${secs}s`,
      `**WebSocket ping:** ${ping} ms`,
      `**Memory:** RSS ${mb(mem.rss)} MB · heap ${mb(mem.heapUsed)} / ${mb(mem.heapTotal)} MB`,
      `**Guilds:** ${client.guilds.cache.size}`,
      `**Started:** <t:${Math.floor(startedAt / 1000)}:R>`,
    ];
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }

  if (interaction.commandName === 'clear') {
    const count = interaction.options.getInteger('count', true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = interaction.channel;
      if (!channel?.isTextBased()) {
        await interaction.editReply({ content: 'This command only works in a text channel.' });
        return;
      }
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
    const targetChannel = interaction.options.getChannel('channel', true);
    if (!targetChannel?.isTextBased()) {
      await interaction.reply({
        content: 'Pick a text, announcement, or public thread channel.',
        ephemeral: true,
      });
      return;
    }

    const listenChannel = interaction.channel;
    if (!listenChannel?.isTextBased()) {
      await interaction.reply({
        content: 'Run `/send` from a server text channel so the bot can read your follow-up message.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `Type your message **in this channel** within **10 seconds**. It will be sent to ${targetChannel} with the same formatting (markdown, line breaks). Attachments are forwarded too.`,
      ephemeral: true,
    });

    try {
      const collected = await listenChannel.awaitMessages({
        filter: (m) => m.author.id === interaction.user.id && !m.author.bot,
        max: 1,
        time: 10_000,
        errors: ['time'],
      });
      const msg = collected.first();
      const fileParts = [...msg.attachments.values()].map((a) => ({
        attachment: a.url,
        name: a.name || 'attachment',
      }));
      const sendOpts = {
        ...(msg.content ? { content: msg.content } : {}),
        ...(fileParts.length ? { files: fileParts } : {}),
      };
      if (!sendOpts.content && !sendOpts.files) {
        await interaction.followUp({
          content: 'Empty message (no text and no attachments). Nothing sent.',
          ephemeral: true,
        });
        return;
      }
      await targetChannel.send(sendOpts);
      await interaction.followUp({
        content: `Sent to ${targetChannel}.`,
        ephemeral: true,
      });
    } catch {
      await interaction.followUp({
        content: 'No message received within 10 seconds. Cancelled.',
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.commandName === 'remind') {
    const minutes = interaction.options.getInteger('minutes', true);
    const text = interaction.options.getString('message', true);
    const channel = interaction.channel;
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'Use this in a text channel.', ephemeral: true });
      return;
    }
    const userId = interaction.user.id;
    const ms = minutes * 60 * 1000;
    await interaction.reply({
      content: `Reminder set for **${minutes}** minute(s) in this channel.`,
      ephemeral: true,
    });
    setTimeout(async () => {
      try {
        const ch = await client.channels.fetch(channel.id);
        if (ch?.isTextBased()) {
          await ch.send({ content: `<@${userId}> **Reminder:** ${text}` });
        }
      } catch (e) {
        console.error('Reminder failed:', e);
      }
    }, ms);
    return;
  }

  if (interaction.commandName === 'edit') {
    const link = interaction.options.getString('message_link', true);
    const newText = interaction.options.getString('new_text', true);
    const parsed = parseDiscordMessageUrl(link);
    if (!parsed) {
      await interaction.reply({
        content:
          'Invalid link. Use **Copy Message Link** on the bot’s message, or format `guildId-channelId-messageId`.',
        ephemeral: true,
      });
      return;
    }
    if (interaction.guildId && parsed.guildId !== interaction.guildId) {
      await interaction.reply({
        content: 'That message is from another server.',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const ch = await client.channels.fetch(parsed.channelId);
      if (!ch?.isTextBased()) {
        await interaction.editReply({ content: 'Could not load that channel.' });
        return;
      }
      const message = await ch.messages.fetch(parsed.messageId);
      if (message.author.id !== client.user.id) {
        await interaction.editReply({
          content: 'That message was not sent by this bot. Only bot messages can be edited.',
        });
        return;
      }
      await message.edit(newText);
      await interaction.editReply({ content: 'Message updated.' });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: `Failed: ${err.message}` }).catch(() => {});
    }
    return;
  }

  if (interaction.commandName === 'dm') {
    const user = interaction.options.getUser('user', true);
    const text = interaction.options.getString('message', true);
    try {
      await user.send(text);
      await interaction.reply({ content: `DM sent to **${user.tag}**.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      await interaction.reply({
        content: `Could not DM **${user.tag}** (DMs closed or no shared server). ${err.message}`,
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.commandName === 'user') {
    const user = interaction.options.getUser('member', true);
    await interaction.deferReply({ ephemeral: true });
    try {
      const lines = [
        `**User:** ${user.tag} (\`${user.id}\`)`,
        `**Mention:** ${user}`,
        `**Bot:** ${user.bot ? 'yes' : 'no'}`,
        `**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`,
      ];
      if (interaction.inGuild()) {
        const guild = interaction.guild;
        const member = await guild.members.fetch({ user, force: false }).catch(() => null);
        if (member) {
          const joined = member.joinedTimestamp;
          if (joined) {
            lines.push(
              `**Joined server:** <t:${Math.floor(joined / 1000)}:F> (<t:${Math.floor(joined / 1000)}:R>)`,
            );
          } else {
            lines.push('**Joined server:** *(unknown)*');
          }
          lines.push(`**Nickname:** ${member.nickname ?? '*(none)*'}`);
          const roleMentions = member.roles.cache
            .filter((r) => r.id !== guild.id)
            .map((r) => r.toString())
            .join(' ');
          lines.push(`**Roles:** ${roleMentions || '*(none)*'}`);
        } else {
          lines.push('**Server:** not a member of this server (or could not fetch member).');
        }
      }
      lines.push(`**Avatar:** ${user.displayAvatarURL({ size: 4096 })}`);
      await interaction.editReply({ content: lines.join('\n') });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: `Error: ${err.message}` }).catch(() => {});
    }
  }
});

client.login(TOKEN);
