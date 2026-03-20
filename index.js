import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  ModalBuilder,
  REST,
  Routes,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
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

/** Welcome/goodbye requires Guild Members intent. */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const GREETINGS_PATH = path.join(DATA_DIR, 'greetings.json');
const REACTION_ROLES_PATH = path.join(DATA_DIR, 'reaction-roles.json');
const GIVEAWAYS_PATH = path.join(DATA_DIR, 'giveaways.json');

const DEFAULT_GUILD_CONFIG = {
  welcome: {
    enabled: false,
    channelId: null,
    message: 'Welcome {member}!',
  },
  goodbye: {
    enabled: false,
    channelId: null,
    message: 'Goodbye {member}!',
  },
};

/** @type {Record<string, typeof DEFAULT_GUILD_CONFIG>} */
let greetingsByGuildId = {};

/**
 * Reaction self-role panels config:
 * {
 *   [guildId]: {
 *     panels: {
 *       [messageId]: {
 *         channelId: string,
 *         enabled: boolean,
 *         rolesByEmojiKey: { [emojiKey]: { roleId: string, reactEmoji: string } }
 *       }
 *     }
 *   }
 * }
 */
let reactionRolesByGuildId = {};

function loadGreetingsConfig() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(GREETINGS_PATH)) {
      fs.writeFileSync(GREETINGS_PATH, JSON.stringify({}, null, 2), 'utf8');
    }
    const raw = fs.readFileSync(GREETINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    greetingsByGuildId = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to load greetings config:', err);
    greetingsByGuildId = {};
  }
}

function saveGreetingsConfig() {
  try {
    fs.writeFileSync(GREETINGS_PATH, JSON.stringify(greetingsByGuildId, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save greetings config:', err);
  }
}

function getGuildConfig(guildId) {
  if (!greetingsByGuildId[guildId]) {
    // Deep clone defaults so we never mutate the same object reference.
    greetingsByGuildId[guildId] = JSON.parse(JSON.stringify(DEFAULT_GUILD_CONFIG));
  }
  return greetingsByGuildId[guildId];
}

function renderGreeting(template, member) {
  const content = template ?? '';
  return content
    .replaceAll('{member}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{tag}', member.user.tag)
    .replaceAll('{displayName}', member.displayName ?? member.user.username)
    .replaceAll('{guild}', member.guild?.name ?? '')
    .replaceAll(
      '{memberCount}',
      String(member.guild?.memberCount ?? ''),
    );
}

loadGreetingsConfig();

function loadReactionRolesConfig() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(REACTION_ROLES_PATH)) {
      fs.writeFileSync(REACTION_ROLES_PATH, JSON.stringify({}, null, 2), 'utf8');
    }
    const raw = fs.readFileSync(REACTION_ROLES_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    reactionRolesByGuildId = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to load reaction roles config:', err);
    reactionRolesByGuildId = {};
  }
}

function saveReactionRolesConfig() {
  try {
    fs.writeFileSync(REACTION_ROLES_PATH, JSON.stringify(reactionRolesByGuildId, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save reaction roles config:', err);
  }
}

function getReactionPanel(guildId, messageId) {
  if (!reactionRolesByGuildId[guildId]) reactionRolesByGuildId[guildId] = { panels: {} };
  if (!reactionRolesByGuildId[guildId].panels) reactionRolesByGuildId[guildId].panels = {};
  const panels = reactionRolesByGuildId[guildId].panels;
  if (!panels[messageId]) {
    panels[messageId] = {
      channelId: null,
      enabled: true,
      rolesByEmojiKey: {},
    };
  }
  return panels[messageId];
}

function getReactionPanelIfExists(guildId, messageId) {
  return reactionRolesByGuildId?.[guildId]?.panels?.[messageId] ?? null;
}

function deleteReactionPanel(guildId, messageId) {
  if (!reactionRolesByGuildId[guildId]?.panels) return;
  delete reactionRolesByGuildId[guildId].panels[messageId];
}

function getEmojiKeyFromReactionEmoji(emoji) {
  // Custom emoji has an `id`, unicode emoji usually only has a `name`.
  if (emoji?.id) return `custom:${emoji.id}`;
  const str = typeof emoji?.toString === 'function' ? emoji.toString() : `${emoji ?? ''}`;
  return `unicode:${str}`;
}

/**
 * Convert user emoji input to a stable emojiKey and the value that discord.js can use in `message.react()`.
 * unicode:🎮 stays as the raw emoji string.
 * custom: <:name:id> keeps the full `<:name:id>` string for reacting, but keys by id.
 */
function parseEmojiToKeyAndReactEmoji(emojiInput) {
  const s = (emojiInput ?? '').trim();
  const m = s.match(/^<a?:([^:>]+):(\d+)>$/);
  if (m) {
    const id = m[2];
    return { emojiKey: `custom:${id}`, reactEmoji: s };
  }
  return { emojiKey: `unicode:${s}`, reactEmoji: s };
}

loadReactionRolesConfig();

/**
 * Giveaway persistence.
 * Only one active giveaway per guild.
 */
let activeGiveawayByGuildId = {};
let giveawayFinalizeTimeouts = {};

function loadGiveawaysConfig() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(GIVEAWAYS_PATH)) {
      fs.writeFileSync(GIVEAWAYS_PATH, JSON.stringify({}, null, 2), 'utf8');
    }
    const raw = fs.readFileSync(GIVEAWAYS_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    activeGiveawayByGuildId =
      parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to load giveaways config:', err);
    activeGiveawayByGuildId = {};
  }
}

