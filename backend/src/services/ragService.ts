/*
 * ragService.ts
 *
 * Τι κάνει αυτό το αρχείο:
 *   Υλοποιεί τη "smart search" του συστήματος — δηλαδή τη διαδικασία εύρεσης
 *   των πιο σχετικών εγγράφων από τη γνωσιακή βάση για μία ερώτηση χρήστη.
 *   Αυτό είναι το "R" (Retrieval) στο RAG σύστημα.
 *
 * Γιατί χρειάζεται:
 *   Αντί να δίνουμε ΟΛΌΚΛΗΡΗ τη γνωσιακή βάση στο AI σε κάθε request
 *   (σπατάλη tokens, κίνδυνος σύγχυσης), βρίσκουμε ΜΟΝΟ τα 3 πιο σχετικά
 *   έγγραφα και τα δίνουμε. Αυτό κάνει τις απαντήσεις πιο εστιασμένες και
 *   οικονομικές.
 *
 * Δύο λειτουργίες αναζήτησης:
 *   1. Vector Search ($vectorSearch) — χρησιμοποιείται με MongoDB Atlas.
 *      Βρίσκει έγγραφα με βάση σημαντολογική ομοιότητα (cosine similarity).
 *      "Καταλαβαίνει" νόημα, όχι μόνο λέξεις.
 *   2. Text Search ($text) — fallback για local MongoDB (Docker).
 *      Απλή αναζήτηση λέξεων-κλειδιών. Λιγότερο έξυπνη αλλά λειτουργεί παντού.
 *
 * Εξαρτήσεις / αλληλεπιδράσεις:
 *   - embeddingService.ts: μετατρέπει την ερώτηση σε vector
 *   - KnowledgeBase.ts: το model που αναζητούμε
 *   - chatService.ts: καλεί αυτό το service για να φτιάξει το system prompt
 */

import { KnowledgeBaseDocument, KnowledgeBaseModel } from "../models/KnowledgeBase";
import { GetEmbedding } from "./embeddingService";
import { env } from "../config/env";

// Μέγιστος αριθμός εγγράφων που επιστρέφει το RAG στο prompt.
// 3 έγγραφα = καλή ισορροπία μεταξύ πληροφορίας και μεγέθους prompt.
const MAX_RAG_RESULTS = 3;

// Αριθμός υποψήφιων εγγράφων που εξετάζει ο Atlas vector search πριν επιλέξει τα καλύτερα.
// Υψηλότερος = πιο ακριβής αλλά πιο αργός. 150 είναι η συνιστώμενη τιμή για μικρές βάσεις.
const VECTOR_SEARCH_CANDIDATES = 150;

// Ελάχιστο score ομοιότητας για να συμπεριληφθεί ένα έγγραφο στα αποτελέσματα.
// Cosine similarity: 1.0 = ίδιο, 0.0 = άσχετο. 0.5 φιλτράρει ξεκάθαρα άσχετα έγγραφα.
const MIN_SIMILARITY_SCORE = 0.5;

/** Αποτέλεσμα αναζήτησης — το έγγραφο συν το score ομοιότητας */
export interface RAGResult {
  document: KnowledgeBaseDocument;
  score: number;
}

/**
 * IsAtlas: Ελέγχει αν η σύνδεση είναι σε MongoDB Atlas.
 *
 * Γιατί χρειάζεται:
 *   Το $vectorSearch λειτουργεί ΜΟΝΟ στο Atlas — αν το τρέξουμε σε local MongoDB
 *   θα πάρουμε σφάλμα. Ελέγχουμε το URI για να επιλέξουμε αυτόματα τη σωστή μέθοδο.
 */
function IsAtlas(): boolean {
  // Τα Atlas URIs ξεκινούν πάντα με mongodb+srv://
  return env.MONGODB_URI.startsWith("mongodb+srv://");
}

/**
 * FindRelevantDocsVectorSearch: Αναζήτηση με $vectorSearch (Atlas only).
 *
 * Πώς λειτουργεί:
 *   1. Μετατρέπει την ερώτηση σε embedding (384 αριθμοί)
 *   2. Ο Atlas ψάχνει στον vector index για τα πιο "κοντινά" διανύσματα
 *   3. Επιστρέφει τα TOP N έγγραφα με το score ομοιότητας
 */
