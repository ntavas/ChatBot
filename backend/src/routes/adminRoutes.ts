// adminRoutes.ts
// Αυτά τα endpoints είναι αποκλειστικά για διαχειριστές.
// Επιτρέπουν την παρακολούθηση του bot, τη διαχείριση feedback
// και το CRUD της γνωσιακής βάσης.
//
// Endpoints:
//   GET  /api/admin/feedback               — λίστα αρνητικών αξιολογήσεων με πλαίσιο
//   GET  /api/admin/feedback/stats         — στατιστικά αξιολογήσεων
//   PUT  /api/admin/feedback/:messageId    — έγκριση/απόρριψη διόρθωσης
//   POST /api/admin/feedback/:messageId/correct — αποθήκευση διόρθωσης (legacy)
//   GET  /api/admin/knowledge              — λίστα εγγραφών γνωσιακής βάσης
//   POST /api/admin/knowledge              — νέα εγγραφή (auto-embed)
//   PUT  /api/admin/knowledge/:id          — επεξεργασία εγγραφής (re-embed αν αλλάξει content)
//   DELETE /api/admin/knowledge/:id        — soft delete (isActive: false)
//
// Εξαρτάται από: adminRepository, feedbackRepository, knowledgeRepository, embeddingService

import { Router, Request, Response, NextFunction } from "express";
import * as adminRepository from "../repositories/adminRepository";
import * as feedbackRepository from "../repositories/feedbackRepository";
import * as knowledgeRepository from "../repositories/knowledgeRepository";
import { GetEmbedding } from "../services/embeddingService";
import { KnowledgeCategory } from "../models/KnowledgeBase";

export const adminRouter = Router();

// Έγκυρες τιμές status για approve/reject
const VALID_STATUSES = ["approved", "rejected"] as const;

// Έγκυρες κατηγορίες γνωσιακής βάσης
const VALID_CATEGORIES: KnowledgeCategory[] = ["returns", "shipping", "payments", "products", "account"];

// ── Feedback endpoints ────────────────────────────────────────────────────────

/**
 * GET /api/admin/feedback
 * Επιστρέφει όλες τις αρνητικές αξιολογήσεις εμπλουτισμένες με πλαίσιο
 * (ερώτημα χρήστη + κακή απάντηση bot) για εμφάνιση στον πίνακα διαχείρισης.
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
 * GET /api/admin/feedback/stats
 * Επιστρέφει στατιστικά αξιολογήσεων: σύνολο, % θετικών/αρνητικών,
 * κατανομή κατά κατάσταση (pending/approved/rejected).
 *
 * ΣΗΜΑΝΤΙΚΟ: Πρέπει να είναι πριν το /feedback/:messageId για να
 * μην ερμηνεύσει ο Express το "stats" ως messageId.
 */
adminRouter.get(
  "/feedback/stats",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await adminRepository.GetFeedbackStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/admin/feedback/:messageId
 * Εγκρίνει ή απορρίπτει μια διόρθωση. Προαιρετικά ενημερώνει το κείμενο διόρθωσης.
 *
 * Body: { status: "approved" | "rejected", correction?: string }
 *
 * Μόνο εγκεκριμένες (approved) διορθώσεις εισάγονται ως golden rules στο system prompt
 * από το feedbackEngine (Φάση 2.3).
 */
adminRouter.put(
  "/feedback/:messageId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { messageId } = req.params;
      const { status, correction } = req.body as { status?: string; correction?: string };

      if (!status || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
        res.status(400).json({ error: '`status` must be "approved" or "rejected".' });
        return;
      }

      await feedbackRepository.UpdateFeedbackStatus(
        messageId,
        status as "approved" | "rejected",
        correction
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/feedback/:messageId/correct
 * Αποθηκεύει διόρθωση admin (διατηρείται για συμβατότητα με υπάρχον frontend).
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

// ── Knowledge base endpoints ──────────────────────────────────────────────────

/**
 * GET /api/admin/knowledge
 * Επιστρέφει όλες τις ενεργές εγγραφές της γνωσιακής βάσης (χωρίς embeddings).
 */
adminRouter.get(
  "/knowledge",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entries = await knowledgeRepository.GetAllKnowledge();
      res.json(entries);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/knowledge
 * Δημιουργεί νέα εγγραφή στη γνωσιακή βάση.
 * Υπολογίζει αυτόματα το embedding του content μέσω του embeddingService.
 *
 * Body: { title: string, content: string, category: KnowledgeCategory }
 */
adminRouter.post(
  "/knowledge",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, content, category } = req.body as {
        title?: string;
        content?: string;
        category?: string;
      };

      if (!title || typeof title !== "string" || title.trim() === "") {
        res.status(400).json({ error: "`title` is required." });
        return;
      }
      if (!content || typeof content !== "string" || content.trim() === "") {
        res.status(400).json({ error: "`content` is required." });
        return;
      }
      if (!category || !VALID_CATEGORIES.includes(category as KnowledgeCategory)) {
        res.status(400).json({ error: `\`category\` must be one of: ${VALID_CATEGORIES.join(", ")}.` });
        return;
      }

      // Αυτόματη δημιουργία embedding από το content — απαραίτητο για vector search
      const embedding = await GetEmbedding(content.trim());
      const entry = await knowledgeRepository.CreateKnowledge(
        title.trim(),
        content.trim(),
        category as KnowledgeCategory,
        embedding
      );

      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/admin/knowledge/:id
 * Ενημερώνει εγγραφή γνωσιακής βάσης.
 * Αν αλλάζει το content, υπολογίζει αυτόματα νέο embedding.
 *
 * Body: { title?: string, content?: string, category?: string }
 */
adminRouter.put(
  "/knowledge/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { title, content, category } = req.body as {
        title?: string;
        content?: string;
        category?: string;
      };

      if (category && !VALID_CATEGORIES.includes(category as KnowledgeCategory)) {
        res.status(400).json({ error: `\`category\` must be one of: ${VALID_CATEGORIES.join(", ")}.` });
        return;
      }

      const updates: Partial<{ title: string; content: string; category: KnowledgeCategory }> = {};
      if (title?.trim()) updates.title = title.trim();
      if (content?.trim()) updates.content = content.trim();
      if (category) updates.category = category as KnowledgeCategory;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "Provide at least one field to update." });
        return;
      }

      // Αν άλλαξε το content, πρέπει να ξαναγεννηθεί το embedding
      // Αλλιώς το RAG θα βρίσκει λανθασμένα αποτελέσματα για το νέο κείμενο
      let newEmbedding: number[] | undefined;
      if (updates.content) {
        newEmbedding = await GetEmbedding(updates.content);
      }

      const updated = await knowledgeRepository.UpdateKnowledge(id, updates, newEmbedding);

      if (!updated) {
        res.status(404).json({ error: "Knowledge entry not found." });
        return;
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/admin/knowledge/:id
 * Soft delete: θέτει isActive=false αντί να διαγράψει.
 * Η εγγραφή παραμένει στη βάση αλλά εξαιρείται από το RAG και τον admin.
 */
adminRouter.delete(
  "/knowledge/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await knowledgeRepository.SoftDeleteKnowledge(id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);
