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
      'Pick a channel, then send your next message in 10s (text + attachments) (owner only)',
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
  {
    name: 'welcome',
    description: 'Send welcome messages to a channel (owner only)',
    options: [
      {
        name: 'set',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Enable welcome messages',
        options: [
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'Channel for welcome',
            required: true,
            channel_types: [0, 5, 11],
          },
          {
            name: 'message',
            type: ApplicationCommandOptionType.String,
            description: 'Template; use {member}, {username}, {guild}',
            required: true,
          },
        ],
      },
      {
        name: 'off',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Disable welcome messages',
      },
    ],
  },
  {
    name: 'goodbye',
    description: 'Send goodbye messages to a channel (owner only)',
    options: [
      {
        name: 'set',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Enable goodbye messages',
        options: [
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'Channel for goodbye',
            required: true,
            channel_types: [0, 5, 11],
          },
          {
            name: 'message',
            type: ApplicationCommandOptionType.String,
            description: 'Template; use {member}, {username}, {guild}',
            required: true,
          },
        ],
      },
      {
        name: 'off',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Disable goodbye messages',
      },
    ],
  },
  {
    name: 'rr',
    description: 'Reaction self-roles panel manager (owner only)',
    options: [
      {
        name: 'create',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Create a panel message',
        options: [
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'Where to post the panel',
            required: true,
            channel_types: [0, 5, 11],
          },
          {
            name: 'message',
            type: ApplicationCommandOptionType.String,
            description: 'Panel text',
            required: true,
          },
        ],
      },
      {
        name: 'add',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Map an emoji to a role',
        options: [
          {
            name: 'message_link',
            type: ApplicationCommandOptionType.String,
            description: 'Panel message link',
            required: true,
          },
          {
            name: 'emoji',
            type: ApplicationCommandOptionType.String,
            description: 'Emoji (unicode or <:name:id>)',
            required: true,
          },
          {
            name: 'role',
            type: ApplicationCommandOptionType.Role,
            description: 'Role to grant on react add',
            required: true,
          },
        ],
      },
      {
        name: 'remove',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Unmap emoji and remove role from members',
        options: [
          {
            name: 'message_link',
            type: ApplicationCommandOptionType.String,
            description: 'Panel message link',
            required: true,
          },
          {
            name: 'emoji',
            type: ApplicationCommandOptionType.String,
            description: 'Emoji used in the mapping',
            required: true,
          },
        ],
      },
      {
        name: 'list',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'List emoji->role mappings for a panel',
        options: [
          {
            name: 'message_link',
            type: ApplicationCommandOptionType.String,
            description: 'Panel message link',
            required: true,
          },
        ],
      },
      {
        name: 'clear',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Remove all mappings for a panel',
        options: [
          {
            name: 'message_link',
            type: ApplicationCommandOptionType.String,
            description: 'Panel message link',
            required: true,
          },
        ],
      },
      {
        name: 'delete',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Delete panel config (and message optionally)',
        options: [
          {
            name: 'message_link',
            type: ApplicationCommandOptionType.String,
            description: 'Panel message link',
            required: true,
          },
          {
            name: 'delete_message',
            type: ApplicationCommandOptionType.Boolean,
            description: 'Also delete the panel message',
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: 'giveaway',
    description: 'Timed giveaways (owner only)',
    options: [
      {
        name: 'start',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Start a giveaway',
        options: [
          {
            name: 'type',
            type: ApplicationCommandOptionType.String,
            description: 'Giveaway type',
            required: true,
            choices: [
              { name: 'random', value: 'random' },
              { name: 'invites', value: 'invites' },
            ],
          },
          {
            name: 'duration_hours',
            type: ApplicationCommandOptionType.Integer,
            description: 'Duration in hours',
            required: true,
            min_value: 1,
            max_value: 168,
          },
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'Channel to post the winner',
            required: true,
            channel_types: [0, 5, 11],
          },
        ],
      },
      {
        name: 'status',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Show time left',
      },
      {
        name: 'cancel',
        type: ApplicationCommandOptionType.Subcommand,
        description: 'Cancel the active giveaway',
      },
    ],
  },
];
