// AIProvider.ts
// Defines the contract that every AI provider implementation must satisfy.
// The rest of the app depends only on this interface — never on a concrete SDK.

import { Message } from "../types/index";

/**
 * Common interface for AI language model providers (Gemini, OpenAI, etc.).
 * Swap providers by changing AI_PROVIDER in .env without touching business logic.
 */
export interface AIProvider {
  /**
   * Generates an AI reply given a conversation history and a system prompt.
   *
   * @param messages - The full conversation history, oldest message first.
   * @param systemPrompt - Instructions that define how the AI should behave.
   * @returns The AI's reply as a plain string.
   * @throws Error if the underlying API call fails.
   */
  GenerateResponse(messages: Message[], systemPrompt: string): Promise<string>;
}
