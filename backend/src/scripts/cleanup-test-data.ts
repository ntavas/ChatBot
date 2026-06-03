/*
 * cleanup-test-data.ts
 *
 * Τι κάνει αυτό το script:
 *   Αφαιρεί από τη MongoDB όλα τα δεδομένα που δημιουργήθηκαν
 *   από τα evaluation scripts (evaluate.ts, feedback-experiment.ts).
 *
 *   Διαγράφει:
 *   1. Feedback έγγραφα με testRun: true
 *      (εισήχθησαν από feedback-experiment.ts ως golden rules δοκιμής)
 *   2. Conversation έγγραφα με sessionId που αρχίζει με "EVAL_"
 *      (δημιουργήθηκαν από evaluate.ts --mode=full-chat και feedback-experiment.ts)
 *
 * Γιατί χρειάζεται:
 *   Τα evaluation scripts δημιουργούν test δεδομένα στη MongoDB που
 *   επηρεάζουν τις πραγματικές απαντήσεις του bot αν μείνουν.
 *   Ιδιαίτερα τα approved feedback golden rules αλλάζουν τη συμπεριφορά
 *   του bot σε όλες τις επόμενες συνομιλίες.
 *
 * Πώς να το τρέξεις:
 *   cd backend
 *   npx ts-node --transpile-only src/scripts/cleanup-test-data.ts
 *
 * Εξαρτήσεις:
 *   - FeedbackModel      : για διαγραφή test feedbacks
 *   - ConversationModel  : για διαγραφή test συνεδριών
 *   - database.ts        : ConnectToDatabase
 */

import mongoose from "mongoose";
import { ConnectToDatabase } from "../config/database";
import { FeedbackModel } from "../models/Feedback";
import { ConversationModel } from "../models/Conversation";

// Πρόθεμα που χρησιμοποιούν όλα τα evaluation scripts για session IDs
// Πρέπει να συμφωνεί με το EVAL_SESSION_PREFIX στα άλλα scripts
const EVAL_SESSION_PREFIX = "EVAL_";

// ─────────────────────────────────────────────────────────────────────────────
// Κύρια ροή καθαρισμού
// ─────────────────────────────────────────────────────────────────────────────
async function CleanupTestData(): Promise<void> {
  await ConnectToDatabase();

  console.log("\n" + "═".repeat(70));
  console.log("  ShopEasy — Καθαρισμός Test Δεδομένων Αξιολόγησης");
  console.log("═".repeat(70) + "\n");

  // ── Διαγραφή test feedback εγγράφων ──────────────────────────────────────
  // Τα feedback με testRun: true δημιουργήθηκαν από feedback-experiment.ts.
  // Αν μείνουν, ενεργοποιούνται ως golden rules και αλλάζουν τον bot.
  let feedbackDeleted = 0;
  try {
    const feedbackResult = await FeedbackModel.deleteMany({ testRun: true });
    feedbackDeleted = feedbackResult.deletedCount;
    console.log(`  Feedback (testRun: true):   διαγράφηκαν ${feedbackDeleted} έγγραφα`);
  } catch (error) {
    console.error("  ✗ Σφάλμα κατά τη διαγραφή feedback:", (error as Error).message);
  }

  // ── Διαγραφή test conversations ───────────────────────────────────────────
  // Συνομιλίες με sessionId που αρχίζει με "EVAL_" δημιουργήθηκαν από:
  //   - evaluate.ts --mode=full-chat  (EVAL_fc-...)
  //   - feedback-experiment.ts        (EVAL_fe-...)
  // Το --mode=rag-only και --mode=baseline δεν δημιουργούν conversations.
  let conversationsDeleted = 0;
  try {
    const convResult = await ConversationModel.deleteMany({
      sessionId: { $regex: new RegExp(`^${EVAL_SESSION_PREFIX}`) },
    });
    conversationsDeleted = convResult.deletedCount;
    console.log(`  Conversations (EVAL_*):     διαγράφηκαν ${conversationsDeleted} έγγραφα`);
  } catch (error) {
    console.error("  ✗ Σφάλμα κατά τη διαγραφή conversations:", (error as Error).message);
  }

  // Σύνοψη
  const total = feedbackDeleted + conversationsDeleted;
  console.log("\n  " + "─".repeat(68));

  if (total === 0) {
    console.log("  Δεν βρέθηκαν test δεδομένα για διαγραφή.\n");
  } else {
    console.log(`  Σύνολο: ${total} έγγραφα διαγράφηκαν από τη MongoDB.\n`);
    console.log("  ✓ Ο bot θα λειτουργεί ξανά χωρίς test golden rules.\n");
  }

  console.log("═".repeat(70) + "\n");
}

// Εκτέλεση — σύνδεση, καθαρισμός, αποσύνδεση
CleanupTestData()
  .then(() => mongoose.disconnect())
  .catch((error) => {
    console.error("\nΚρίσιμο σφάλμα κατά τον καθαρισμό:", error);
    process.exit(1);
  });
