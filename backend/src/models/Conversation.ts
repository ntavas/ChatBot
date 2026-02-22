// Conversation.ts
// Mongoose schema and model for the `conversations` collection.
// Each document represents one chat session and holds all messages for that session.

import mongoose, { Schema, Document } from "mongoose";

/** Shape of a single message sub-document inside a conversation. */
interface MessageDocument {
  messageId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

/** Shape of a full conversation document in MongoDB. */
export interface ConversationDocument extends Document {
  sessionId: string;
  messages: MessageDocument[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<MessageDocument>(
  {
    messageId: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false } // Sub-documents don't need their own Mongo _id
);

const ConversationSchema = new Schema<ConversationDocument>(
  {
    // Indexed so GetSessionHistory() lookups are fast even with many sessions
    sessionId: { type: String, required: true, unique: true, index: true },
    messages: { type: [MessageSchema], default: [] },
  },
  { timestamps: true } // Mongoose auto-manages createdAt and updatedAt
);

export const ConversationModel = mongoose.model<ConversationDocument>(
  "Conversation",
  ConversationSchema
);
