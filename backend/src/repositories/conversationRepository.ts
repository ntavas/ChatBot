// conversationRepository.ts
// All MongoDB queries for the `conversations` collection.
// No business logic lives here — only data access.

import { ConversationModel } from "../models/Conversation";
import { Message } from "../types/index";

/**
 * Returns the full message history for a session, ordered oldest to newest.
 * Returns an empty array if the session does not exist yet — callers treat
 * a missing session the same as a session with no messages.
 *
 * @param sessionId - The unique identifier of the chat session.
 * @returns Array of messages, or [] if the session is not found.
 * @throws Error if the MongoDB query fails.
 */
export async function GetSessionHistory(sessionId: string): Promise<Message[]> {
  const conversation = await ConversationModel.findOne({ sessionId }).lean();
  if (!conversation) {
    return [];
  }
  return conversation.messages as Message[];
}

/**
 * Appends a single message to an existing session's message array.
 * Uses upsert so the session is created automatically if it doesn't exist,
 * which covers the first message of a new session without a separate CreateSession call.
 *
 * @param sessionId - The unique identifier of the chat session.
 * @param message - The message object to append.
 * @throws Error if the MongoDB update fails.
 */
export async function SaveMessage(sessionId: string, message: Message): Promise<void> {
  await ConversationModel.findOneAndUpdate(
    { sessionId },
    { $push: { messages: message } },
    { upsert: true, new: true }
  );
}

/**
 * Creates a new empty session document in the database.
 * Use this when you need to explicitly initialise a session before any messages arrive.
 *
 * @param sessionId - The unique identifier for the new session.
 * @throws Error if a session with this ID already exists or the insert fails.
 */
export async function CreateSession(sessionId: string): Promise<void> {
  await ConversationModel.create({ sessionId, messages: [] });
}

/**
 * Returns the Message objects matching any of the given messageIds, across all sessions.
 * Uses a single aggregation pipeline so the lookup is one DB call regardless of how many IDs are passed.
 *
 * @param messageIds - Array of messageId strings to look up.
 * @returns Flat array of matching Message objects in MongoDB's natural traversal order.
 * @throws Error if the MongoDB aggregation fails.
 */
export async function GetMessagesByIds(messageIds: string[]): Promise<Message[]> {
  const results = await ConversationModel.aggregate([
    { $unwind: "$messages" },
    { $match: { "messages.messageId": { $in: messageIds } } },
    { $replaceRoot: { newRoot: "$messages" } },
  ]);
  return results as Message[];
}