function saveGiveawaysConfig() {
  try {
    fs.writeFileSync(GIVEAWAYS_PATH, JSON.stringify(activeGiveawayByGuildId, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save giveaways config:', err);
  }
}

loadGiveawaysConfig();

function formatMs(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function isRealEligibleMember(member) {
  if (!member) return false;
  if (member.user?.bot) return false;
  if (member.id === OWNER_ID) return false; // never allow owner to be a winner
  const createdTs = member.user?.createdTimestamp;
  if (!createdTs) return false;
  const ageDays = (Date.now() - createdTs) / (1000 * 60 * 60 * 24);
  return ageDays >= 7;
}

async function finalizeGiveaway(guildId) {
  const giveaway = activeGiveawayByGuildId?.[guildId];
  if (!giveaway) return;
  // Avoid double-finalization.
  if (giveaway.finalized) return;
  giveaway.finalized = true;
  saveGiveawaysConfig();

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = guild ? await client.channels.fetch(giveaway.channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) return;

    const type = giveaway.type;
    const winnersMessagePrefix = 'Winner';

    if (type === 'random') {
      const entryEmoji = giveaway.entryEmoji ?? '🎉';
      const messageId = giveaway.giveawayMessageId;
      if (!messageId) {
        await channel.send('Giveaway cancelled.');
        return;
      }

      const entryMsg = await channel.messages.fetch(messageId).catch(() => null);
      if (!entryMsg) {
        await channel.send('Giveaway cancelled.');
        return;
      }

      // Note: some hosts/panel setups don't expose `entryMsg.reactions.fetch()`.
      // We avoid calling it and instead rely on `message.reactions.resolve(...)`
      // and a best-effort `entryMsg.fetch()` retry below.

      const reaction =
        typeof entryMsg.reactions?.resolve === 'function'
          ? entryMsg.reactions.resolve(entryEmoji)
          : entryMsg.reactions?.cache?.get(entryEmoji) ?? null;

      // If reactions weren't cached (common after some restarts/hosts), refetch the message once.
      let finalReaction = reaction;
      if (!finalReaction && typeof entryMsg.fetch === 'function') {
        await entryMsg.fetch().catch(() => null);
        finalReaction =
          typeof entryMsg.reactions?.resolve === 'function'
            ? entryMsg.reactions.resolve(entryEmoji)
            : entryMsg.reactions?.cache?.get(entryEmoji) ?? null;
      }

      if (!finalReaction) {
        await channel.send('Giveaway cancelled.');
        return;
      }

      const users = await finalReaction.users.fetch().catch(() => new Map());
      const eligibleIds = [];
      for (const userId of users.keys()) {
        if (!userId || userId === OWNER_ID) continue;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && isRealEligibleMember(member)) eligibleIds.push(userId);
      }

      if (!eligibleIds.length) {
        await channel.send('Giveaway cancelled.');
        return;
      }

      const winnerId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
      await channel.send(`${winnersMessagePrefix}: <@${winnerId}>`);
    } else if (type === 'invites') {
      const scores = giveaway.inviteScoresByInviterId || {};
      const nonOwner = Object.entries(scores).filter(
        ([inviterId, score]) => inviterId !== OWNER_ID && typeof score === 'number' && score > 0,
      );

      if (!nonOwner.length) {
        await channel.send('Giveaway cancelled.');
      } else {
        const botSafe = [];
        for (const [inviterId, score] of nonOwner) {
          const inviterMember = await guild.members.fetch(inviterId).catch(() => null);
          if (inviterMember && !inviterMember.user.bot) botSafe.push([inviterId, score]);
        }

        if (!botSafe.length) {
          await channel.send('Giveaway cancelled.');
          return;
        }

        const maxScore = Math.max(...botSafe.map(([, score]) => score));
        const winners = botSafe
          .filter(([, score]) => score === maxScore)
          .map(([id]) => id);
        if (!winners.length) {
          await channel.send('Giveaway cancelled.');
        } else {
          await channel.send(
            `Winners: ${winners.map((id) => `<@${id}>`).join(' ')}`,
          );
        }
      }
    } else {
      await channel.send('Giveaway cancelled.');
    }
  } catch (err) {
    console.error('Giveaway finalize failed:', err);
  } finally {
    delete activeGiveawayByGuildId[guildId];
    saveGiveawaysConfig();
    if (giveawayFinalizeTimeouts[guildId]) {
      clearTimeout(giveawayFinalizeTimeouts[guildId]);
      delete giveawayFinalizeTimeouts[guildId];
    }
  }
}

function scheduleGiveawayFinalize(guildId) {
  const giveaway = activeGiveawayByGuildId?.[guildId];
  if (!giveaway || giveaway.finalized) return;

  const delayMs = giveaway.endsAt - Date.now();
  if (giveawayFinalizeTimeouts[guildId]) {
    clearTimeout(giveawayFinalizeTimeouts[guildId]);
    delete giveawayFinalizeTimeouts[guildId];
  }

  if (delayMs <= 0) {
    void finalizeGiveaway(guildId);
    return;
  }

  giveawayFinalizeTimeouts[guildId] = setTimeout(
    () => finalizeGiveaway(guildId),
    delayMs,
  );
}

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

  // Schedule any saved giveaways (timer persistence).
  for (const guildId of Object.keys(activeGiveawayByGuildId)) {
    scheduleGiveawayFinalize(guildId);
  }
});

