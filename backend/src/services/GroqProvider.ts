// GroqProvider.ts
// Υλοποίηση του AIProvider χρησιμοποιώντας το Groq API μέσω του openai SDK.
// Το Groq είναι συμβατό με το OpenAI API — αρκεί να αλλάξουμε το baseURL.
// Χρησιμοποιεί εξειδικευμένο hardware (LPU) που κάνει τα LLMs πολύ πιο γρήγορα.
//
// Free tier: 14,400 requests/day, 30 req/min — αρκετό για evaluation και demo.
//
// Εξαρτάται από: openai SDK, env.ts (GROQ_API_KEY, GROQ_MODEL)

import OpenAI from "openai";
import { AIProvider } from "./AIProvider";
import { Message } from "../types/index";
import { env } from "../config/env";

export class GroqProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor() {
    // Το Groq χρησιμοποιεί το ίδιο OpenAI-compatible API — μόνο το baseURL αλλάζει
    this.client = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: env.GROQ_API_KEY,
    });
  }

  // GenerateResponse: Στέλνει το ερώτημα στο Groq API και επιστρέφει την απάντηση.
  // Ίδια λογική με OpenRouterProvider — μόνο ο πάροχος αλλάζει.
  async GenerateResponse(messages: Message[], systemPrompt: string): Promise<string> {
    const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((message) => ({
        role: message.role as "user" | "assistant" | "system",
        content: message.content,
      })),
    ];

    const result = await this.client.chat.completions.create({
      model: env.GROQ_MODEL,
      messages: formattedMessages,
      // Temperature 0 για ντετερμινιστικές απαντήσεις — σημαντικό για αναπαραγώγιμη αξιολόγηση
      temperature: 0,
    });

    const reply = result.choices[0]?.message?.content;
    if (!reply) {
      throw new Error("Groq returned an empty response.");
    }

    return reply;
  }
}