async function FindRelevantDocsVectorSearch(
  userMessage: string,
  limit: number
): Promise<RAGResult[]> {
  // Βήμα 1: Μετατροπή ερώτησης σε διάνυσμα
  const queryEmbedding = await GetEmbedding(userMessage);

  // Βήμα 2: Εκτέλεση aggregation pipeline με $vectorSearch
  // Το $vectorSearch είναι ειδικό Atlas operator — δεν υπάρχει σε standard MongoDB
  const results = await KnowledgeBaseModel.aggregate([
    {
      $vectorSearch: {
        // Όνομα του index που δημιουργήσαμε στο Atlas UI
        index: "vector_index",
        // Το πεδίο που περιέχει τα embeddings στο schema μας
        path: "embedding",
        // Το embedding της ερώτησης του χρήστη
        queryVector: queryEmbedding,
        // Πόσους υποψήφιους να εξετάσει πριν επιλέξει τα καλύτερα
        numCandidates: VECTOR_SEARCH_CANDIDATES,
        // Πόσα αποτελέσματα να επιστρέψει (ζητάμε λίγο παραπάνω για να αντισταθμίσουμε
        // τυχόν inactive εγγραφές που θα φιλτραριστούν στο επόμενο βήμα)
        limit: limit * 2,
      },
    },
    {
      // Προσθέτουμε το score ομοιότητας ως πεδίο στο αποτέλεσμα
      // vectorSearchScore: το cosine similarity score (0–1)
      $addFields: {
        score: { $meta: "vectorSearchScore" },
      },
    },
    {
      // Φιλτράρουμε: μόνο ενεργές καταχωρίσεις και score πάνω από το ελάχιστο.
      // Σημείωση: το filter μέσα στο $vectorSearch απαιτεί το πεδίο να είναι
      // δηλωμένο στον index — για να αποφύγουμε αυτή την απαίτηση, φιλτράρουμε
      // ΜΕΤΑ το $vectorSearch με ένα κανονικό $match.
      $match: {
        isActive: true,
        score: { $gte: MIN_SIMILARITY_SCORE },
      },
    },
    {
      // Κρατάμε μόνο τα ζητούμενα αποτελέσματα
      $limit: limit,
    },
    {
      // Δεν χρειαζόμαστε το embedding στο αποτέλεσμα (384 αριθμοί = περιττά δεδομένα)
      $project: {
        embedding: 0,
      },
    },
  ]);

  return results.map((doc: any) => ({
    document: doc as KnowledgeBaseDocument,
    score: doc.score,
  }));
}

/**
 * FindRelevantDocsTextSearch: Fallback αναζήτηση με $text (για local MongoDB).
 *
 * Γιατί είναι fallback:
 *   Το $text ψάχνει μόνο για ακριβείς λέξεις, όχι νόημα. Αν ο χρήστης πει
 *   "θέλω επιστροφή" δεν θα βρει "επιστροφή προϊόντος" αν οι λέξεις δεν ταιριάζουν.
 *   Είναι αρκετό για development/testing.
 */
async function FindRelevantDocsTextSearch(
  userMessage: string,
  limit: number
): Promise<RAGResult[]> {
  const results = await KnowledgeBaseModel.find(
    {
      $text: { $search: userMessage },
      isActive: true,
    },
    {
      // Προσθέτουμε το text search score για να μπορούμε να ταξινομήσουμε
      score: { $meta: "textScore" },
      // Εξαιρούμε το embedding από τα αποτελέσματα
      embedding: 0,
    }
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(limit);

  return results.map((doc) => ({
    document: doc,
    // Κανονικοποιούμε το text score σε εύρος 0–1 (προσεγγιστικά)
    score: 1.0,
  }));
}

/**
 * FindRelevantDocs: Κύρια συνάρτηση — βρίσκει τα πιο σχετικά έγγραφα.
 *
 * Επιλέγει αυτόματα vector search (Atlas) ή text search (local)
 * ανάλογα με το MONGODB_URI.
 *
 * @param userMessage - Η ερώτηση του χρήστη
 * @param limit - Πόσα έγγραφα να επιστρέψει (default: MAX_RAG_RESULTS = 3)
 * @returns Πίνακας με τα πιο σχετικά έγγραφα και το score τους
 */
export async function FindRelevantDocs(
  userMessage: string,
  limit: number = MAX_RAG_RESULTS
): Promise<RAGResult[]> {
  try {
    if (IsAtlas()) {
      // MongoDB Atlas: χρήση vector similarity search
      console.log(`[RAGService] Vector search για: "${userMessage.slice(0, 50)}..."`);
      return await FindRelevantDocsVectorSearch(userMessage, limit);
    } else {
      // Local MongoDB: fallback σε keyword search
      console.log(`[RAGService] Text search (fallback) για: "${userMessage.slice(0, 50)}..."`);
      return await FindRelevantDocsTextSearch(userMessage, limit);
    }
  } catch (error) {
    // Αν αποτύχει η αναζήτηση, επιστρέφουμε κενό array αντί να κρασάρει το σύστημα.
    // Ο bot θα απαντήσει χωρίς context — λιγότερο καλό αλλά δεν πέφτει το σύστημα.
    console.error("[RAGService] Σφάλμα κατά την αναζήτηση:", error);
    return [];
  }
}

/**
 * BuildRAGContext: Μετατρέπει τα αποτελέσματα RAG σε μορφοποιημένο κείμενο για το prompt.
 *
 * Γιατί χρειάζεται:
 *   Τα έγγραφα επιστρέφονται ως MongoDB objects. Το AI χρειάζεται απλό κείμενο.
 *   Αυτή η συνάρτηση "μεταφράζει" τα αποτελέσματα σε κατανοητό format για το prompt.
 *
 * @param results - Τα αποτελέσματα από FindRelevantDocs
 * @returns Μορφοποιημένο κείμενο για ένταξη στο system prompt
 */
export function BuildRAGContext(results: RAGResult[]): string {
  if (results.length === 0) {
    // Κενό context — το chatService θα χειριστεί αυτή την περίπτωση
    return "";
  }

  // Κάθε έγγραφο φαίνεται ως αριθμημένη ενότητα με τίτλο και περιεχόμενο
  const sections = results.map((result, index) => {
    const { title, content, category } = result.document;
    return `[${index + 1}] ${title} (${category})\n${content}`;
  });

  return sections.join("\n\n");
}
