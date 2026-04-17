// knowledgeRepository.ts
// Όλες οι MongoDB queries για τη collection `knowledgebases`.
// Χειρίζεται CRUD operations για τη γνωσιακή βάση του bot:
//   δημιουργία, ανάγνωση, ενημέρωση, soft delete.
//
// Σημαντικό: κάθε φορά που αλλάζει το `content` μιας εγγραφής,
// το embedding πρέπει να ξαναγεννηθεί ώστε το RAG να βρίσκει σωστά αποτελέσματα.
//
// Εξαρτάται από: models/KnowledgeBase.ts
// Χρησιμοποιείται από: adminRoutes.ts

import { KnowledgeBaseModel, KnowledgeCategory } from "../models/KnowledgeBase";

/**
 * Επιστρέφει όλες τις ενεργές εγγραφές της γνωσιακής βάσης.
 * Εξαιρεί το πεδίο `embedding` για να μειωθεί το μέγεθος της απόκρισης
 * (384 αριθμοί ανά εγγραφή δεν χρειάζονται στο frontend).
 *
 * @returns Πίνακας εγγράφων χωρίς embedding, ταξινομημένων κατά κατηγορία και τίτλο.
 */
export async function GetAllKnowledge() {
  return KnowledgeBaseModel
    .find({ isActive: true })
    .select("-embedding") // Εξαίρεση embedding — δεν χρειάζεται στο frontend
    .sort({ category: 1, title: 1 })
    .lean();
}

/**
 * Δημιουργεί νέα εγγραφή στη γνωσιακή βάση με προ-υπολογισμένο embedding.
 *
 * Το embedding πρέπει να έχει ήδη υπολογιστεί από τον caller (adminRoutes.ts)
 * μέσω του embeddingService, πριν κληθεί αυτή η συνάρτηση.
 *
 * @param title - Τίτλος της εγγραφής.
 * @param content - Πλήρες κείμενο.
 * @param category - Θεματική κατηγορία.
 * @param embedding - Πίνακας 384 αριθμών από το embeddingService.
 * @returns Το νέο document (χωρίς embedding).
 */
export async function CreateKnowledge(
  title: string,
  content: string,
  category: KnowledgeCategory,
  embedding: number[]
) {
  const doc = await KnowledgeBaseModel.create({ title, content, category, embedding });
  // Επιστρέφουμε χωρίς embedding για συνέπεια με τα υπόλοιπα endpoints
  const { embedding: _emb, ...rest } = doc.toObject();
  return rest;
}

/**
 * Ενημερώνει υπάρχουσα εγγραφή. Αν αλλάζει το content, περιμένουμε νέο embedding.
 *
 * @param id - Το MongoDB _id της εγγραφής.
 * @param updates - Τα πεδία που αλλάζουν (title, content, category).
 * @param embedding - Νέο embedding αν άλλαξε το content, αλλιώς undefined.
 * @returns Το ενημερωμένο document ή null αν δεν βρέθηκε.
 */
export async function UpdateKnowledge(
  id: string,
  updates: Partial<{ title: string; content: string; category: KnowledgeCategory }>,
  embedding?: number[]
) {
  const setFields: Record<string, unknown> = { ...updates };
  // Ενημέρωση embedding μόνο αν δόθηκε — αλλαγή content χωρίς νέο embedding
  // θα έδινε λανθασμένα RAG αποτελέσματα
  if (embedding) setFields.embedding = embedding;

  return KnowledgeBaseModel.findByIdAndUpdate(
    id,
    { $set: setFields },
    { new: true } // Επιστρέφει το ενημερωμένο document
  ).select("-embedding").lean();
}

/**
 * Soft delete: αντί να διαγράψει την εγγραφή, τη θέτει ως ανενεργή.
 * Έτσι δεν εμφανίζεται στο RAG ή στον admin, αλλά παραμένει στη βάση
 * για ιστορικούς λόγους και δυνατότητα επαναφοράς.
 *
 * @param id - Το MongoDB _id της εγγραφής.
 */
export async function SoftDeleteKnowledge(id: string): Promise<void> {
  await KnowledgeBaseModel.findByIdAndUpdate(id, { $set: { isActive: false } });
}
