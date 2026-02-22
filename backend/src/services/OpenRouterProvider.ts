// OpenRouterProvider.ts
// Implements AIProvider using OpenRouter's API via the openai SDK.
// OpenRouter is OpenAI API-compatible, so we reuse the same SDK but point
// it at a different base URL and supply an OpenRouter API key.

import OpenAI from "openai";
import { AIProvider } from "./AIProvider";
import { Message } from "../types/index";
import { env } from "../config/env";

export class OpenRouterProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor() {
    // The openai SDK accepts a custom baseURL, which is all that's needed
    // to redirect every API call from OpenAI to OpenRouter.
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
    });
  }

  /**
   * Generates an AI reply using the OpenRouter-hosted model configured in .env.
   *
   * Prepends the system prompt as the first message, then maps the conversation
   * history to the shape the OpenAI SDK expects (role + content only).
   *
   * @param messages - Full conversation history, oldest first.
   * @param systemPrompt - The system instruction for this request.
   * @returns The model's reply as a plain string.
   * @throws Error if the OpenRouter API call fails or returns an empty response.
   */
  async GenerateResponse(messages: Message[], systemPrompt: string): Promise<string> {
    const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      // Strip messageId and timestamp — the OpenAI API only accepts role + content
      ...messages.map((message) => ({
        role: message.role as "user" | "assistant" | "system",
        content: message.content,
      })),
    ];

    const result = await this.client.chat.completions.create({
      model: env.OPENROUTER_MODEL,
      messages: formattedMessages,
    });

    const reply = result.choices[0]?.message?.content;
    if (!reply) {
      throw new Error("OpenRouter returned an empty response.");
    }

    return reply;
  }
}
