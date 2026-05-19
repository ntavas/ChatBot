/*
 * evaluate.ts
 *
 * Τι κάνει αυτό το script:
 *   Αξιολογεί τον μηχανισμό feedback loop του ShopEasy bot σε τρεις φάσεις:
 *
 *   ΦΑΣΗ 1 — Baseline:
 *     Στέλνει ερωτήσεις στον bot και καταγράφει τις αρχικές απαντήσεις
 *     χωρίς καμία διόρθωση στη βάση. Αυτό είναι το "πριν".
 *
 *   ΦΑΣΗ 2 — Εισαγωγή Golden Rules:
 *     Εισάγει εγκεκριμένες διορθώσεις (status: "approved") απευθείας στη MongoDB,
 *     προσομοιώνοντας τον admin που εγκρίνει ένα feedback από τον πίνακα διαχείρισης.
 *     Αυτές γίνονται "golden rules" που εισάγονται στο system prompt.
 *
 *   ΦΑΣΗ 3 — Post-Correction:
 *     Στέλνει τις ίδιες ερωτήσεις ξανά. Τώρα το chatService φορτώνει τα golden rules
 *     και τα εισάγει στο system prompt — ο bot τα ακολουθεί.
 *
 *   ΑΝΑΦΟΡΑ:
 *     Παράθεση "πριν vs μετά" για κάθε σενάριο. Έλεγχος αν λέξεις-κλειδιά
 *     από τη διόρθωση εμφανίζονται στη νέα απάντηση (απόδειξη βελτίωσης).
 *     Τελικό σκορ: X/N σενάρια βελτιώθηκαν.
 *
 * Γιατί χρειάζεται:
 *   Αποδεικνύει ποσοτικά ότι ο bot βελτιώνει τις απαντήσεις του μέσω
 *   human-in-the-loop feedback, χωρίς επανεκπαίδευση του μοντέλου.
 *
 * Πώς να το τρέξεις:
 *   cd backend
 *   npx ts-node --transpile-only src/scripts/evaluate.ts
 *
 * Εξαρτήσεις:
 *   - chatService.ts   : ολόκληρη η ροή RAG + AI
 *   - feedbackEngine.ts: φορτώνεται αυτόματα μέσα από chatService
 *   - FeedbackModel    : για άμεση εισαγωγή golden rules
 *   - database.ts      : σύνδεση στη MongoDB
 */

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { ConnectToDatabase } from "../config/database";
import { ProcessUserMessage } from "../services/chatService";
import { FeedbackModel } from "../models/Feedback";

// ─────────────────────────────────────────────────────────────────────────────
// Τύπος σεναρίου αξιολόγησης
// ─────────────────────────────────────────────────────────────────────────────

