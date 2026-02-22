// chatRoutes.ts
// Defines the POST /api/chat endpoint.
// Validates the request, delegates to chatService, and returns the response.
// No business logic lives here.

import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import * as chatService from "../services/chatService";

export const chatRouter = Router();

/**
 * POST /api/chat
 *
 * Body:
 *   message   {string} required — the user's text input
 *   sessionId {string} optional — omit to start a new session
 *
 * Response:
 *   sessionId {string} — use this in subsequent requests to continue the conversation
 *   reply     {string} — the AI's response text
 *   messageId {string} — the ID of the assistant message, used for feedback submission
 */
chatRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "`message` is required and must be a non-empty string." });
    return;
  }

  // Generate a new sessionId if the client hasn't provided one (first message in a session)
  const resolvedSessionId: string = sessionId ?? uuidv4();

  try {
    const result = await chatService.ProcessUserMessage(resolvedSessionId, message.trim());
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
