/*
 * KnowledgeBase.ts
 *
 * Τι κάνει αυτό το αρχείο:
 *   Ορίζει το Mongoose schema και model για τη συλλογή `knowledgebases` στη MongoDB.
 *   Κάθε document αντιπροσωπεύει μία καταχώριση στη γνωσιακή βάση (FAQ, πολιτική, κτλ.)
 *   του ShopEasy, μαζί με το embedding της — τον αριθμητικό της "αποτύπωμα" για semantic search.
 *
 * Γιατί χρειάζεται:
 *   Το RAG σύστημα αναζητά σε αυτή τη συλλογή για να βρει τις πιο σχετικές
 *   πληροφορίες πριν απαντήσει ο bot. Χωρίς αυτό το schema, δεν υπάρχει
 *   δομημένη αποθήκευση της γνώσης του συστήματος.
 *
 * Εξαρτήσεις / αλληλεπιδράσεις:
 *   - embeddingService.ts: παράγει τα embeddings που αποθηκεύονται εδώ
 *   - ragService.ts: διαβάζει από αυτή τη συλλογή για να βρει σχετικά έγγραφα
 *   - seedKnowledge.ts: γεμίζει αρχικά αυτή τη συλλογή με FAQs
 *   - adminRoutes.ts: CRUD operations μέσω admin panel
 */

import mongoose, { Schema, Document } from "mongoose";
import { EMBEDDING_DIMENSIONS } from "../services/embeddingService";

// Κατηγορίες που αντιστοιχούν στα θέματα υποστήριξης του ShopEasy.
// Χρησιμοποιείται για φιλτράρισμα στο admin panel.
export type KnowledgeCategory =
  | "returns"
  | "shipping"
  | "payments"
  | "products"
  | "account";

/** Τύπος ενός document της γνωσιακής βάσης στη MongoDB. */
export interface KnowledgeBaseDocument extends Document {
  title: string;       // Σύντομος τίτλος, π.χ. "Πολιτική Επιστροφών"
  content: string;     // Το πλήρες κείμενο της απάντησης / πολιτικής
  category: KnowledgeCategory; // Κατηγορία θέματος
  embedding: number[]; // 384 αριθμοί που αναπαριστούν το νόημα του content
  isActive: boolean;   // false = "soft deleted" — δεν εμφανίζεται αλλά δεν διαγράφεται
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseSchema = new Schema<KnowledgeBaseDocument>(
  {
    // Σύντομος τίτλος για εμφάνιση στο admin panel
    title: { type: String, required: true, trim: true },

    // Το κυρίως κείμενο — αυτό μετατρέπεται σε embedding και εμφανίζεται στο prompt
    content: { type: String, required: true, trim: true },

    // Κατηγορία: περιορίζεται στις 5 γνωστές τιμές για συνέπεια
    category: {
      type: String,
      required: true,
      enum: ["returns", "shipping", "payments", "products", "account"] as KnowledgeCategory[],
    },

    // Το embedding είναι πίνακας από ακριβώς EMBEDDING_DIMENSIONS (384) αριθμούς.
    // Αποθηκεύεται μαζί με το content ώστε να μην χρειάζεται επανυπολογισμός
    // κάθε φορά που γίνεται αναζήτηση.
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === EMBEDDING_DIMENSIONS,
        message: `Το embedding πρέπει να έχει ακριβώς ${EMBEDDING_DIMENSIONS} διαστάσεις`,
      },
    },

    // Soft delete: αντί να διαγράφουμε εγγραφές, τις απενεργοποιούμε.
    // Έτσι δεν χάνουμε δεδομένα και μπορούμε να τις επαναφέρουμε αν χρειαστεί.
    isActive: { type: Boolean, default: true },
  },
  {
    // Mongoose διαχειρίζεται αυτόματα τα πεδία createdAt και updatedAt
    timestamps: true,
  }
);

// Text index στο content για fallback keyword search (χρήση όταν δεν υπάρχει Atlas)
// Αυτό επιτρέπει $text queries ως εναλλακτική του $vectorSearch για local MongoDB
KnowledgeBaseSchema.index({ content: "text", title: "text" });

// Index στο category για γρήγορο φιλτράρισμα ανά κατηγορία
KnowledgeBaseSchema.index({ category: 1, isActive: 1 });

export const KnowledgeBaseModel = mongoose.model<KnowledgeBaseDocument>(
  "KnowledgeBase",
  KnowledgeBaseSchema
);
