// aiProviderFactory.ts
// Reads AI_PROVIDER from .env and returns the matching AIProvider implementation.
// This is the single place in the app that knows which concrete provider is active.

import { AIProvider } from "../services/AIProvider";
import { GeminiProvider } from "../services/GeminiProvider";
import { OpenAIProvider } from "../services/OpenAIProvider";
import { OpenRouterProvider } from "../services/OpenRouterProvider";
import { env } from "./env";

/**
 * Returns the active AIProvider implementation based on the AI_PROVIDER env var.
 *
 * @returns A concrete AIProvider instance ready to generate responses.
 * @throws Error if AI_PROVIDER is set to an unrecognised value.
 */
export function GetAIProvider(): AIProvider {
  switch (env.AI_PROVIDER) {
    case "gemini":
      return new GeminiProvider();
    case "openai":
      return new OpenAIProvider();
    case "openrouter":
      return new OpenRouterProvider();
    default:
      throw new Error(
        `Unknown AI_PROVIDER value: "${env.AI_PROVIDER}". Must be "gemini", "openai", or "openrouter".`
      );
  }
}
