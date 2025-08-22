import { Bot } from "grammy";
import { AITrader, TradingSignal } from "./aiTrader.js";

export class TradingBot {
  private telegramBot: Bot;
  private aiTrader: AITrader;
  private targetChatId: string;
  private isEnabled: boolean = true;

  constructor(
    telegramBot: Bot,
    geminiApiKey: string,
    targetChatId: string
  ) {
    this.telegramBot = telegramBot;
    this.aiTrader = new AITrader(geminiApiKey);
    this.targetChatId = targetChatId;

    this.setupTelegramHandlers();
    console.log(`[TradingBot] Initialized in analysis mode (no trading execution)`);
  }

  private setupTelegramHandlers() {
    console.log('[TradingBot] Setting up Telegram handlers...');
    
    // Listen for messages in the target chat
    this.telegramBot.on("message:text", async (ctx) => {
      try {
        console.log(`[TradingBot] Raw message received from chat ${ctx.chat.id}: "${ctx.message.text}"`);
        
        // Only process messages from the target chat
        if (ctx.chat.id.toString() !== this.targetChatId) {
          console.log(`[TradingBot] Ignoring message from chat ${ctx.chat.id} (target: ${this.targetChatId})`);
          return;
        }

        const messageText = ctx.message.text;
        console.log(`[TradingBot] Processing message: "${messageText}"`);

        // Skip if trading is disabled
        if (!this.isEnabled) {
          console.log(`[TradingBot] Trading is disabled, ignoring message`);
          return;
        }

        // Handle commands directly
        if (messageText.startsWith('/')) {
          console.log(`[TradingBot] Command detected: ${messageText}`);
          await this.handleCommand(ctx, messageText);
          return;
        }

        // Analyze message for trading signals
        await this.processMessage(messageText);

      } catch (error) {
        console.error('[TradingBot] Error processing message:', error);
      }
    });

    // Handle bot commands
    this.telegramBot.command("trading_status", (ctx) => {
      console.log('[TradingBot] Trading status command executed');
      ctx.reply(`🤖 Trading Bot Status: ${this.isEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n\n⚠️ **Note**: Trading execution has been removed. This bot now only analyzes messages for trading signals.`);
    });

    this.telegramBot.command("enable_trading", (ctx) => {
      this.isEnabled = true;
      ctx.reply("✅ Trading analysis enabled");
    });

    this.telegramBot.command("disable_trading", (ctx) => {
      this.isEnabled = false;
      ctx.reply("❌ Trading analysis disabled");
    });

    this.telegramBot.command("help", (ctx) => {
      const helpText = `🤖 **Trading Bot Commands**\n\n` +
        `📊 **/trading_status** - Show bot status\n` +
        `✅ **/enable_trading** - Enable message analysis\n` +
        `❌ **/disable_trading** - Disable message analysis\n` +
        `❓ **/help** - Show this help message\n\n` +
        `⚠️ **Note**: This bot now only analyzes messages for trading signals. Trading execution has been removed.`;
      
      ctx.reply(helpText, { parse_mode: "Markdown" });
    });
  }

  private async handleCommand(ctx: any, command: string) {
    console.log(`[TradingBot] Executing command: ${command}`);
    
    try {
      switch (command) {
        case '/trading_status':
          console.log('[TradingBot] Trading status command executed');
          const statusText = '📊 **Trading Bot Status Report**\n\n' +
            `🤖 **Bot Status**: ${this.isEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
            `📈 **Mode**: Analysis Only (No Trading Execution)\n` +
            `🔍 **Function**: Analyzes messages for trading signals\n` +
            `⚠️ **Note**: Trading execution has been removed from this bot`;
          
          await ctx.reply(statusText, { parse_mode: "Markdown" });
          break;
          
        case '/help':
          const helpText = `🤖 **Trading Bot Commands**\n\n` +
            `📊 **/trading_status** - Show bot status\n` +
            `✅ **/enable_trading** - Enable message analysis\n` +
            `❌ **/disable_trading** - Disable message analysis\n` +
            `❓ **/help** - Show this help message\n\n` +
            `⚠️ **Note**: This bot now only analyzes messages for trading signals. Trading execution has been removed.`;
          
          await ctx.reply(helpText, { parse_mode: "Markdown" });
          break;
          
        default:
          await ctx.reply(`❓ Unknown command: ${command}\n\nUse /help to see available commands.`);
      }
    } catch (error) {
      console.error('[TradingBot] Error executing command:', error);
      await ctx.reply(`❌ Error executing command: ${error}`);
    }
  }

  private async processMessage(messageText: string) {
    if (!this.isEnabled) {
      console.log('[TradingBot] Trading is disabled, ignoring message');
      return;
    }

    try {
      console.log(`[TradingBot] Analyzing message for trading signals...`);

      // Use AI to analyze the message
      const signal = await this.aiTrader.analyzeTradingMessage(messageText);
      
      if (!signal) {
        console.log(`[TradingBot] No trading signal detected in message`);
        return;
      }

      console.log(`[TradingBot] Trading signal detected:`, signal);

      // Send analysis result message
      const entriesText = signal.entries.length > 1 
        ? `📈 **${signal.side}** at **${signal.entries.join(', ')}** (${signal.entries.length} entries)`
        : `📈 **${signal.side}** at **${signal.entries[0]}**`;
      
      // Determine stop loss display text
      const stopLossText = signal.stopLoss 
        ? `${signal.stopLoss}${signal.stopLossCondition ? ` (${signal.stopLossCondition})` : ''}`
        : `$${(signal.entries[0] * 0.95).toFixed(2)} (default: 5% below entry)`;
      
      await this.sendTelegramMessage(`🤖 **AI Trading Signal Analysis**\n\n` +
        `📊 **${signal.symbol}**\n` +
        `${entriesText}\n` +
        `💰 Risk: **${signal.riskPercent}%** of balance\n` +
        `📊 Risk per Entry: **${signal.riskPercent / signal.entries.length}%**\n` +
        `⚡ Leverage: **${signal.leverage}x**\n` +
        `🛑 Stop Loss: ${stopLossText}\n` +
        `🔥 Confidence: **${(signal.confidence * 100).toFixed(1)}%**\n` +
        `💭 ${signal.reasoning}\n\n` +
        `⚠️ **Note**: This is analysis only. Trading execution has been removed from this bot.`);

    } catch (error) {
      console.error('[TradingBot] Error processing trading signal:', error);
      await this.sendTelegramMessage(`❌ Error analyzing trading signal: ${error}`);
    }
  }

  private async sendTelegramMessage(text: string) {
    try {
      await this.telegramBot.api.sendMessage(this.targetChatId, text, {
        parse_mode: "Markdown"
      });
    } catch (error) {
      console.error('[TradingBot] Error sending Telegram message:', error);
    }
  }

  public enable() {
    this.isEnabled = true;
    console.log('[TradingBot] Trading analysis enabled');
  }

  public disable() {
    this.isEnabled = false;
    console.log('[TradingBot] Trading analysis disabled');
  }

  public isActive(): boolean {
    return this.isEnabled;
  }
}
