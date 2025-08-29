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
import { AiSummarizer } from "./aiSummarizer.js";

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
  private lastLoggedChannels: Set<string> = new Set();
  private channelSkipCounts: Map<string, number> = new Map();
  private userSkipCounts: Map<string, number> = new Map();
  private aiSummarizer: AiSummarizer | null = null;

  constructor(client: Client, config: Config, senderBot: SenderBot) {
    this.config = config;
    this.senderBot = senderBot;
    this.client = client;

    // @ts-expect-error This expression is not callable.
    this.client.on("ready", (clientArg: Client<true>) => {
      const env = getEnv();
      console.log(`Logged into Discord as @${clientArg.user?.tag}!`);
      console.log(`[DEBUG] Bot is ready and listening for messages...`);
      console.log(`[DEBUG] Environment DISCORD_CHANNEL_IDS: "${env.DISCORD_CHANNEL_IDS}"`);
      console.log(`[DEBUG] Environment DISCORD_USER_IDS: "${env.DISCORD_USER_IDS}"`);
      console.log(`[DEBUG] Config allowedChannelsIds: ${JSON.stringify(this.config.allowedChannelsIds)}`);
      console.log(`[DEBUG] Config allowedUsersIds: ${JSON.stringify(this.config.allowedUsersIds)}`);
      // Initialize AI summarizer if enabled and key exists
      if (env.AI_SUMMARY_ENABLED === "true" && env.GEMINI_API_KEY) {
        this.aiSummarizer = new AiSummarizer(env.GEMINI_API_KEY);
        console.log(`[DEBUG] AI Telugu summarizer enabled`);
      } else {
        console.log(`[DEBUG] AI Telugu summarizer disabled`);
      }
    });

    // @ts-expect-error This expression is not callable.
    this.client.on("messageCreate", async (message: Message) => {
      // FIRST: Only process messages from the specific channels
      const env = getEnv();
      const allowedChannelIds = env.DISCORD_CHANNEL_IDS?.split(',').map(id => id.trim()) || 
        this.config.allowedChannelsIds || [
          "1404808661070647356", // Default channel 1
          "1202302395854364762"  // Default channel 2
        ];
      
      console.log(`[DEBUG] Using channel IDs: ${JSON.stringify(allowedChannelIds)}`);
      console.log(`[DEBUG] Message channel ID: ${message.channelId}`);
      
      if (!allowedChannelIds.includes(message.channelId)) {
        // Only log channel skips occasionally to reduce noise
        this.logChannelSkip(message.channelId);
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
      
      // Check if user is allowed
      const allowedUserIds = env.DISCORD_USER_IDS?.split(',').map(id => id.trim()) || 
        this.config.allowedUsersIds || ["404290235776"];
      
      console.log(`[DEBUG] Using user IDs: ${JSON.stringify(allowedUserIds)}`);
      console.log(`[DEBUG] Message author ID: ${message.author?.id}`);
      
      if (!allowedUserIds.includes(message.author?.id)) {
        // Only log user skips occasionally to reduce noise
        this.logUserSkip(message.author?.id || 'unknown');
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
    const originalText = message.content;
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

    // Attempt to build a Telugu breakdown if the message looks like a recap/list
    const breakdown = this.buildTeluguBreakdown(originalText);
    if (breakdown) {
      render += `\n\n📝 వివరణ (Telugu)\n${breakdown}`;
    }

    // If AI summarizer is enabled, append AI Telugu summary below rule-based breakdown
    if (this.aiSummarizer) {
      try {
        const aiSummary = await this.aiSummarizer.summarizeToTelugu(originalText);
        if (aiSummary) {
          render += `\n\n🤖 AI సారాంశం (Telugu)\n${aiSummary}`;
        }
      } catch {
        // ignore AI errors silently
      }
    }

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

  private buildTeluguBreakdown(text: string): string | null {
    if (!text) return null;

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*>\s?/, "").trim())
      .filter((l) => l.length > 0 && !/^quick\s*recap/i.test(l));

    if (lines.length === 0) return null;

    const explainLine = (line: string): string => {
      const lower = line.toLowerCase();

      // Try to extract a symbol as the first token (e.g., BTC, ENA, SOL)
      const firstToken = (line.match(/^([A-Za-z0-9_.-]+)/)?.[1] || "").toUpperCase();
      const symbol = /[A-Z]/.test(firstToken) ? firstToken : "";

      const parts: string[] = [];
      if (symbol) parts.push(`• ${symbol}:`);

      // Status mappings
      const phrases: Array<{ test: RegExp; text: string }> = [
        { test: /(short|sell)\s+invalid|invalid\s+short/, text: "షార్ట్ సెటప్ చెల్లదు" },
        { test: /(long|buy)\s+invalid|invalid\s+long/, text: "లాంగ్ సెటప్ చెల్లదు" },
        { test: /front\s*run/, text: "ఫ్రంట్-రన్ (ముందస్తు ట్రేడింగ్) కారణంగా" },
        { test: /stopped\s*be|stop(ped)?\s*at\s*be|breakeven|break\s*even/i, text: "బ్రేక్-ఈవెన్ వద్ద స్టాప్ అయింది" },
        { test: /trade\s*active/i, text: "ట్రేడ్ ప్రస్తుతం యాక్టివ్‌లో ఉంది" },
        { test: /limit\s*active/i, text: "లిమిట్ ఆర్డర్ యాక్టివ్‌లో ఉంది" },
        { test: /second\s*entries?\s*not\s*valid/i, text: "రెండో ఎంట్రీలు ఇప్పటికీ అనుమతించబడలేదు" },
        { test: /until\s*i\s*say\s*it\s*is/i, text: "నేను చెప్పే వరకు వేచి ఉండాలి" }
      ];

      const matched: string[] = [];
      for (const p of phrases) {
        if (p.test.test(lower)) matched.push(p.text);
      }

      if (matched.length === 0) {
        // Fallback generic explanation
        if (symbol) {
          return `• ${symbol}: అందించిన లైన్లో స్థితి నవీకరణ ఉంది: "${line}"`;
        }
        return `• వివరణ: "${line}"`;
      }

      // Join with natural Telugu phrasing
      const composed = matched
        .map((t, i) => (i === 0 ? t : t.replace(/^/, ", ")))
        .join("");

      return parts.length > 0 ? `${parts.join(" ")} ${composed}` : `• ${composed}`;
    };

    const explained = lines.map(explainLine).join("\n");
    // Add an extra rule-based note if present
    if (/second\s*entries?\s*not\s*valid/i.test(text)) {
      return `${explained}\n• గమనిక: రెండో ఎంట్రీలు అధికారిక నిర్ధారణ వచ్చే వరకు చెల్లవు.`;
    }

    return explained;
  }

  private logChannelSkip(channelId: string): void {
    const count = (this.channelSkipCounts.get(channelId) || 0) + 1;
    this.channelSkipCounts.set(channelId, count);
    
    // Only log every 10th skip for the same channel to reduce noise
    if (count % 10 === 0) {
      console.log(`[DEBUG] Channel ${channelId} skipped ${count} times (not in allowed list)`);
    }
  }

  private logUserSkip(userId: string): void {
    const count = (this.userSkipCounts.get(userId) || 0) + 1;
    this.userSkipCounts.set(userId, count);
    
    // Only log every 10th skip for the same user to reduce noise
    if (count % 10 === 0) {
      console.log(`[DEBUG] User ${userId} skipped ${count} times (not allowed)`);
    }
  }
}
