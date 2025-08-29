import { GoogleGenerativeAI } from "@google/generative-ai";

export class AiSummarizer {
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  async summarizeToTelugu(text: string): Promise<string | null> {
    if (!text || text.trim().length === 0) return null;

    const prompt = `You are a helpful assistant. Summarize the following Discord message into clear, bullet-point Telugu, preserving key tickers/symbols and statuses.

Output rules:
- Use short, simple Telugu sentences
- Keep tickers (e.g., BTC, SOL) in Latin script
- If the message contains a recap/list, provide one bullet per line
- Do NOT add trading advice; only explain
- No preface, return only the summary lines

Message:
"""
${text}
"""`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text().trim();
      return content.length > 0 ? content : null;
    } catch (_err) {
      return null;
    }
  }
}


