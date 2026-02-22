// chatService.ts
// Orchestrates the full chat flow: loading history, calling the AI provider,
// saving messages, and returning the response to the route layer.

import { v4 as uuidv4 } from "uuid";
import { GetAIProvider } from "../config/aiProviderFactory";
import * as conversationRepository from "../repositories/conversationRepository";
import { Message, ChatResponse } from "../types/index";

// The base instruction given to the AI on every request.
// Phase 5 will expand this dynamically by injecting negative feedback examples.
const DEFAULT_SYSTEM_PROMPT = `You are a helpful and friendly customer support assistant.
Answer questions clearly and concisely. If you do not know the answer, say so honestly
rather than guessing. Do not discuss topics unrelated to customer support.`;

/**
 * Processes an incoming user message through the full chat pipeline:
 * loads history → calls the AI provider → saves both messages → returns the reply.
 *
 * @param sessionId - The ID of the existing session, or a newly generated one for first messages.
 * @param userMessage - The raw text the user typed.
 * @returns An object containing the sessionId, the AI's reply text, and the reply's messageId.
 * @throws Error if the AI provider call fails or the database write fails.
 */
export async function ProcessUserMessage(
  sessionId: string,
  userMessage: string
): Promise<ChatResponse> {
  // Load existing history — returns [] for brand-new sessions
  const history = await conversationRepository.GetSessionHistory(sessionId);

  // Build the user message object
  const userMessageObject: Message = {
    messageId: uuidv4(),
    role: "user",
    content: userMessage,
    timestamp: new Date(),
  };

  // OpenAI and Gemini both need the full history on every request — they have no memory of their own
  const messagesForAI = [...history, userMessageObject];

  const aiProvider = GetAIProvider();
  let replyText: string;
  try {
    replyText = await aiProvider.GenerateResponse(messagesForAI, DEFAULT_SYSTEM_PROMPT);
  } catch (error) {
    throw new Error(
      `Failed to generate AI response for session ${sessionId}: ${(error as Error).message}`
    );
  }

  // Build the assistant message object
  const assistantMessageObject: Message = {
    messageId: uuidv4(),
    role: "assistant",
    content: replyText,
    timestamp: new Date(),
  };

  // Persist both messages — upsert in SaveMessage handles new session creation automatically
  await conversationRepository.SaveMessage(sessionId, userMessageObject);
  await conversationRepository.SaveMessage(sessionId, assistantMessageObject);

  // Return the assistant's messageId so the frontend can attach feedback votes to it
  return {
    sessionId,
    reply: replyText,
    messageId: assistantMessageObject.messageId,
  };
}
