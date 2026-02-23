// adminRoutes.ts
// HTTP routes for the admin panel.
// GET  /api/admin/feedback            — list all thumbs-down entries with context
// POST /api/admin/feedback/:messageId/correct — save a correction for one entry

import { Router, Request, Response, NextFunction } from "express";
import * as adminRepository from "../repositories/adminRepository";
import * as feedbackRepository from "../repositories/feedbackRepository";

export const adminRouter = Router();

/**
 * Returns all thumbs-down feedback entries enriched with the triggering user
 * question and bad bot reply, for display in the admin panel.
 */
adminRouter.get(
  "/feedback",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entries = await adminRepository.GetAdminFeedback();
      res.json(entries);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Saves an admin-supplied correction onto a thumbs-down feedback document.
 * The correction is injected into the system prompt on the next chat request.
 *
 * Body: { correction: string }
 */
adminRouter.post(
  "/feedback/:messageId/correct",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { messageId } = req.params;
      const { correction } = req.body as { correction?: string };

      if (typeof correction !== "string" || correction.trim() === "") {
        res.status(400).json({ error: "correction must be a non-empty string." });
        return;
      }

      await feedbackRepository.SaveCorrection(messageId, correction.trim());
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);
