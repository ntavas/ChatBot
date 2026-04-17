// feedbackEngine.ts
// Μετατρέπει εγκεκριμένα feedbacks σε κανόνες ("golden rules") και αρνητικά παραδείγματα
// που εισάγονται στο system prompt — χωρίς επανεκπαίδευση του μοντέλου.
//
// Πώς λειτουργεί ο κύκλος βελτίωσης:
//   1. Χρήστης κάνει 👎 (+ προαιρετική διόρθωση)  → αποθηκεύεται με status: "pending"
//   2. Admin εγκρίνει στον πίνακα διαχείρισης       → status αλλάζει σε "approved"
//   3. Σε κάθε νέο chat request, αυτό το service    → εισάγει τους κανόνες στο system prompt
//   4. Το AI μαθαίνει από τα παραδείγματα           → αποφεύγει ίδια λάθη
//
// Εξαρτάται από: models/Feedback.ts
// Χρησιμοποιείται από: chatService.ts

import { FeedbackModel } from "../models/Feedback";

// Μέγιστος αριθμός κανόνων/παραδειγμάτων για να μην φουσκώσει το system prompt
const MAX_GOLDEN_RULES = 5;
const MAX_NEGATIVE_EXAMPLES = 5;

/**
 * GetGoldenRules: Επιστρέφει εγκεκριμένες διορθώσεις από τον admin.
 *
 * Τι είναι "golden rule":
 *   Μια αρνητική αξιολόγηση που ο admin εξέτασε και σημείωσε ως "approved".
 *   Περιέχει την κακή απάντηση (botAnswer) ΚΑΙ τη σωστή (correction).
 *   Εισάγεται στο prompt ως παράδειγμα "❌ Λάθος → ✅ Σωστό".
 *
 * @param limit - Μέγιστος αριθμός κανόνων (default: 5)
 * @returns Πίνακας feedback εγγράφων με status "approved"
 */
export async function GetGoldenRules(limit: number = MAX_GOLDEN_RULES) {
  // Φέρνουμε μόνο εγκεκριμένες διορθώσεις — αυτές έχουν ελεγχθεί από admin
  return FeedbackModel
    .find({
      rating: -1,
      status: "approved",
      correction: { $ne: null }, // Βεβαιωνόμαστε ότι υπάρχει διόρθωση
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * GetNegativeExamples: Επιστρέφει αρνητικές αξιολογήσεις που δεν έχουν εγκριθεί ακόμα.
 *
 * Τι είναι "negative example":
 *   Μια αρνητική αξιολόγηση χωρίς εγκεκριμένη διόρθωση (status: "pending").
 *   Χρησιμοποιείται για να πει στο AI "αυτό το είδος απάντησης απέτυχε — απόφυγέ το".
 *
 * @param limit - Μέγιστος αριθμός παραδειγμάτων (default: 5)
 * @returns Πίνακας feedback εγγράφων με status "pending"
 */
export async function GetNegativeExamples(limit: number = MAX_NEGATIVE_EXAMPLES) {
  // Φέρνουμε μόνο αναξιολόγητα (pending) — τα approved/rejected τα χειρίζεται το GetGoldenRules
  return FeedbackModel
    .find({ rating: -1, status: "pending" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * BuildFeedbackPromptSection: Μορφοποιεί τα golden rules και τα αρνητικά παραδείγματα
 * σε ένα ενιαίο κείμενο έτοιμο για εισαγωγή στο system prompt.
 *
 * Αν δεν υπάρχουν ούτε golden rules ούτε αρνητικά παραδείγματα, επιστρέφει "".
 * Έτσι το system prompt παραμένει καθαρό όταν δεν υπάρχει feedback.
 *
 * Μορφή εξόδου:
 *   ΜΑΘΕ ΑΠΟ ΠΡΟΗΓΟΥΜΕΝΕΣ ΔΙΟΡΘΩΣΕΙΣ:
 *   Ε: "..." | ❌ Λάθος: "..." | ✅ Σωστό: "..."
 *
 *   ΑΠΟΦΥΓΕ ΑΥΤΟ ΤΟ ΕΙΔΟΣ ΑΠΑΝΤΗΣΗΣ:
 *   - "..."
 *
 * @param goldenRules - Αποτέλεσμα από GetGoldenRules()
 * @param negativeExamples - Αποτέλεσμα από GetNegativeExamples()
 * @returns Μορφοποιημένο κείμενο για εισαγωγή στο system prompt, ή "" αν δεν υπάρχει τίποτα
 */
export function BuildFeedbackPromptSection(
  goldenRules: Awaited<ReturnType<typeof GetGoldenRules>>,
  negativeExamples: Awaited<ReturnType<typeof GetNegativeExamples>>
): string {
  const parts: string[] = [];

  // ── Golden rules: εγκεκριμένες διορθώσεις ─────────────────────────────────
  // Κάθε κανόνας δείχνει στο AI: "αντί για Χ, πες Υ"
  if (goldenRules.length > 0) {
    const ruleLines = goldenRules
      .map((rule) => {
        const question = rule.userQuestion
          ? `Ε: "${rule.userQuestion}"`
          : null;
        const wrong = rule.botAnswer
          ? `❌ Λάθος: "${rule.botAnswer}"`
          : null;
        // Το correction πάντα υπάρχει για golden rules (φιλτράρεται στο query)
        const correct = `✅ Σωστό: "${rule.correction}"`;

        return [question, wrong, correct].filter(Boolean).join(" | ");
      })
      .filter((line) => line.length > 0);

    if (ruleLines.length > 0) {
      parts.push(`ΜΑΘΕ ΑΠΟ ΠΡΟΗΓΟΥΜΕΝΕΣ ΔΙΟΡΘΩΣΕΙΣ:\n${ruleLines.join("\n")}`);
    }
  }

  // ── Negative examples: αρνητικά παραδείγματα χωρίς εγκεκριμένη διόρθωση ──
  // Δείχνουν στο AI τι απέτυχε — χωρίς να ξέρουμε ακόμα τη σωστή απάντηση
  if (negativeExamples.length > 0) {
    const exampleLines = negativeExamples
      .filter((ex) => ex.botAnswer) // Μόνο εγγραφές με αποθηκευμένη απάντηση
      .map((ex) => {
        // Αν ο χρήστης πρότεινε διόρθωση (pending approval), συμπεριλαμβάνουμε την υπαινιγμό
        if (ex.correction) {
          return `- Απέφυγε: "${ex.botAnswer}" (πιθανή βελτίωση: "${ex.correction}")`;
        }
        return `- Απέφυγε αυτό το είδος απάντησης: "${ex.botAnswer}"`;
      });

    if (exampleLines.length > 0) {
      parts.push(`ΑΠΟΦΥΓΕ ΑΥΤΟ ΤΟ ΕΙΔΟΣ ΑΠΑΝΤΗΣΗΣ (αξιολογήθηκαν αρνητικά από χρήστες):\n${exampleLines.join("\n")}`);
    }
  }

  return parts.join("\n\n");
}
