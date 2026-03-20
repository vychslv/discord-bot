import { ApplicationCommandOptionType } from 'discord.js';

/** Slash command definitions (owner-only bot; enforced in index.js) */
export const commands = [
  {
    name: 'ping',
    description: 'Check if the bot is alive (owner only)',
  },
  {
    name: 'help',
    description: 'List all owner commands and usage (owner only)',
  },
  {
    name: 'status',
    description: 'Bot uptime, ping, and memory (owner only)',
  },
  {
    name: 'clear',
    description: 'Delete the last N messages in this channel (owner only)',
    options: [
      {
        name: 'count',
        type: ApplicationCommandOptionType.Integer,
        description: 'Number of messages to delete (1–100)',
        required: true,
        min_value: 1,
        max_value: 100,
      },
    ],
  },
  {
    name: 'send',
    description:
      'Pick a channel, then type your message here within 10s — bot sends it there with same formatting (owner only)',
    options: [
      {
        name: 'channel',
        type: ApplicationCommandOptionType.Channel,
        description: 'Channel the bot should post your next message into',
        required: true,
        channel_types: [0, 5, 11],
      },
    ],
  },
  {
    name: 'remind',
    description: 'Remind you in this channel after N minutes (owner only)',
    options: [
      {
        name: 'minutes',
        type: ApplicationCommandOptionType.Integer,
        description: 'How many minutes to wait (1–10080 = 1 week)',
        required: true,
        min_value: 1,
        max_value: 10080,
      },
      {
        name: 'message',
        type: ApplicationCommandOptionType.String,
        description: 'Reminder text',
        required: true,
      },
    ],
  },
  {
    name: 'edit',
    description: 'Edit a message sent by this bot (paste message link) (owner only)',
    options: [
      {
        name: 'message_link',
        type: ApplicationCommandOptionType.String,
        description:
          'Right-click the bot message → Copy Message Link (or guildId-channelId-messageId)',
        required: true,
      },
      {
        name: 'new_text',
        type: ApplicationCommandOptionType.String,
        description: 'New message content (Discord markdown supported)',
        required: true,
      },
    ],
  },
  {
    name: 'dm',
    description: 'Send a DM from the bot to a user (owner only)',
    options: [
      {
        name: 'user',
        type: ApplicationCommandOptionType.User,
        description: 'Who should receive the DM',
        required: true,
      },
      {
        name: 'message',
        type: ApplicationCommandOptionType.String,
        description: 'Text to send',
        required: true,
      },
    ],
  },
  {
    name: 'user',
    description: 'Show Discord profile info for a user in this server (owner only)',
    options: [
      {
        name: 'member',
        type: ApplicationCommandOptionType.User,
        description: 'User to look up',
        required: true,
      },
    ],
  },
];
