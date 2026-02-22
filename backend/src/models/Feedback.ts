// Feedback.ts
// Mongoose schema and model for the `feedbacks` collection.
// Each document records one thumbs-up or thumbs-down vote on a specific bot message.

import mongoose, { Schema, Document } from "mongoose";

/** Shape of a feedback document in MongoDB. */
export interface FeedbackDocument extends Document {
  messageId: string;
  sessionId: string;
  vote: "up" | "down";
  createdAt: Date;
}

const FeedbackSchema = new Schema<FeedbackDocument>(
  {
    messageId: { type: String, required: true },
    sessionId: { type: String, required: true },
    vote: { type: String, enum: ["up", "down"], required: true },
  },
  { timestamps: true } // Mongoose auto-manages createdAt (updatedAt not needed for feedback)
);

export const FeedbackModel = mongoose.model<FeedbackDocument>("Feedback", FeedbackSchema);
