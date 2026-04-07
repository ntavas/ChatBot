// env.ts
// Reads all required environment variables from .env and exports them as a
// single validated config object. Throws early if anything is missing so the
// app fails fast at startup rather than at runtime.

import dotenv from "dotenv";
import path from "path";

// Φορτώνουμε το .env αρχείο.
// Ψάχνουμε σε δύο τοποθεσίες ώστε να λειτουργεί τόσο μέσω Docker (CWD = project root)
// όσο και όταν τρέχουμε scripts απευθείας από τον φάκελο backend/ (π.χ. ts-node scripts).
// Το dotenv δεν αντικαθιστά μεταβλητές που έχουν ήδη οριστεί, οπότε η σειρά είναι ασφαλής.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") }); // project root
dotenv.config(); // fallback: CWD (καλύπτει την περίπτωση Docker όπου CWD = project root)

const VALID_AI_PROVIDERS = ["gemini", "openai", "openrouter"] as const;
type AIProviderName = typeof VALID_AI_PROVIDERS[number];

/**
 * Reads a required environment variable by name.
 *
 * @param name - The name of the environment variable.
 * @returns The value of the variable as a string.
 * @throws Error if the variable is not set.
 */
function RequireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Reads and validates the AI_PROVIDER variable.
 *
 * @returns The provider name as a typed union.
 * @throws Error if the value is missing or not a recognised provider.
 */
function ReadAIProvider(): AIProviderName {
  const value = RequireEnvVar("AI_PROVIDER");
  if (!VALID_AI_PROVIDERS.includes(value as AIProviderName)) {
    throw new Error(
      `Invalid AI_PROVIDER "${value}". Must be one of: ${VALID_AI_PROVIDERS.join(", ")}.`
    );
  }
  return value as AIProviderName;
}

const aiProvider = ReadAIProvider();

export const env = Object.freeze({
  PORT: parseInt(process.env.PORT ?? "3000", 10),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  MONGODB_URI: RequireEnvVar("MONGODB_URI"),

  // --- AI provider selection ---
  AI_PROVIDER: aiProvider,

  // --- Gemini (required when AI_PROVIDER=gemini) ---
  GEMINI_API_KEY: aiProvider === "gemini" ? RequireEnvVar("GEMINI_API_KEY") : "",
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",

  // --- OpenAI (required when AI_PROVIDER=openai) ---
  OPENAI_API_KEY: aiProvider === "openai" ? RequireEnvVar("OPENAI_API_KEY") : "",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",

  // --- OpenRouter (required when AI_PROVIDER=openrouter) ---
  OPENROUTER_API_KEY: aiProvider === "openrouter" ? RequireEnvVar("OPENROUTER_API_KEY") : "",
  OPENROUTER_MODEL: aiProvider === "openrouter" ? RequireEnvVar("OPENROUTER_MODEL") : "",
});
