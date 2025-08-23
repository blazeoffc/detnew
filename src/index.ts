import { Client as BotClient, GatewayIntentBits } from "discord.js";
import { Client as SelfBotClient } from "discord.js-selfbot-v13";
import { Webhook } from "discord-webhook-node";

import { Bot as GrammyBot } from "grammy";

import { Bot, Client } from "./bot.js";
import { getConfig } from "./config.js";
import { BotBackend, getEnv } from "./env.js";
import { BotType, SenderBot } from "./senderBot.js";
import { ProxyAgent } from "proxy-agent";

const env = getEnv();
const config = await getConfig();

const chatsToSend = config.outputChannels ?? [];
if (env.TELEGRAM_CHAT_ID) chatsToSend.unshift(env.TELEGRAM_CHAT_ID);

const agent = env.PROXY_URL
  ? new ProxyAgent({
      getProxyForUrl: () => env.PROXY_URL
    })
  : undefined;

const grammyClient =
  env.OUTPUT_BACKEND == BotType.Telegram
    ? new GrammyBot(env.TELEGRAM_TOKEN, {
        client: { baseFetchConfig: { agent, compress: true } }
      })
    : null;

const webhookClient =
  env.OUTPUT_BACKEND == BotType.DiscordWebhook
    ? new Webhook(env.DISCORD_WEBHOOK_URL)
    : null;

if (env.DISCORD_WEBHOOK_URL) {
  const match = env.DISCORD_WEBHOOK_URL.match(/webhooks\/(\d+)\//);
  if (match) config.mutedUsersIds?.push(match[1]);
}

const senderBot = new SenderBot({
  chatsToSend,
  disableLinkPreview: config.disableLinkPreview,
  replacementsDictionary: config.replacementsDictionary,

  botType: env.OUTPUT_BACKEND,

  grammyClient,
  telegramTopicId: env.TELEGRAM_TOPIC_ID ? Number(env.TELEGRAM_TOPIC_ID) : null,
  webhookClient
});

senderBot.prepare();

const client: Client = (() => {
  switch (env.DISCORD_BOT_BACKEND) {
    case BotBackend.Bot:
      return new BotClient({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.GuildMessages
        ]
      });
    case BotBackend.Selfbot:
      return new SelfBotClient(
        env.PROXY_URL !== undefined && agent !== undefined
          ? {
              ws: {
                agent
              },
              http: {
                agent: {
                  uri: env.PROXY_URL
                }
              }
            }
          : undefined
      );
  }
})();

const bot = new Bot(client, config, senderBot);

bot.client.login(env.DISCORD_TOKEN);

// Start HTTP server for Render health checks
const port = process.env.PORT || 3000;
const server = new (await import('http')).default.Server((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      bot: 'Discord to Telegram Forwarding Bot'
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord to Telegram Bot is running!');
  }
});

server.listen(port, () => {
  console.log(`[Main] 🌐 HTTP server listening on port ${port}`);
  console.log(`[Main] 🔍 Health check available at http://localhost:${port}/health`);
});

// Self-ping to keep the service alive
const selfPingUrl = process.env.SELF_PING_URL;
if (selfPingUrl) {
  console.log(`[Main] 🔄 Self-ping enabled: ${selfPingUrl}`);
  setInterval(async () => {
    try {
      const response = await fetch(selfPingUrl);
      if (response.ok) {
        console.log(`[Main] ✅ Self-ping successful: ${response.status}`);
      } else {
        console.log(`[Main] ⚠️ Self-ping warning: ${response.status}`);
      }
    } catch (error) {
      console.log(`[Main] ❌ Self-ping failed: ${error}`);
    }
  }, 4 * 60 * 1000); // Every 4 minutes
} else {
  console.log(`[Main] ℹ️ Self-ping disabled (set SELF_PING_URL to enable)`);
}
