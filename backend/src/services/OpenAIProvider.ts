// OpenAIProvider.ts
// Stub implementation of AIProvider using the OpenAI SDK.
// TODO: implement GenerateResponse() when switching back to OpenAI.

import { AIProvider } from "./AIProvider";
import { Message } from "../types/index";

export class OpenAIProvider implements AIProvider {
  /**
   * NOT YET IMPLEMENTED.
   * Will call OpenAI's chat completions API with the provided history.
   *
   * @param messages - Full conversation history, oldest first.
   * @param systemPrompt - The system instruction for this request.
   * @returns The model's reply as a plain string.
   * @throws Error always — this method is not yet implemented.
   */
  async GenerateResponse(_messages: Message[], _systemPrompt: string): Promise<string> {
    // TODO: implement using the openai SDK (openai npm package already installed)
    // Steps:
    //   1. Prepend a system message to the messages array
    //   2. Call openAIClient.chat.completions.create({ model: env.OPENAI_MODEL, messages })
    //   3. Return result.choices[0].message.content
    throw new Error("OpenAIProvider.GenerateResponse() is not yet implemented.");
  }
}