interface EvalCase {
  // Η ερώτηση που στέλνεται στον bot (και στις δύο φάσεις)
  question: string;
  // Η διόρθωση που "εγκρίνει" ο admin — εισάγεται ως golden rule
  correction: string;
  // Λέξεις που ΠΡΕΠΕΙ να εμφανιστούν στην post-correction απάντηση
  // ώστε να θεωρηθεί ότι ο bot ενσωμάτωσε τη διόρθωση
  keywords: string[];
  // Σύντομη περιγραφή για την αναφορά
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Σενάρια αξιολόγησης
//
// Κάθε σενάριο προσομοιώνει μια πολιτική αλλαγή ή νέα απαίτηση που
// δεν υπάρχει ακόμα στη γνωσιακή βάση — ο admin την εισάγει μέσω feedback.
// ─────────────────────────────────────────────────────────────────────────────
const EVAL_CASES: EvalCase[] = [
  {
    question: "Πόσες μέρες έχω για να επιστρέψω ένα προϊόν;",
    correction:
      "Η πολιτική επιστροφών επιτρέπει επιστροφές εντός 30 ημερών από την παραλαβή. " +
      "ΣΗΜΑΝΤΙΚΟ: Από τον Ιανουάριο 2025, κάθε επιστροφή απαιτεί τη συμπλήρωση " +
      "της φόρμας ΕΠ-2025 μέσα από το λογαριασμό σας πριν αποστείλετε το προϊόν. " +
      "Χωρίς εγκεκριμένη φόρμα ΕΠ-2025, η αίτηση επιστροφής δεν γίνεται αποδεκτή.",
    keywords: ["ΕΠ-2025", "φόρμα"],
    description: "Επιστροφές — νέα απαίτηση φόρμας ΕΠ-2025",
  },
  {
    question: "Η αποστολή είναι δωρεάν;",
    correction:
      "Το όριο για δωρεάν αποστολή μειώθηκε από 39€ σε 25€ από τον Απρίλιο 2025. " +
      "Για παραγγελίες άνω των 25€, η τυπική αποστολή είναι δωρεάν. " +
      "Το παλαιό όριο των 39€ δεν ισχύει πλέον.",
    keywords: ["25€", "25"],
    description: "Αποστολή — νέο δωρεάν όριο αποστολής (25€)",
  },
  {
    question: "Έλαβα κατεστραμμένο προϊόν, τι πρέπει να κάνω;",
    correction:
      "Για κατεστραμμένα ή ελαττωματικά προϊόντα, από το 2025 ισχύει νέα διαδικασία: " +
      "Πρέπει να αναφέρετε το πρόβλημα εντός 24 ωρών (όχι 48) από την παραλαβή " +
      "και να καλέσετε υποχρεωτικά το 210-9000000 για να λάβετε αριθμό αίτησης. " +
      "Χωρίς αριθμό αίτησης από τo 210-9000000, η αντικατάσταση δεν προχωράει.",
    keywords: ["210-9000000", "αριθμό αίτησης"],
    description: "Ελαττωματικά — νέα διαδικασία με τηλέφωνο",
  },
];

// Πρόθεμα session για τα eval runs — ξεχωρίζει από τις κανονικές συνεδρίες
const EVAL_SESSION_PREFIX = "eval-run-";

// ─────────────────────────────────────────────────────────────────────────────
// Βοηθητικές συναρτήσεις εκτύπωσης
// ─────────────────────────────────────────────────────────────────────────────

function printLine(char = "─", length = 66): void {
  console.log(char.repeat(length));
}

// Τυλίγει μακρύ κείμενο σε γραμμές max `width` χαρακτήρων με εσοχή `indent`
function wrapText(text: string, indent: string, width = 58): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      lines.push(indent + current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current.trim()) lines.push(indent + current.trim());
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry wrapper για κλήσεις AI — χειρίζεται 503/overload σφάλματα.
// Σημαντικό για παρουσιάσεις: αποτρέπει crash αν ο πάροχος είναι φορτωμένος.
// ─────────────────────────────────────────────────────────────────────────────
async function ProcessWithRetry(
  sessionId: string,
  question: string,
  maxRetries = 3,
  delayMs = 5000
): Promise<{ sessionId: string; reply: string; messageId: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await ProcessUserMessage(sessionId, question);
    } catch (error) {
      const isLast = attempt === maxRetries;
      const msg = (error as Error).message ?? "";
      const isTransient = msg.includes("503") || msg.includes("overload") ||
        msg.includes("unavailable") || msg.includes("high demand");

      if (isLast || !isTransient) throw error;

      console.log(`  ⚠ AI πάροχος φορτωμένος — αναμονή ${delayMs / 1000}s (προσπάθεια ${attempt}/${maxRetries})...`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw new Error("Εξαντλήθηκαν οι προσπάθειες σύνδεσης με τον AI πάροχο.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Αποτέλεσμα για κάθε σενάριο
// ─────────────────────────────────────────────────────────────────────────────

interface CaseResult {
  description: string;
  question: string;
  baselineAnswer: string;
  postAnswer: string;
  keywordsFound: string[];
  improved: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Κύρια αξιολόγηση
// ─────────────────────────────────────────────────────────────────────────────

async function RunEvaluation(): Promise<void> {
  await ConnectToDatabase();

  console.log("\n" + "═".repeat(66));
  console.log("  ShopEasy Bot — Αξιολόγηση Feedback Loop");
  console.log("  Θέμα: AI Chatbot Εξυπηρέτησης Πελατών με Προσαρμοστική Εκπαίδευση");
  console.log("═".repeat(66));

  // Μοναδικό ID για αυτό το eval run — αποφεύγουμε συγκρούσεις αν τρέξει ξανά
  const runId = uuidv4().slice(0, 8);

  // Καθαρισμός δεδομένων από προηγούμενα eval runs (idempotent)
  const cleaned = await FeedbackModel.deleteMany({
    sessionId: { $regex: `^${EVAL_SESSION_PREFIX}` },
  });
  if (cleaned.deletedCount > 0) {
    console.log(`\n  (Καθαρίστηκαν ${cleaned.deletedCount} αρχεία από προηγούμενο eval run)`);
  }

  const results: CaseResult[] = [];

  // ══════════════════════════════════════════════════════════════════════════
  // ΦΑΣΗ 1: Baseline — απαντήσεις ΧΩΡΙΣ feedback
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n\nΦΑΣΗ 1 — Baseline (χωρίς feedback στη βάση)");
  printLine();
  console.log(
    "  Στέλνουμε κάθε ερώτηση για πρώτη φορά.\n" +
    "  Ο bot απαντά αποκλειστικά με βάση τη γνωσιακή βάση (25 FAQs).\n"
  );

  for (let i = 0; i < EVAL_CASES.length; i++) {
    const evalCase = EVAL_CASES[i];
    // Μοναδικό sessionId για κάθε ερώτηση — χωρίς ιστορικό που θα μπέρδευε το AI
    const sessionId = `${EVAL_SESSION_PREFIX}${runId}-baseline-${i}`;

    console.log(`[${i + 1}/${EVAL_CASES.length}] ${evalCase.description}`);
    console.log(`  Ερώτηση: "${evalCase.question}"`);
    console.log("  Bot (baseline):");

    const result = await ProcessWithRetry(sessionId, evalCase.question);

    console.log(wrapText(result.reply, "    "));
    console.log();

    // Αποθηκεύουμε προσωρινά για τη φάση εισαγωγής
    results.push({
      description: evalCase.description,
      question: evalCase.question,
      baselineAnswer: result.reply,
      // θα συμπληρωθεί στη φάση 3
      postAnswer: "",
      keywordsFound: [],
      improved: false,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ΦΑΣΗ 2: Εισαγωγή Golden Rules
  //
  // Εισάγουμε approved feedback απευθείας στη MongoDB, παρακάμπτοντας
  // το βήμα "pending" για λόγους του script.
  // Στην πραγματική ροή: χρήστης → 👎 → admin approve → golden rule
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\nΦΑΣΗ 2 — Εισαγωγή Εγκεκριμένων Διορθώσεων (Golden Rules)");
  printLine();
  console.log(
    "  [Προσομοίωση admin: εγκρίνει τα pending feedbacks από τον πίνακα διαχείρισης]\n"
  );

  const injectionSessionId = `${EVAL_SESSION_PREFIX}${runId}-inject`;

  for (let i = 0; i < EVAL_CASES.length; i++) {
    const evalCase = EVAL_CASES[i];
    const baseline = results[i];

    await FeedbackModel.create({
      messageId: `eval-msg-${uuidv4()}`,
      sessionId: injectionSessionId,
      rating: -1,
      // Απευθείας "approved" — παρακάμπτει το pending βήμα για τον evaluator
      status: "approved",
      userQuestion: evalCase.question,
      // botAnswer = η πραγματική baseline απάντηση που καταγράφηκε στη φάση 1
      botAnswer: baseline.baselineAnswer,
      correction: evalCase.correction,
    });

    console.log(`  ✓ [${i + 1}/${EVAL_CASES.length}] Εγκρίθηκε: ${evalCase.description}`);
    console.log(`       Διόρθωση: "${evalCase.correction.slice(0, 70)}..."`);
    console.log();
  }

  console.log(`  ${EVAL_CASES.length} golden rules τώρα στη βάση.`);
  console.log(
    "  Κάθε επόμενο chat request θα τα φορτώσει μέσω feedbackEngine.GetGoldenRules()\n" +
    "  και θα τα εισάγει στο system prompt ως few-shot παραδείγματα."
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ΦΑΣΗ 3: Post-Correction — ίδιες ερωτήσεις με golden rules ενεργά
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n\nΦΑΣΗ 3 — Post-Correction (με golden rules εισηγμένα στο prompt)");
  printLine();
  console.log(
    "  Στέλνουμε τις ίδιες ερωτήσεις ξανά. Τώρα το chatService\n" +
    "  φορτώνει τα approved feedbacks και τα εισάγει στο system prompt.\n"
  );

  for (let i = 0; i < EVAL_CASES.length; i++) {
    const evalCase = EVAL_CASES[i];
    // Νέο, καθαρό sessionId — χωρίς ιστορικό από τη φάση 1
    const sessionId = `${EVAL_SESSION_PREFIX}${runId}-post-${i}`;

    console.log(`[${i + 1}/${EVAL_CASES.length}] ${evalCase.description}`);
    console.log(`  Ερώτηση: "${evalCase.question}"`);
    console.log("  Bot (post-correction):");

    const result = await ProcessWithRetry(sessionId, evalCase.question);

    console.log(wrapText(result.reply, "    "));

    // Ελέγχουμε αν τα keywords της διόρθωσης εμφανίζονται στη νέα απάντηση
    const answerLower = result.reply.toLowerCase();
    const keywordsFound = evalCase.keywords.filter((kw) =>
      answerLower.includes(kw.toLowerCase())
    );
    const improved = keywordsFound.length > 0;

    if (improved) {
      console.log(
        `  ✓ Βρέθηκαν keywords: ${keywordsFound.map((k) => `"${k}"`).join(", ")}`
      );
    } else {
      console.log(
        `  ✗ Αναμενόμενα keywords δεν βρέθηκαν: ${evalCase.keywords.map((k) => `"${k}"`).join(", ")}`
      );
    }
    console.log();

    results[i].postAnswer = result.reply;
    results[i].keywordsFound = keywordsFound;
    results[i].improved = improved;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ΑΝΑΦΟΡΑ ΑΠΟΤΕΛΕΣΜΑΤΩΝ
  // ══════════════════════════════════════════════════════════════════════════
  const totalImproved = results.filter((r) => r.improved).length;
  const total = EVAL_CASES.length;
  const pct = Math.round((totalImproved / total) * 100);

  console.log("\n" + "═".repeat(66));
  console.log("  ΑΠΟΤΕΛΕΣΜΑΤΑ ΑΞΙΟΛΟΓΗΣΗΣ — Σύνοψη");
  console.log("═".repeat(66) + "\n");

  for (const result of results) {
    const icon = result.improved ? "✓" : "✗";
    const label = result.improved ? "ΒΕΛΤΙΩΘΗΚΕ   " : "ΔΕΝ ΒΕΛΤΙΩΘΗΚΕ";
    const detail = result.improved
      ? `(keywords: ${result.keywordsFound.map((k) => `"${k}"`).join(", ")})`
      : `(αναμένονταν keywords από διόρθωση)`;

    console.log(`  [${icon}] ${result.description}`);
    console.log(`       → ${label}  ${detail}`);
    console.log();
  }

  printLine();
  console.log();
  console.log(`  Σκορ: ${totalImproved}/${total} σενάρια βελτιώθηκαν (${pct}%)`);
  console.log();

  if (totalImproved === total) {
    console.log("  Ο bot ενσωμάτωσε ΟΛΕΣ τις εγκεκριμένες διορθώσεις.");
    console.log("  Η προσαρμοστική εκ νέου εκπαίδευση μέσω feedback loop αποδείχθηκε.");
    console.log("  Δεν έγινε καμία αλλαγή στο μοντέλο — μόνο prompt injection.");
  } else if (totalImproved > 0) {
    console.log(`  ${totalImproved}/${total} διορθώσεις ενσωματώθηκαν επιτυχώς.`);
    console.log("  Τα υπόλοιπα σενάρια ίσως χρειάζονται διαφορετικά keywords για επαλήθευση.");
  } else {
    console.log("  Κανένα σενάριο δεν επαληθεύτηκε — ελέγξτε τα keywords και τις διορθώσεις.");
  }

  console.log();
  printLine("─");
  console.log();
  console.log("  ΠΑΡΑΤΗΡΗΣΗ:");
  console.log("  Τα παραπάνω αποτελέσματα επιτυγχάνονται αποκλειστικά με");
  console.log("  εισαγωγή few-shot παραδειγμάτων στο system prompt (prompt injection).");
  console.log("  Δεν απαιτείται fine-tuning ή επανεκπαίδευση του LLM.");
  console.log("  Ο μηχανισμός είναι ισοδύναμος με το Reward Modeling στάδιο του RLHF.");
  console.log();
  console.log("═".repeat(66) + "\n");
}

// Εκτέλεση — σύνδεση, αξιολόγηση, αποσύνδεση
RunEvaluation()
  .then(() => mongoose.disconnect())
  .catch((error) => {
    console.error("\nΚρίσιμο σφάλμα κατά την αξιολόγηση:", error);
    process.exit(1);
  });
