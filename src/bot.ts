import {
  AnyChannel,
  Client as SelfBotClient,
  Message,
  MessageAttachment,
  PartialMessage,
  Role,
  User
} from "discord.js-selfbot-v13";
import { Client as BotClient } from "discord.js";
import { InputMediaBuilder } from "grammy";
import { InputFile, InputMediaPhoto } from "grammy/types";

import { Config } from "./config.js";
import { isAllowedByConfig } from "./filterMessages.js";
import { formatSize } from "./format.js";
import { SenderBot } from "./senderBot.js";
import { getEnv } from "./env.js";

interface RenderOutput {
  content: string;
  images: InputMediaPhoto[];
}

export type Client<Ready extends boolean = boolean> =
  | SelfBotClient<Ready>
  | BotClient<Ready>;

export class Bot {
  messagesToSend: string[] = [];
  imagesToSend: InputMediaPhoto[] = [];
  senderBot: SenderBot;
  config: Config;
  client: Client;

  constructor(client: Client, config: Config, senderBot: SenderBot) {
    this.config = config;
    this.senderBot = senderBot;
    this.client = client;

    // @ts-expect-error This expression is not callable.
    this.client.on("ready", (clientArg: Client<true>) => {
      console.log(`Logged into Discord as @${clientArg.user?.tag}!`);
      console.log(`[DEBUG] Bot is ready and listening for messages...`);
      console.log(`[DEBUG] Config allowedChannelsIds: ${JSON.stringify(this.config.allowedChannelsIds)}`);
      console.log(`[DEBUG] Config allowedUsersIds: ${JSON.stringify(this.config.allowedUsersIds)}`);
    });

    // @ts-expect-error This expression is not callable.
    this.client.on("messageCreate", async (message: Message) => {
      // FIRST: Only process messages from the specific channels
      const env = getEnv();
      const allowedChannelIds = env.DISCORD_CHANNEL_IDS?.split(',').map(id => id.trim()) || [
        "1404808661070647356", // Default channel 1
        "1202302395854364762"  // Default channel 2
      ];
      
      if (!allowedChannelIds.includes(message.channelId)) {
        return; // Silently ignore messages from other channels
      }
      
      console.log(`[DEBUG] ===== NEW MESSAGE DETECTED =====`);
      console.log(`[DEBUG] Channel ID: ${message.channelId}`);
      console.log(`[DEBUG] Author: ${message.author?.tag} (ID: ${message.author?.id})`);
      console.log(`[DEBUG] Content: "${message.content}"`);
      console.log(`[DEBUG] Guild ID: ${message.guildId}`);
      console.log(`[DEBUG] Bot message: ${message.author?.bot}`);
      
      // Skip bot messages
      if (message.author?.bot) {
        console.log(`[DEBUG] Skipping bot message`);
        return;
      }
      
      // TEMPORARY: Only allow your specific user ID
      if (message.author?.id !== "346137576588967937") {
        console.log(`[DEBUG] Skipping message from user ${message.author?.id} (not you)`);
        return;
      }
      
      const allowed = isAllowedByConfig(message, this.config);
      console.log(`[DEBUG] Allowed by config: ${allowed}`);
      console.log(`[DEBUG] Author ID: "${message.author?.id}" (type: ${typeof message.author?.id})`);
      console.log(`[DEBUG] Allowed users: ${JSON.stringify(this.config.allowedUsersIds)} (types: ${this.config.allowedUsersIds?.map(id => typeof id)})`);
      
      if (!allowed) {
        console.log(`[DEBUG] Message filtered out by config`);
        return;
      }
      
      console.log(`[DEBUG] ✅ Message passed filter, forwarding to Telegram...`);
      const renderOutput = await this.messageAction(message);

      if (this.config.stackMessages) {
        this.messagesToSend.push(renderOutput.content);
        this.imagesToSend.push(...renderOutput.images);
      } else {
        this.senderBot.sendData([renderOutput.content], renderOutput.images);
      }
    });

    if (config.showMessageUpdates)
      // @ts-expect-error This expression is not callable.
      this.client.on(
        "messageUpdate",
        async (_oldMessage: Message, newMessage: Message) => {
          if (!isAllowedByConfig(newMessage, this.config)) return;
          const renderOutput = await this.messageAction(newMessage, "updated");

          if (this.config.stackMessages) {
            this.messagesToSend.push(renderOutput.content);
            this.imagesToSend.push(...renderOutput.images);
          } else {
            this.senderBot.sendData(
              [renderOutput.content],
              renderOutput.images
            );
          }
        }
      );

    if (config.showMessageDeletions)
      // @ts-expect-error This expression is not callable.
      this.client.on("messageDelete", async (message: Message) => {
        if (!isAllowedByConfig(message, this.config)) return;
        const renderOutput = await this.messageAction(message, "deleted");

        if (this.config.stackMessages) {
          this.messagesToSend.push(renderOutput.content);
          this.imagesToSend.push(...renderOutput.images);
        } else {
          this.senderBot.sendData([renderOutput.content], renderOutput.images);
        }
      });

    if (config.stackMessages)
      setInterval(() => {
        this.senderBot.sendData(this.messagesToSend, this.imagesToSend);
        this.messagesToSend = [];
        this.imagesToSend = [];
      }, 5000);
  }