async function sendGreeting(kind, member) {
  const guildId = member.guild?.id;
  if (!guildId) return;
  if (GUILD_ID && guildId !== GUILD_ID) return;

  const cfg = getGuildConfig(guildId);
  const entry = cfg[kind];
  if (!entry?.enabled || !entry?.channelId) return;

  const channel = await client.channels.fetch(entry.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const rendered = renderGreeting(entry.message, member);
  if (!rendered.trim()) return;
  await channel.send({ content: rendered });
}

async function processGiveawayMemberJoin(member) {
  const guildId = member.guild?.id;
  if (!guildId) return;
  const giveaway = activeGiveawayByGuildId?.[guildId];
  if (!giveaway || giveaway.finalized) return;
  if (Date.now() > giveaway.endsAt) return;

  // "Real people": no bots, min account age, and owner excluded.
  if (!isRealEligibleMember(member)) return;

  if (giveaway.type === 'random') {
    // Random winner is picked from the whole server at the end.
    return;
  }

  if (giveaway.type === 'invites') {
    if (!giveaway.inviteScoresByInviterId) giveaway.inviteScoresByInviterId = {};
    if (!giveaway.inviteSnapshotByCode) giveaway.inviteSnapshotByCode = {};

    let currentInvites;
    try {
      currentInvites = await member.guild.invites.fetch();
    } catch (err) {
      console.error('Giveaway invites fetch failed:', err);
      return;
    }

    const changed = [];
    const nextSnapshot = { ...giveaway.inviteSnapshotByCode };

    for (const inv of currentInvites.values()) {
      const code = inv.code;
      const newUses = typeof inv.uses === 'number' ? inv.uses : 0;
      const prevUses = nextSnapshot?.[code]?.uses ?? 0;
      if (newUses > prevUses) {
        changed.push({ inviterId: inv.inviter?.id ?? null, delta: newUses - prevUses });
      }
      nextSnapshot[code] = { uses: newUses, inviterId: inv.inviter?.id ?? null };
    }

    giveaway.inviteSnapshotByCode = nextSnapshot;

    if (changed.length === 1) {
      const inviterId = changed[0].inviterId;
      if (inviterId && inviterId !== OWNER_ID) {
        giveaway.inviteScoresByInviterId[inviterId] = (giveaway.inviteScoresByInviterId[inviterId] ?? 0) + 1;
      } else if (!inviterId) {
        giveaway.fakeInviteCount = (giveaway.fakeInviteCount ?? 0) + 1;
      }
    } else {
      // Can't attribute confidently.
      giveaway.fakeInviteCount = (giveaway.fakeInviteCount ?? 0) + 1;
    }

    saveGiveawaysConfig();
    return;
  }
}

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  await processGiveawayMemberJoin(member);
  await sendGreeting('welcome', member);
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (member.user.bot) return;
  await sendGreeting('goodbye', member);
});

