import { GoogleGenerativeAI } from '@google/generative-ai';

export interface TradingSignal {
  symbol: string;
  side: 'Buy' | 'Sell';
  entries: number[]; // Multiple entry points
  riskPercent: number; // Risk as percentage of balance (e.g., 5% = $25 risk on $500 balance)
  stopLoss?: number;
  stopLossCondition?: string; // e.g., "4H close below"
  takeProfit?: number;
  quantity?: number;
  leverage: number; // REQUIRED: Leverage for futures trading (e.g., 10, 20, 50)
  confidence: number; // 0-1 scale
  reasoning: string;
}

export class AITrader {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  async analyzeTradingMessage(message: string): Promise<TradingSignal | null> {
    try {
              const prompt = `
        You are a professional trading signal analyzer specialized in parsing specific signal formats. Analyze this message and extract trading information.
        
        MESSAGE FORMAT EXAMPLES:
        - "BTC\nEntries 119000-119500\nRisk 5%\nLeverage 10x\nSL: 4H close below 115000"
        - "AAVE.P\nEntries 286.72-281.53\nRisk 5%\nLeverage 20x\nSL: 4H close below 275.44"
        - "ETH\nEntries 3200-3250\nRisk 5%\nLeverage 50x\nSL: 4H close below 3100"
        - "SOL\nEntries 150\nRisk 5%\nLeverage 10x\n(No SL - will use default 5% below entry)"
        
        PARSING RULES:
        1. Symbol: Extract the trading pair (e.g., "BTC", "AAVE.P")
        2. Side: Determine if it's Buy or Sell based on entry prices and context
        3. Entries: Parse entry prices separated by "-" or "/" - all entries are limit orders
        4. Risk: Extract the EXACT risk percentage from the message (e.g., "Risk 5%" = 5.0) - this represents the dollar amount risked as a percentage of current balance
        5. Leverage: Extract the leverage multiplier (e.g., "10x", "20x", "50x" = 10, 20, 50) - if not specified, use 10x as default
        6. Stop Loss: Extract the stop loss price and condition (e.g., "4H close below 275.44") - if not specified, system will use default 5% below entry
        
        IMPORTANT: 
        - The trading side (Buy/Sell) should be determined by the strategy context, not just the signal format.
        - ALWAYS extract the EXACT risk percentage mentioned in the message, do not default to 2.5%
        - If the message says "Risk 7%", return 7.0, not 2.5
        - If the message says "Risk 1.5%", return 1.5, not 2.5
        - Risk percentage represents the dollar amount risked as a percentage of current balance (e.g., 5% risk on $500 balance = $25 risk)
        
        RESPONSE FORMAT (JSON only):
        {
           "symbol": "BTCUSDT",
           "side": "Buy",
           "entries": [119000, 119500],
           "riskPercent": 5.0,
           "leverage": 10,
           "stopLoss": 115000,
           "stopLossCondition": "4H close below",
           "confidence": 0.95,
           "reasoning": "Clear signal with multiple entries and defined risk management"
        }
        
        MESSAGE TO ANALYZE:
        ${message}
        
        Parse this message and return ONLY the JSON response.`;
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[AI] No JSON found in response:', text);
        return null;
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate the parsed signal
      if (this.validateSignal(parsed)) {
        return parsed;
      }
      
      return null;
    } catch (error) {
      console.error(`[AI] Error analyzing message:`, error);
      return null;
    }
  }

  private validateSignal(signal: any): signal is TradingSignal {
    return (
      signal.symbol &&
      ['Buy', 'Sell'].includes(signal.side) &&
      Array.isArray(signal.entries) &&
      signal.entries.length > 0 &&
      signal.entries.every((entry: any) => typeof entry === 'number' && entry > 0) &&
      typeof signal.riskPercent === 'number' &&
      signal.riskPercent > 0 &&
      signal.riskPercent <= 100 &&
      typeof signal.leverage === 'number' &&
      signal.leverage > 0 &&
      signal.leverage <= 100 &&
      signal.stopLoss &&
      typeof signal.stopLoss === 'number' &&
      signal.stopLoss > 0 &&
      signal.confidence >= 0 &&
      signal.confidence <= 1
    );
  }


}