  async messageAction(
    message: Message<boolean> | PartialMessage,
    tag?: string
  ) {
    let render = "";
    const allAttachments: string[] = [];
    const images: InputMediaPhoto[] = [];

    // Ultra minimalistic format: just the message content

    if (message.reference) {
      const referenceMessage = await message.fetchReference();
      const renderOutput = await this.messageAction(referenceMessage);
      render += `\n> ${renderOutput.content}`;
      images.push(...renderOutput.images);
    }

    render += await this.renderMentions(
      message.content,
      message.mentions.users.values(),
      message.mentions.channels.values(),
      message.mentions.roles.values()
    );

    const embeds = message.embeds.map((embed) => {
      let stringEmbed = "";

      if (embed.title) stringEmbed += `${embed.title}\n`;
      if (embed.description) stringEmbed += `${embed.description}\n`;
      if (embed.url) stringEmbed += `${embed.url}\n`;

      if (embed.image) {
        if (this.config.imagesAsMedia)
          images.push(InputMediaBuilder.photo(embed.image.url));
      }

      return stringEmbed;
    });

    render += embeds.join("");

    for (const attachment of message.attachments.values()) {
      if (
        this.config.imagesAsMedia &&
        attachment.contentType &&
        attachment.contentType.startsWith("image") &&
        attachment.size < 10 * 1024 * 1024
      ) {
        images.push(await this.attachmentToMedia(attachment));
        continue;
      }

      allAttachments.push(
        `📎 ${attachment.name}`
      );
    }

    render += allAttachments.join("");

    console.log(render);

    return { content: render, images } as RenderOutput;
  }

  async attachmentToMedia(attachment: MessageAttachment) {
    if (attachment.size < 5 * 1024 * 1024)
      return InputMediaBuilder.photo(attachment.url);

    const res = await fetch(attachment.url);
    const data = await res.blob();
    const inputFile = new InputFile(data.stream());

    return InputMediaBuilder.photo(inputFile);
  }

  async renderMentions(
    text: string,
    users: IterableIterator<User>,
    channels: IterableIterator<AnyChannel>,
    roles: IterableIterator<Role>
  ) {
    for (const user of users) {
      text = text.replace(`<@${user.id}>`, `@${user.displayName}`);
    }

    for (const channel of channels) {
      try {
        const fetchedChannel = await channel.fetch();

        text = text.replace(
          `<#${channel.id}>`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          `#${(fetchedChannel as any).name}`
        );
      } catch (err) {
        console.error(err);
      }
    }

    for (const role of roles) {
      text = text.replace(`<@&${role.id}>`, `@${role.name}`);
    }

    return text;
  }
}
