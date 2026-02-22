// GeminiProvider.ts
// Implements AIProvider using Google's Gemini API via @google/generative-ai SDK.

import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { AIProvider } from "./AIProvider";
import { Message } from "../types/index";
import { env } from "../config/env";

export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  /**
   * Generates an AI reply using the Gemini model configured in .env.
   *
   * Gemini's API separates the system instruction from the chat history,
   * so we extract system messages and pass them via systemInstruction,
   * then map user/assistant turns into Gemini's Content format.
   *
   * @param messages - Full conversation history, oldest first.
   * @param systemPrompt - The system instruction for this request.
   * @returns The model's reply as a plain string.
   * @throws Error if the Gemini API call fails.
   */
  async GenerateResponse(messages: Message[], systemPrompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: env.GEMINI_MODEL,
      systemInstruction: systemPrompt,
    });

    // Gemini expects alternating user/model turns — filter out any system
    // role messages since those are handled via systemInstruction above.
    const history: Content[] = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        // Gemini uses "model" where OpenAI uses "assistant"
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    // The last message is the live user input — Gemini's sendMessage()
    // expects it separately from the history.
    const lastMessage = history.pop();
    if (!lastMessage) {
      throw new Error("Cannot generate a response: message list is empty.");
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.parts);
    return result.response.text();
  }
}
