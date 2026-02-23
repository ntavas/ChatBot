// chatService.ts
// Orchestrates the full chat flow: loading history, calling the AI provider,
// saving messages, and returning the response to the route layer.

import { v4 as uuidv4 } from "uuid";
import { GetAIProvider } from "../config/aiProviderFactory";
import * as conversationRepository from "../repositories/conversationRepository";
import * as feedbackRepository from "../repositories/feedbackRepository";
import { Message, ChatResponse } from "../types/index";

// The base instruction given to the AI on every request.
const DEFAULT_SYSTEM_PROMPT = `You are a customer support assistant for ShopEasy, an online retail e-shop.
Answer questions clearly and concisely, based only on the information provided to you below.
If a customer asks about something not covered in your knowledge base, say "I don't have that information — please contact us at support@shopeasy.com."
Do not guess, invent details, or discuss topics unrelated to ShopEasy.`;

// Factual knowledge base for ShopEasy — the single source of truth the bot may draw from.
// All answers must be grounded in this content; nothing should be invented beyond it.
const SHOPEASY_KNOWLEDGE_BASE = `## ShopEasy Knowledge Base

**About ShopEasy**
ShopEasy is an online retail e-shop offering a wide range of products delivered directly to your door.

**Return Policy**
Customers may return or exchange any item within 30 days of purchase.
The item must be in its original condition with all original packaging and tags intact.
To initiate a return, contact us at support@shopeasy.com to receive a Return Merchandise Authorization (RMA) number along with return instructions.
Personalized or customized products are not eligible for return.

**Shipping**
Standard delivery takes 3–5 business days.
Shipping is free on all orders over €50. Orders below €50 are subject to a standard shipping fee.

**Payment Methods**
We accept credit card, PayPal, and bank transfer.

**Contact**
Email: support@shopeasy.com
Our support team is available Monday–Friday, 9:00–17:00.`;

// Cap how many negative examples we inject — guards against token bloat if thumbs-downs accumulate.
const MAX_NEGATIVE_EXAMPLES = 10;

/**
 * Builds the system prompt for each request by appending recent negative feedback examples
 * to the base prompt, so the AI actively avoids response patterns users found unhelpful.
 *
 * @returns The full system prompt string, with negative examples appended if any exist.
 * @throws Error if the database queries fail.
 */
async function BuildSystemPrompt(): Promise<string> {
  const negativeFeedback = await feedbackRepository.GetNegativeFeedback();

  const basePrompt = `${DEFAULT_SYSTEM_PROMPT}\n\n${SHOPEASY_KNOWLEDGE_BASE}`;

  // No thumbs-downs yet — use base prompt + knowledge base only
  if (negativeFeedback.length === 0) {
    // TEMP: remove before Phase 6
    console.log("[BuildSystemPrompt] No negative feedback — using base prompt + knowledge base.");
    return basePrompt;
  }

  // Take only the most recent N to keep the prompt size bounded
  const recentNegatives = negativeFeedback.slice(0, MAX_NEGATIVE_EXAMPLES);
  const messageIds = recentNegatives.map((f) => f.messageId);

  const badMessages = await conversationRepository.GetMessagesByIds(messageIds);

  // Defensive filter — feedback should only ever be on assistant messages, but guard anyway
  const badBotReplies = badMessages.filter((m) => m.role === "assistant");

  if (badBotReplies.length === 0) {
    // TEMP: remove before Phase 6
    console.log("[BuildSystemPrompt] Negative feedback found but no matching messages — using base prompt + knowledge base.");
    return basePrompt;
  }

  // Build a map from messageId → correction so each example can include the admin's fix
  const correctionMap = new Map<string, string | null>();
  for (const f of recentNegatives) {
    correctionMap.set(f.messageId, f.correction ?? null);
  }

  const exampleLines = badBotReplies
    .map((m) => {
      const correction = correctionMap.get(m.messageId);
      if (correction) {
        // When an admin has supplied a correction, tell the model exactly what to say instead
        return `- Avoid: "${m.content}". Instead say: "${correction}"`;
      }
      return `- ${m.content}`;
    })
    .join("\n");

  const negativeExamplesSection =
    `IMPORTANT: Avoid responses like these that users found unhelpful:\n${exampleLines}`;

  // TEMP: remove before Phase 6
  console.log("[BuildSystemPrompt] Injected negative examples:\n", negativeExamplesSection);
  return `${basePrompt}\n\n${negativeExamplesSection}`;
}

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

  const systemPrompt = await BuildSystemPrompt();
  const aiProvider = GetAIProvider();
  let replyText: string;
  try {
    replyText = await aiProvider.GenerateResponse(messagesForAI, systemPrompt);
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