async function canManageRole(guild, roleId) {
  try {
    const role =
      guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId)).catch(() => null);
    if (!role) return false;

    const botMember =
      guild.members.cache.get(client.user.id) ||
      (await guild.members.fetch(client.user.id)).catch(() => null);
    if (!botMember) return false;

    // Role hierarchy check: bot can only manage roles below its highest role.
    return botMember.roles.highest.position > role.position;
  } catch {
    return false;
  }
}

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user?.bot) return;
    const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (!message?.guild) return;

    const guildId = message.guild.id;
    if (GUILD_ID && guildId !== GUILD_ID) return;

    const panel = getReactionPanelIfExists(guildId, message.id);
    if (!panel?.enabled) return;

    const emojiKey = getEmojiKeyFromReactionEmoji(reaction.emoji);
    const entry = panel.rolesByEmojiKey[emojiKey];
    if (!entry?.roleId) return;

    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    if (!(await canManageRole(message.guild, entry.roleId))) return;
    if (member.roles.cache.has(entry.roleId)) return;

    await member.roles.add(entry.roleId).catch(() => {});
  } catch (err) {
    console.error('RR add failed:', err);
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  try {
    if (user?.bot) return;
    const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (!message?.guild) return;

    const guildId = message.guild.id;
    if (GUILD_ID && guildId !== GUILD_ID) return;

    const panel = getReactionPanelIfExists(guildId, message.id);
    if (!panel?.enabled) return;

    const emojiKey = getEmojiKeyFromReactionEmoji(reaction.emoji);
    const entry = panel.rolesByEmojiKey[emojiKey];
    if (!entry?.roleId) return;

    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    if (!(await canManageRole(message.guild, entry.roleId))) return;
    if (!member.roles.cache.has(entry.roleId)) return;

    await member.roles.remove(entry.roleId).catch(() => {});
  } catch (err) {
    console.error('RR remove failed:', err);
  }
});

const HELP_TEXT = [
  '**Owner commands**',
  '`/ping` — quick alive check.',
  '`/help` — this list.',
  '`/status` — uptime, WebSocket ping, memory.',
  '`/clear count:N` — bulk-delete last N messages (Manage Messages).',
  '`/send channel:#…` — send your next message in 10s; text + images/files are forwarded exactly.',
  '`/remind minutes:N message:…` — pings you in this channel when time is up.',
  '`/edit message_link:… new_text:…` — edit a message **from this bot** (use Copy Message Link).',
  '`/dm user:@… message:…` — bot DMs that user.',
  '`/user member:@…` — ID, account age, server join, roles, avatar.',
  '`/welcome set channel:#… message:…` — welcome new members.',
  '`/welcome off` — disable welcome messages.',
  '`/goodbye set channel:#… message:…` — say goodbye on leave.',
  '`/goodbye off` — disable goodbye messages.',
  '`/rr create` `/rr add` `/rr remove` `/rr list` `/rr clear` `/rr delete` — reaction self-roles panels.',
  '`/giveaway start type:<random|invites> duration_minutes:<n> duration_seconds:<n> channel:<#> prize_message:<text>` — start a timed giveaway.',
  '`/giveaway status` — show time left for the active giveaway.',
  '`/giveaway cancel` — cancel the active giveaway.',
  '',
  '**Intents:** welcome/goodbye uses Server Members; /send text capture uses Message Content.',
].join('\n');

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isModalSubmit()) {
    if (!interaction.customId.startsWith('rrcreate:')) return;
    if (!isOwner(interaction.user.id)) {
      await interaction.reply({
        content: 'Only the bot owner can use this.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const payload = interaction.customId.slice('rrcreate:'.length);
    const [ownerId, channelId] = payload.split(':');
    if (ownerId !== interaction.user.id) {
      await interaction.reply({
        content: 'This modal is not for you.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'Run this in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (GUILD_ID && guildId !== GUILD_ID) {
      await interaction.reply({
        content: 'This bot is configured for a single server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const messageText = interaction.fields.getTextInputValue('rrcreate_message').trim();
    if (!messageText) {
      await interaction.reply({
        content: 'Panel message was empty.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const ch = await client.channels.fetch(channelId);
      if (!ch?.isTextBased()) {
        await interaction.reply({ content: 'Invalid channel.', flags: MessageFlags.Ephemeral });
        return;
      }

      const panelMessage = await ch.send(
        `${messageText}\n\nReact with the configured emojis to get roles.`,
      );
      const panel = getReactionPanel(guildId, panelMessage.id);
      panel.channelId = ch.id;
      panel.enabled = true;
      if (!panel.rolesByEmojiKey) panel.rolesByEmojiKey = {};
      saveReactionRolesConfig();

      await interaction.reply({
        content: `Panel created. Use this link in /rr add:\n${panelMessage.url}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error('RR create modal failed:', err);
      await interaction.reply({ content: `Failed: ${err.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (!isOwner(interaction.user.id)) {
    await interaction.reply({
      content: 'Only the bot owner can use commands.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === 'rr') {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'Run this in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (GUILD_ID && guildId !== GUILD_ID) {
      await interaction.reply({
        content: 'This bot is configured for a single server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: 'Pick a text channel.', flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`rrcreate:${interaction.user.id}:${channel.id}`)
        .setTitle('Reaction roles panel message');

      const messageInput = new TextInputBuilder()
        .setCustomId('rrcreate_message')
        .setLabel('Panel message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type the message that users will react to')
        .setRequired(true)
        .setMaxLength(2000);

      modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'add') {
      const messageLink = interaction.options.getString('message_link', true);
      const emojiInput = interaction.options.getString('emoji', true);
      const role = interaction.options.getRole('role', true);

      const parsed = parseDiscordMessageUrl(messageLink);
      if (!parsed) {
        await interaction.reply({ content: 'Invalid message link.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (GUILD_ID && parsed.guildId !== GUILD_ID) {
        await interaction.reply({ content: 'That panel is not in this server.', flags: MessageFlags.Ephemeral });
        return;
      }

      const panel = reactionRolesByGuildId?.[parsed.guildId]?.panels?.[parsed.messageId];
      if (!panel) {
        await interaction.reply({
          content: 'Panel not found in config. First run `/rr create` in the same message/channel.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const { emojiKey, reactEmoji } = parseEmojiToKeyAndReactEmoji(emojiInput);
      panel.rolesByEmojiKey[emojiKey] = { roleId: role.id, reactEmoji };
      saveReactionRolesConfig();

      try {
        const ch = await client.channels.fetch(parsed.channelId);
        if (!ch?.isTextBased()) throw new Error('Channel is not text-based');
        const panelMessage = await ch.messages.fetch(parsed.messageId);
        await panelMessage.react(reactEmoji);
      } catch (err) {
        // Mapping is saved even if reacting fails; reaction events may still work.
        console.error('RR add reaction failed:', err);
      }

      await interaction.reply({ content: 'Mapping saved.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'remove') {
      const messageLink = interaction.options.getString('message_link', true);
      const emojiInput = interaction.options.getString('emoji', true);

      const parsed = parseDiscordMessageUrl(messageLink);
      if (!parsed) {
        await interaction.reply({ content: 'Invalid message link.', flags: MessageFlags.Ephemeral });
        return;
      }
      const panel = reactionRolesByGuildId?.[parsed.guildId]?.panels?.[parsed.messageId];
      if (!panel) {
        await interaction.reply({ content: 'Panel not found in config.', flags: MessageFlags.Ephemeral });
        return;
      }

      const { emojiKey, reactEmoji } = parseEmojiToKeyAndReactEmoji(emojiInput);
      const entry = panel.rolesByEmojiKey[emojiKey];
      if (!entry?.roleId) {
        await interaction.reply({ content: 'That emoji is not mapped on this panel.', flags: MessageFlags.Ephemeral });
        return;
      }

      delete panel.rolesByEmojiKey[emojiKey];
      saveReactionRolesConfig();

      // Remove the role from everyone who currently has it.
      try {
        const guild = await client.guilds.fetch(parsed.guildId);
        const members = await guild.members.fetch();
        await Promise.all(
          [...members.values()].map(async (m) => {
            if (m.roles.cache.has(entry.roleId)) {
              await m.roles.remove(entry.roleId).catch(() => {});
            }
          }),
        );
      } catch (err) {
        console.error('RR remove role cleanup failed:', err);
      }

      // Remove the bot's reaction (best-effort).
      try {
        const ch = await client.channels.fetch(parsed.channelId);
        if (ch?.isTextBased()) {
          const panelMessage = await ch.messages.fetch(parsed.messageId);
          await panelMessage.reactions.fetch().catch(() => {});
          const reaction = panelMessage.reactions.resolve(entry.reactEmoji ?? reactEmoji);
          if (reaction) await reaction.users.remove(client.user.id).catch(() => {});
        }
      } catch (err) {
        console.error('RR remove reaction cleanup failed:', err);
      }

      await interaction.reply({ content: 'Mapping removed and role cleaned up.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'list') {
      const messageLink = interaction.options.getString('message_link', true);
      const parsed = parseDiscordMessageUrl(messageLink);
      if (!parsed) {
        await interaction.reply({ content: 'Invalid message link.', flags: MessageFlags.Ephemeral });
        return;
      }
      const panel = reactionRolesByGuildId?.[parsed.guildId]?.panels?.[parsed.messageId];
      if (!panel) {
        await interaction.reply({ content: 'Panel not found in config.', flags: MessageFlags.Ephemeral });
        return;
      }

      const guild = await client.guilds.fetch(parsed.guildId);
      const lines = Object.entries(panel.rolesByEmojiKey).map(([emojiKey, entry]) => {
        const roleMention = guild.roles.cache.get(entry.roleId)?.toString() ?? entry.roleId;
        return `${entry.reactEmoji} -> ${roleMention}`;
      });
      const preview = lines.slice(0, 20).join('\n') || '(no mappings)';
      await interaction.reply({ content: `Panel mappings:\n${preview}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'clear') {
      const messageLink = interaction.options.getString('message_link', true);
      const parsed = parseDiscordMessageUrl(messageLink);
      if (!parsed) {
        await interaction.reply({ content: 'Invalid message link.', flags: MessageFlags.Ephemeral });
        return;
      }
      const panel = reactionRolesByGuildId?.[parsed.guildId]?.panels?.[parsed.messageId];
      if (!panel) {
        await interaction.reply({ content: 'Panel not found in config.', flags: MessageFlags.Ephemeral });
        return;
      }

      const uniqueRoleIds = [...new Set(Object.values(panel.rolesByEmojiKey).map((e) => e.roleId))];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const guild = await client.guilds.fetch(parsed.guildId);
        const members = await guild.members.fetch();
        await Promise.all(
          [...members.values()].map(async (m) => {
            for (const rId of uniqueRoleIds) {
              if (m.roles.cache.has(rId)) {
                await m.roles.remove(rId).catch(() => {});
              }
            }
          }),
        );
      } catch (err) {
        console.error('RR clear cleanup failed:', err);
      }

      // Best-effort: remove bot reactions for mapped emojis.
      try {
        const ch = await client.channels.fetch(parsed.channelId);
        if (ch?.isTextBased()) {
          const panelMessage = await ch.messages.fetch(parsed.messageId);
          await panelMessage.reactions.fetch().catch(() => {});
          for (const entry of Object.values(panel.rolesByEmojiKey)) {
            const reaction = panelMessage.reactions.resolve(entry.reactEmoji);
            if (reaction) await reaction.users.remove(client.user.id).catch(() => {});
          }
        }
      } catch (err) {
        console.error('RR clear reaction cleanup failed:', err);
      }

      panel.rolesByEmojiKey = {};
      saveReactionRolesConfig();
      await interaction.editReply({ content: 'Panel mappings cleared (role cleanup best-effort).' });
      return;
    }

    if (sub === 'delete') {
      const messageLink = interaction.options.getString('message_link', true);
      const deleteMessage = interaction.options.getBoolean('delete_message') ?? false;
      const parsed = parseDiscordMessageUrl(messageLink);
      if (!parsed) {
        await interaction.reply({ content: 'Invalid message link.', flags: MessageFlags.Ephemeral });
        return;
      }

      const panel = reactionRolesByGuildId?.[parsed.guildId]?.panels?.[parsed.messageId];
      if (!panel) {
        await interaction.reply({ content: 'Panel not found in config.', flags: MessageFlags.Ephemeral });
        return;
      }

      // Remove any granted roles (best-effort), then delete config.
      try {
        const guild = await client.guilds.fetch(parsed.guildId);
        const members = await guild.members.fetch();
        const roleIds = [...new Set(Object.values(panel.rolesByEmojiKey).map((e) => e.roleId))];
        await Promise.all(
          [...members.values()].map(async (m) => {
            for (const rId of roleIds) {
              if (m.roles.cache.has(rId)) await m.roles.remove(rId).catch(() => {});
            }
          }),
        );
      } catch (err) {
        console.error('RR delete role cleanup failed:', err);
      }

      deleteReactionPanel(parsed.guildId, parsed.messageId);
      saveReactionRolesConfig();

      if (deleteMessage) {
        try {
          const ch = await client.channels.fetch(parsed.channelId);
          if (ch?.isTextBased()) {
            const panelMessage = await ch.messages.fetch(parsed.messageId);
            await panelMessage.delete().catch(() => {});
          }
        } catch (err) {
          console.error('RR delete message failed:', err);
        }
      }

      await interaction.reply({ content: 'Panel deleted.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'giveaway') {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'Run this in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (GUILD_ID && guildId !== GUILD_ID) {
      await interaction.reply({ content: 'This bot is configured for a single server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const existing = activeGiveawayByGuildId?.[guildId];

    if (sub === 'start') {
      if (existing && !existing.finalized) {
        const left = existing.endsAt - Date.now();
        await interaction.reply({
          content: `Giveaway already running. Time left: ${formatMs(left)}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const type = interaction.options.getString('type', true);
      // Prefer minutes/seconds, but keep duration_hours for older registered commands.
      const durationMinutes = interaction.options.getInteger('duration_minutes', false) ?? null;
      const durationSeconds = interaction.options.getInteger('duration_seconds', false) ?? null;
      const durationHours = interaction.options.getInteger('duration_hours', false) ?? null;
      const channel = interaction.options.getChannel('channel', true);
      const prizeMessage = interaction.options.getString('prize_message', true);

      if (!channel?.isTextBased()) {
        await interaction.reply({ content: 'Pick a text channel.', flags: MessageFlags.Ephemeral });
        return;
      }

      const startedAt = Date.now();
      let totalSeconds = 0;
      if (durationMinutes !== null || durationSeconds !== null) {
        const m = durationMinutes ?? 0;
        const s = durationSeconds ?? 0;
        totalSeconds = m * 60 + s;
      } else if (durationHours !== null) {
        totalSeconds = durationHours * 60 * 60;
      }
      if (totalSeconds <= 0) {
        await interaction.reply({
          content: 'Duration must be > 0 (use minutes/seconds).',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const endsAt = startedAt + totalSeconds * 1000;

      const giveaway = {
        guildId,
        type,
        channelId: channel.id,
        startedAt,
        endsAt,
        finalized: false,
        entryEmoji: '🎉',
        giveawayMessageId: null,
        inviteScoresByInviterId: {},
        fakeInviteCount: 0,
        inviteSnapshotByCode: {},
      };

      // Post the giveaway entry message immediately so random winners can be selected from reactors.
      if (type === 'random') {
        const entryText = `${prizeMessage}\n\nReact with 🎉 to enter.`;
        const entryMsg = await channel.send(entryText);
        await entryMsg.react(giveaway.entryEmoji);
        giveaway.giveawayMessageId = entryMsg.id;
      } else {
        // "invites" is a contest; no reaction entry needed.
        const entryMsg = await channel.send(prizeMessage);
        giveaway.giveawayMessageId = entryMsg.id;
      }

      // Build invite snapshot at start (only for invite-based giveaways).
      if (type === 'invites') {
        try {
          const guild = interaction.guild;
          if (!guild) throw new Error('Missing guild context');
          const invites = await guild.invites.fetch();
          for (const inv of invites.values()) {
            giveaway.inviteSnapshotByCode[inv.code] = {
              uses: typeof inv.uses === 'number' ? inv.uses : 0,
              inviterId: inv.inviter?.id ?? null,
            };
          }
        } catch (err) {
          console.error('Giveaway invite snapshot failed:', err);
          await interaction.reply({
            content: `Failed to fetch invites: ${err.message}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      activeGiveawayByGuildId[guildId] = giveaway;
      saveGiveawaysConfig();
      scheduleGiveawayFinalize(guildId);

      await interaction.reply({
        content: `Giveaway started (${type}) for ${formatMs(totalSeconds * 1000)}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'status') {
      if (!existing || existing.finalized) {
        await interaction.reply({ content: 'No active giveaway.', flags: MessageFlags.Ephemeral });
        return;
      }
      const left = existing.endsAt - Date.now();
      await interaction.reply({
        content: `Active giveaway (${existing.type}). Time left: ${formatMs(left)}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'cancel') {
      if (!existing || existing.finalized) {
        await interaction.reply({ content: 'No active giveaway.', flags: MessageFlags.Ephemeral });
        return;
      }

      delete activeGiveawayByGuildId[guildId];
      saveGiveawaysConfig();
      if (giveawayFinalizeTimeouts[guildId]) {
        clearTimeout(giveawayFinalizeTimeouts[guildId]);
        delete giveawayFinalizeTimeouts[guildId];
      }

      try {
        const guild = await client.guilds.fetch(guildId);
        const channel = guild ? await client.channels.fetch(existing.channelId).catch(() => null) : null;
        if (channel?.isTextBased()) {
          await channel.send('Giveaway cancelled.');
        }
      } catch (err) {
        console.error('Giveaway cancel post failed:', err);
      }

      await interaction.reply({ content: 'Cancelled.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: 'Unknown giveaway subcommand.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'welcome') {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'Run this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (GUILD_ID && guildId !== GUILD_ID) {
      await interaction.reply({
        content: 'This bot is configured for a single server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const cfg = getGuildConfig(guildId);
    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message', true);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: 'Pick a text channel.', flags: MessageFlags.Ephemeral });
        return;
      }
      cfg.welcome.enabled = true;
      cfg.welcome.channelId = channel.id;
      cfg.welcome.message = message;
      saveGreetingsConfig();
      await interaction.reply({
        content: `Welcome enabled in ${channel}. Template saved.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (sub === 'off') {
      cfg.welcome.enabled = false;
      cfg.welcome.channelId = null;
      saveGreetingsConfig();
      await interaction.reply({
        content: 'Welcome disabled.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (interaction.commandName === 'goodbye') {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'Run this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (GUILD_ID && guildId !== GUILD_ID) {
      await interaction.reply({
        content: 'This bot is configured for a single server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const cfg = getGuildConfig(guildId);
    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message', true);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: 'Pick a text channel.', flags: MessageFlags.Ephemeral });
        return;
      }
      cfg.goodbye.enabled = true;
      cfg.goodbye.channelId = channel.id;
      cfg.goodbye.message = message;
      saveGreetingsConfig();
      await interaction.reply({
        content: `Goodbye enabled in ${channel}. Template saved.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (sub === 'off') {
      cfg.goodbye.enabled = false;
      cfg.goodbye.channelId = null;
      saveGreetingsConfig();
      await interaction.reply({
        content: 'Goodbye disabled.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: 'Pong!', flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({ content: HELP_TEXT, flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'clear') {
    const count = interaction.options.getInteger('count', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const listenChannel = interaction.channel;
    if (!listenChannel?.isTextBased()) {
      await interaction.reply({
        content: 'Run `/send` from a text channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content:
        `Send your next message in this channel within 10 seconds. ` +
        `I will forward text + attachments to ${targetChannel}.`,
      flags: MessageFlags.Ephemeral,
    });

    try {
      const collected = await listenChannel.awaitMessages({
        filter: (m) => m.author.id === interaction.user.id && !m.author.bot,
        max: 1,
        time: 10_000,
        errors: ['time'],
      });
      const src = collected.first();
      const files = [...src.attachments.values()].map((a) => ({
        attachment: a.url,
        name: a.name || 'attachment',
      }));
      const payload = {
        ...(src.content ? { content: src.content } : {}),
        ...(files.length ? { files } : {}),
      };

      if (!payload.content && !payload.files) {
        await interaction.followUp({
          content: 'No text or attachments found. Nothing sent.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await targetChannel.send(payload);
      await interaction.followUp({
        content: `Sent to ${targetChannel}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.followUp({
        content: 'No message received within 10 seconds. Cancelled.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (interaction.commandName === 'remind') {
    const minutes = interaction.options.getInteger('minutes', true);
    const text = interaction.options.getString('message', true);
    const channel = interaction.channel;
    if (!channel?.isTextBased()) {
      await interaction.reply({
        content: 'Use this in a text channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const userId = interaction.user.id;
    const ms = minutes * 60 * 1000;
    await interaction.reply({
      content: `Reminder set for **${minutes}** minute(s) in this channel.`,
      flags: MessageFlags.Ephemeral,
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
          "Invalid link. Use **Copy Message Link** on the bot's message, or format `guildId-channelId-messageId`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (interaction.guildId && parsed.guildId !== interaction.guildId) {
      await interaction.reply({
        content: 'That message is from another server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
      await interaction.reply({
        content: `DM sent to **${user.tag}**.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error(err);
      await interaction.reply({
        content: `Could not DM **${user.tag}** (DMs closed or no shared server). ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (interaction.commandName === 'user') {
    const user = interaction.options.getUser('member', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const lines = [
        `**User:** ${user.tag} (\`${user.id}\`)`,
        `**Mention:** ${user}`,
        `**Bot:** ${user.bot ? 'yes' : 'no'}`,
        `**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`,
      ];
      if (interaction.inGuild()) {
        const guild = interaction.guild;
        const member = interaction.options.getMember('member');
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
