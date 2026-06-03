/*
 * evaluate.ts
 *
 * Τι κάνει αυτό το script:
 *   Αξιολογεί το σύστημα RAG και το chatbot του ShopEasy χρησιμοποιώντας
 *   ένα σταθερό σύνολο 30 ερωτήσεων (test set) σε τρεις κατηγορίες:
 *   - direct (D01-D10): ερωτήσεις που αντιστοιχούν άμεσα σε FAQs
 *   - paraphrased (P01-P10): ίδιο νόημα, διαφορετική διατύπωση
 *   - off-topic (O01-O05): άσχετες ερωτήσεις — το RAG δεν πρέπει να επιστρέφει τίποτα
 *   - cross-lingual (X01-X05): αγγλικές ερωτήσεις που πρέπει να βρουν ελληνικά FAQs
 *
 * Τρεις λειτουργίες (modes):
 *   --mode=rag-only   : μόνο ανάκτηση εγγράφων, χωρίς AI κλήσεις (~2-5 λεπτά)
 *   --mode=full-chat  : πλήρης ροή RAG + AI, για χειροκίνητη βαθμολόγηση (~10-20 λεπτά)
 *   --mode=baseline   : κλήση AI χωρίς RAG context, για σύγκριση (~10-20 λεπτά)
 *
 * Γιατί χρειάζεται:
 *   Παράγει τα αριθμητικά αποτελέσματα (precision, recall, accuracy) που
 *   περιλαμβάνονται στο Κεφάλαιο 7 (Αξιολόγηση) της πτυχιακής εργασίας.
 *
 * Πώς να το τρέξεις:
 *   cd backend
 *   npx ts-node --transpile-only src/scripts/evaluate.ts --mode=rag-only
 *   npx ts-node --transpile-only src/scripts/evaluate.ts --mode=full-chat
 *   npx ts-node --transpile-only src/scripts/evaluate.ts --mode=baseline
 *
 * Εξαρτήσεις:
 *   - ragService.ts         : FindRelevantDocs για ανάκτηση εγγράφων
 *   - chatService.ts        : ProcessUserMessage για πλήρη ροή
 *   - embeddingService.ts   : WarmUp για προφόρτωση του μοντέλου
 *   - aiProviderFactory.ts  : GetAIProvider για baseline κλήσεις
 *   - database.ts           : ConnectToDatabase (rag-only και full-chat μόνο)
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { ConnectToDatabase } from "../config/database";
import { FindRelevantDocs } from "../services/ragService";
import { ProcessUserMessage } from "../services/chatService";
import { WarmUp } from "../services/embeddingService";
import { GetAIProvider } from "../config/aiProviderFactory";
import { Message } from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// Σταθερές — χωρίς "magic numbers" στον κώδικα
// ─────────────────────────────────────────────────────────────────────────────

// Πρόθεμα session ID για όλα τα evaluation runs — επιτρέπει εντοπισμό και καθαρισμό
const EVAL_SESSION_PREFIX = "EVAL_";

// Μέγιστος αριθμός επαναλήψεων για AI κλήσεις που αποτυγχάνουν προσωρινά
const MAX_RETRIES = 3;

// Αναμονή μεταξύ επαναλήψεων (milliseconds)
const RETRY_DELAY_MS = 5000;

// System prompt για το baseline mode — σκόπιμα ελάχιστο, χωρίς RAG context
const BASELINE_SYSTEM_PROMPT = "You are a ShopEasy customer support assistant.";

// Κατάλογος αποθήκευσης αποτελεσμάτων — δύο επίπεδα πάνω από το scripts/
const RESULTS_DIR = path.join(__dirname, "../../evaluation-results");

// Έγκυρα modes που μπορεί να περάσει ο χρήστης
const VALID_MODES = ["rag-only", "full-chat", "baseline"] as const;
type EvalMode = (typeof VALID_MODES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Τύποι για το test set
// ─────────────────────────────────────────────────────────────────────────────

// Κατηγορία κάθε ερώτησης στο test set
type TestCategory = "direct" | "paraphrased" | "off-topic" | "cross-lingual";

// Μία ερώτηση στο σταθερό test set των 30 ερωτήσεων
interface TestQuestion {
  // Μοναδικό ID — π.χ. "D01", "P05", "O02", "X03"
  id: string;
  // Κατηγορία ερώτησης
  category: TestCategory;
  // Το κείμενο της ερώτησης
  question: string;
  // Γλώσσα της ερώτησης (ελληνικά ή αγγλικά)
  language: "el" | "en";
  // Τίτλοι FAQ που πρέπει να επιστρέφει το RAG — [] για off-topic
  expectedFaqTitles: string[];
  // true αν το RAG πρέπει να βρει κάτι σχετικό, false για off-topic
  shouldFindRelevantDoc: boolean;
}

// Αποτέλεσμα RAG για μια ερώτηση — χρησιμοποιείται στο rag-only mode
interface RAGEvalResult {
  id: string;
  category: TestCategory;
  question: string;
  retrievedTitles: string[];
  retrievedScores: number[];
  expectedFaqTitles: string[];
  // Τουλάχιστον 1 αναμενόμενος τίτλος βρέθηκε στα αποτελέσματα
  hit: boolean;
  // Για off-topic: true αν το RAG δεν επέστρεψε κανένα έγγραφο (σωστή απόρριψη)
  correctlyRejected: boolean;
}

// Συνολικές μετρικές για το rag-only mode — αποθηκεύεται σε JSON
interface RAGMetrics {
  runDate: string;
  totalQuestions: number;
  directHitRate: number;
  paraphrasedHitRate: number;
  offTopicRejectionRate: number;
  crossLingualHitRate: number;
  // Precision: hits στις D+P+X ερωτήσεις (25 συνολικά, εξαιρείται off-topic)
  overallPrecision: number;
  perCategoryMetrics: {
    direct: { questions: number; hits: number; hitRate: number };
    paraphrased: { questions: number; hits: number; hitRate: number };
    offTopic: { questions: number; correctlyRejected: number; rejectionRate: number };
    crossLingual: { questions: number; hits: number; hitRate: number };
  };
  results: RAGEvalResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SET — 30 ερωτήσεις αξιολόγησης
//
// Κάθε ερώτηση έχει σχόλιο που δείχνει ποιο FAQ στόχευε.
// Τα expectedFaqTitles αντιστοιχούν στους τίτλους του seedKnowledge.ts.
// ─────────────────────────────────────────────────────────────────────────────
const TEST_SET: TestQuestion[] = [
  // ── DIRECT (D01-D10) ────────────────────────────────────────────────────
  // Ερωτήσεις που ταιριάζουν σχεδόν απευθείας με το περιεχόμενο των FAQs.
  // Στόχος: να επιβεβαιωθεί ότι το RAG βρίσκει τα πιο προφανή αποτελέσματα.

  // Στόχος FAQ: "Πολιτική Επιστροφών"
  {
    id: "D01",
    category: "direct",
    question: "Πόσες μέρες έχω για να επιστρέψω ένα προϊόν;",
    language: "el",
    expectedFaqTitles: ["Πολιτική Επιστροφών"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Χρόνος Επιστροφής Χρημάτων"
  {
    id: "D02",
    category: "direct",
    question: "Πότε θα λάβω τα χρήματά μου πίσω μετά την επιστροφή;",
    language: "el",
    expectedFaqTitles: ["Χρόνος Επιστροφής Χρημάτων"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Κόστος Αποστολής"
  {
    id: "D03",
    category: "direct",
    question: "Η αποστολή είναι δωρεάν;",
    language: "el",
    expectedFaqTitles: ["Κόστος Αποστολής"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Χρόνοι Παράδοσης"
  {
    id: "D04",
    category: "direct",
    question: "Πόσες μέρες παίρνει η παράδοση;",
    language: "el",
    expectedFaqTitles: ["Χρόνοι Παράδοσης"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Παρακολούθηση Παραγγελίας"
  {
    id: "D05",
    category: "direct",
    question: "Πώς μπορώ να παρακολουθήσω την παραγγελία μου;",
    language: "el",
    expectedFaqTitles: ["Παρακολούθηση Παραγγελίας"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Αποδεκτές Μέθοδοι Πληρωμής"
  {
    id: "D06",
    category: "direct",
    question: "Ποιες μεθόδους πληρωμής δέχεστε;",
    language: "el",
    expectedFaqTitles: ["Αποδεκτές Μέθοδοι Πληρωμής"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Δημιουργία Λογαριασμού"
  {
    id: "D07",
    category: "direct",
    question: "Πώς δημιουργώ λογαριασμό;",
    language: "el",
    expectedFaqTitles: ["Δημιουργία Λογαριασμού"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Ξεχασμένος Κωδικός"
  {
    id: "D08",
    category: "direct",
    question: "Ξέχασα τον κωδικό μου, τι κάνω;",
    language: "el",
    expectedFaqTitles: ["Ξεχασμένος Κωδικός"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Επιστροφή Ελαττωματικού Προϊόντος"
  {
    id: "D09",
    category: "direct",
    question: "Τι γίνεται αν παραλάβω ελαττωματικό προϊόν;",
    language: "el",
    expectedFaqTitles: ["Επιστροφή Ελαττωματικού Προϊόντος"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Πρόγραμμα Πιστότητας ShopEasy Rewards"
  {
    id: "D10",
    category: "direct",
    question: "Πώς λειτουργεί το πρόγραμμα πιστότητας;",
    language: "el",
    expectedFaqTitles: ["Πρόγραμμα Πιστότητας ShopEasy Rewards"],
    shouldFindRelevantDoc: true,
  },

  // ── PARAPHRASED (P01-P10) ────────────────────────────────────────────────
  // Ερωτήσεις με διαφορετική διατύπωση αλλά ίδιο νόημα.
  // Στόχος: να επιβεβαιωθεί ότι το σημασιολογικό embedding λειτουργεί πέρα
  // από αντιστοίχιση λέξεων (keyword matching).

  // Στόχος FAQ: "Πολιτική Επιστροφών"
  {
    id: "P01",
    category: "paraphrased",
    question: "Μπορώ να στείλω πίσω κάτι που αγόρασα;",
    language: "el",
    expectedFaqTitles: ["Πολιτική Επιστροφών"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Χρόνος Επιστροφής Χρημάτων"
  {
    id: "P02",
    category: "paraphrased",
    question: "Σε πόσες μέρες επιστρέφονται τα χρήματα στην κάρτα μου;",
    language: "el",
    expectedFaqTitles: ["Χρόνος Επιστροφής Χρημάτων"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Κόστος Αποστολής"
  {
    id: "P03",
    category: "paraphrased",
    question: "Υπάρχει δωρεάν μεταφορικά;",
    language: "el",
    expectedFaqTitles: ["Κόστος Αποστολής"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Χρόνοι Παράδοσης"
  {
    id: "P04",
    category: "paraphrased",
    question: "Πότε αναμένω να παραλάβω την παραγγελία μου;",
    language: "el",
    expectedFaqTitles: ["Χρόνοι Παράδοσης"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Παρακολούθηση Παραγγελίας"
  {
    id: "P05",
    category: "paraphrased",
    question: "Έχω αριθμό tracking, πού τον βλέπω;",
    language: "el",
    expectedFaqTitles: ["Παρακολούθηση Παραγγελίας"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Αποδεκτές Μέθοδοι Πληρωμής"
  {
    id: "P06",
    category: "paraphrased",
    question: "Δέχεστε PayPal ή κάρτες;",
    language: "el",
    expectedFaqTitles: ["Αποδεκτές Μέθοδοι Πληρωμής"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Δημιουργία Λογαριασμού"
  {
    id: "P07",
    category: "paraphrased",
    question: "Θέλω να φτιάξω νέο λογαριασμό στο ShopEasy",
    language: "el",
    expectedFaqTitles: ["Δημιουργία Λογαριασμού"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Ξεχασμένος Κωδικός"
  {
    id: "P08",
    category: "paraphrased",
    question: "Δεν θυμάμαι το password μου",
    language: "el",
    expectedFaqTitles: ["Ξεχασμένος Κωδικός"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Επιστροφή Ελαττωματικού Προϊόντος"
  {
    id: "P09",
    category: "paraphrased",
    question: "Έλαβα κατεστραμμένο προϊόν, τι πρέπει να κάνω;",
    language: "el",
    expectedFaqTitles: ["Επιστροφή Ελαττωματικού Προϊόντος"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Πρόγραμμα Πιστότητας ShopEasy Rewards"
  {
    id: "P10",
    category: "paraphrased",
    question: "Κερδίζω πόντους με κάθε αγορά;",
    language: "el",
    expectedFaqTitles: ["Πρόγραμμα Πιστότητας ShopEasy Rewards"],
    shouldFindRelevantDoc: true,
  },

  // ── OFF-TOPIC (O01-O05) ──────────────────────────────────────────────────
  // Ερωτήσεις άσχετες με το e-shop.
  // Στόχος: το RAG να μην επιστρέφει κανένα έγγραφο (score < MIN_SIMILARITY_SCORE=0.5).
  // Μετράμε το "off-topic rejection rate" — πόσες φορές σωστά δεν βρήκε τίποτα.

  // Καμία σχέση με ShopEasy — ερώτηση πολιτικής
  {
    id: "O01",
    category: "off-topic",
    question: "Ποιος είναι ο πρωθυπουργός της Ελλάδας;",
    language: "el",
    expectedFaqTitles: [],
    shouldFindRelevantDoc: false,
  },
  // Καμία σχέση με ShopEasy — δημιουργική ερώτηση
  {
    id: "O02",
    category: "off-topic",
    question: "Πες μου μια ιστορία",
    language: "el",
    expectedFaqTitles: [],
    shouldFindRelevantDoc: false,
  },
  // Καμία σχέση με ShopEasy — καιρός
  {
    id: "O03",
    category: "off-topic",
    question: "Τι καιρό κάνει σήμερα;",
    language: "el",
    expectedFaqTitles: [],
    shouldFindRelevantDoc: false,
  },
  // Καμία σχέση με ShopEasy — μαγειρική
  {
    id: "O04",
    category: "off-topic",
    question: "Πώς φτιάχνω σπαγγέτι μπολονέζ;",
    language: "el",
    expectedFaqTitles: [],
    shouldFindRelevantDoc: false,
  },
  // Καμία σχέση με ShopEasy — λογοτεχνία
  {
    id: "O05",
    category: "off-topic",
    question: "Βοήθησέ με να γράψω ένα ποίημα",
    language: "el",
    expectedFaqTitles: [],
    shouldFindRelevantDoc: false,
  },

  // ── CROSS-LINGUAL (X01-X05) ──────────────────────────────────────────────
  // Αγγλικές ερωτήσεις που πρέπει να ανακτήσουν ελληνικά FAQs.
  // Ελέγχει αν το πολύγλωσσο μοντέλο (paraphrase-multilingual-MiniLM-L12-v2)
  // λειτουργεί σωστά μεταξύ αγγλικού και ελληνικού σημασιολογικού χώρου.

  // Στόχος FAQ: "Πολιτική Επιστροφών"
  {
    id: "X01",
    category: "cross-lingual",
    question: "How many days do I have to return a product?",
    language: "en",
    expectedFaqTitles: ["Πολιτική Επιστροφών"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Κόστος Αποστολής"
  {
    id: "X02",
    category: "cross-lingual",
    question: "Is shipping free?",
    language: "en",
    expectedFaqTitles: ["Κόστος Αποστολής"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Παρακολούθηση Παραγγελίας"
  {
    id: "X03",
    category: "cross-lingual",
    question: "How do I track my order?",
    language: "en",
    expectedFaqTitles: ["Παρακολούθηση Παραγγελίας"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Αποδεκτές Μέθοδοι Πληρωμής"
  {
    id: "X04",
    category: "cross-lingual",
    question: "What payment methods do you accept?",
    language: "en",
    expectedFaqTitles: ["Αποδεκτές Μέθοδοι Πληρωμής"],
    shouldFindRelevantDoc: true,
  },
  // Στόχος FAQ: "Επιστροφή Ελαττωματικού Προϊόντος"
  {
    id: "X05",
    category: "cross-lingual",
    question: "I received a damaged product, what should I do?",
    language: "en",
    expectedFaqTitles: ["Επιστροφή Ελαττωματικού Προϊόντος"],
    shouldFindRelevantDoc: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Βοηθητικές συναρτήσεις
// ─────────────────────────────────────────────────────────────────────────────

// Τυπώνει γραμμή διαχωρισμού για καλύτερη αναγνωσιμότητα στο terminal
function printLine(char = "─", length = 70): void {
  console.log(char.repeat(length));
}

// Μετατρέπει αριθμό σε χρωματιστό string — πράσινο αν καλό, κόκκινο αν κακό
function colorRate(value: number, threshold = 70): string {
  const pct = value.toFixed(1) + "%";
  if (value >= threshold) return `\x1b[32m${pct}\x1b[0m`; // πράσινο
  if (value >= threshold * 0.6) return `\x1b[33m${pct}\x1b[0m`; // κίτρινο
  return `\x1b[31m${pct}\x1b[0m`; // κόκκινο
}

// Χειρίζεται παροδικά σφάλματα AI παρόχων (503, overload) με επανάληψη
// Εξάγει τα δευτερόλεπτα αναμονής από το μήνυμα 429 rate-limit του Gemini.
// Παράδειγμα μηνύματος: "Please retry in 21.880236347s"
// Επιστρέφει milliseconds ή null αν δεν βρεθεί.
function parseRetryAfterMs(msg: string): number | null {
  const match = msg.match(/retry in ([\d.]+)s/i);
  if (match) {
    // Προσθέτουμε 2 δευτερόλεπτα buffer για να αποφύγουμε οριακές περιπτώσεις
    return Math.ceil(parseFloat(match[1]) * 1000) + 2000;
  }
  return null;
}

async function retryAICall<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = (error as Error).message ?? "";

      // Ημερήσιο όριο quota (π.χ. Gemini free tier: 20 req/day) — δεν έχει νόημα retry
      // Αναγνωρίζεται από το quotaId "PerDay" στο μήνυμα του API
      const isDailyQuota = msg.includes("PerDay") || msg.includes("per_day");
      if (isDailyQuota) {
        console.error(
          `\n  ✗ Ημερήσιο όριο API εξαντλήθηκε (daily quota). Δεν γίνεται retry.`
        );
        console.error(
          `    Λύση: άλλαξε AI_PROVIDER σε "openrouter" στο backend/.env και τρέξε ξανά.\n`
        );
        throw error;
      }

      const isLast = attempt === MAX_RETRIES;

      // Παροδικά σφάλματα: ανά λεπτό rate limit (429) ή server overload (503)
      const isRateLimit = msg.includes("429") || msg.includes("quota") || msg.includes("Too Many Requests");
      const isOverload =
        msg.includes("503") ||
        msg.includes("overload") ||
        msg.includes("unavailable") ||
        msg.includes("high demand");
      const isTransient = isRateLimit || isOverload;

      if (isLast || !isTransient) throw error;

      // Για rate limit: αναμένουμε όσο υποδεικνύει το API, αλλιώς 30s
      const waitMs = isRateLimit
        ? (parseRetryAfterMs(msg) ?? 30000)
        : RETRY_DELAY_MS;

      console.log(
        `  ⚠ ${label} — ${isRateLimit ? "Rate limit (429)" : "Overload (503)"}, αναμονή ${(waitMs / 1000).toFixed(0)}s (${attempt}/${MAX_RETRIES})...`
      );
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }
  throw new Error("Εξαντλήθηκαν οι προσπάθειες σύνδεσης.");
}

// Δημιουργεί γραμμή CSV με σωστό quoting — τα πεδία τυλίγονται σε "" και
// τα εσωτερικά " διπλασιάζονται ώστε να χειριστούν multiline απαντήσεις bot
function csvRow(fields: string[]): string {
  return fields
    .map((f) => `"${String(f).replace(/"/g, '""')}"`)
    .join(",");
}

// Αρχικοποιεί τον κατάλογο αποτελεσμάτων αν δεν υπάρχει
function ensureResultsDir(): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 1: rag-only
// Καλεί μόνο FindRelevantDocs, χωρίς AI. Γρήγορο — ~2-5 λεπτά.
// Υπολογίζει αυτόματα precision, recall, off-topic rejection rate, cross-lingual hit rate.
// ─────────────────────────────────────────────────────────────────────────────
async function runRagOnly(): Promise<void> {
  console.log("\n" + "═".repeat(70));
  console.log("  ShopEasy — Αξιολόγηση RAG Pipeline (mode: rag-only)");
  console.log("═".repeat(70) + "\n");

  await ConnectToDatabase();
  await WarmUp();

  console.log(`  Αξιολόγηση ${TEST_SET.length} ερωτήσεων...\n`);
  printLine();

  const results: RAGEvalResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < TEST_SET.length; i++) {
    const q = TEST_SET[i];
    process.stdout.write(
      `  [${String(i + 1).padStart(2, "0")}/${TEST_SET.length}] ${q.id} | ${q.question.slice(0, 55)}...`
    );

    try {
      // Ανάκτηση εγγράφων από τη γνωσιακή βάση για αυτή την ερώτηση
      const ragResults = await FindRelevantDocs(q.question, 3);
      const retrievedTitles = ragResults.map((r) => r.document.title);
      const retrievedScores = ragResults.map((r) => r.score);

      // Ελέγχουμε αν βρέθηκε τουλάχιστον ένας από τους αναμενόμενους τίτλους
      const hit =
        q.expectedFaqTitles.length > 0 &&
        q.expectedFaqTitles.some((t) => retrievedTitles.includes(t));

      // Για off-topic: σωστή απόρριψη = μηδέν έγγραφα επεστράφησαν
      const correctlyRejected =
        q.category === "off-topic" && retrievedTitles.length === 0;

      const icon = q.category === "off-topic"
        ? (correctlyRejected ? " ✓" : " ✗")
        : (hit ? " ✓" : " ✗");

      console.log(icon);

      results.push({
        id: q.id,
        category: q.category,
        question: q.question,
        retrievedTitles,
        retrievedScores,
        expectedFaqTitles: q.expectedFaqTitles,
        hit,
        correctlyRejected,
      });
    } catch (error) {
      console.log(" ✗ (σφάλμα)");
      console.error(`    Σφάλμα για ${q.id}:`, (error as Error).message);
      results.push({
        id: q.id,
        category: q.category,
        question: q.question,
        retrievedTitles: [],
        retrievedScores: [],
        expectedFaqTitles: q.expectedFaqTitles,
        hit: false,
        correctlyRejected: q.category === "off-topic",
      });
    }
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // Υπολογισμός μετρικών ανά κατηγορία
  const directResults = results.filter((r) => r.category === "direct");
  const paraphrasedResults = results.filter((r) => r.category === "paraphrased");
  const offTopicResults = results.filter((r) => r.category === "off-topic");
  const crossLingualResults = results.filter((r) => r.category === "cross-lingual");

  const directHits = directResults.filter((r) => r.hit).length;
  const paraphrasedHits = paraphrasedResults.filter((r) => r.hit).length;
  const offTopicRejected = offTopicResults.filter((r) => r.correctlyRejected).length;
  const crossLingualHits = crossLingualResults.filter((r) => r.hit).length;

  // overallPrecision: ποσοστό επιτυχίας σε D+P+X (25 ερωτήσεις, εξαιρείται off-topic)
  const relevantTotal = directResults.length + paraphrasedResults.length + crossLingualResults.length;
  const relevantHits = directHits + paraphrasedHits + crossLingualHits;

  const metrics: RAGMetrics = {
    runDate: new Date().toISOString(),
    totalQuestions: TEST_SET.length,
    directHitRate: (directHits / directResults.length) * 100,
    paraphrasedHitRate: (paraphrasedHits / paraphrasedResults.length) * 100,
    offTopicRejectionRate: (offTopicRejected / offTopicResults.length) * 100,
    crossLingualHitRate: (crossLingualHits / crossLingualResults.length) * 100,
    overallPrecision: (relevantHits / relevantTotal) * 100,
    perCategoryMetrics: {
      direct: {
        questions: directResults.length,
        hits: directHits,
        hitRate: (directHits / directResults.length) * 100,
      },
      paraphrased: {
        questions: paraphrasedResults.length,
        hits: paraphrasedHits,
        hitRate: (paraphrasedHits / paraphrasedResults.length) * 100,
      },
      offTopic: {
        questions: offTopicResults.length,
        correctlyRejected: offTopicRejected,
        rejectionRate: (offTopicRejected / offTopicResults.length) * 100,
      },
      crossLingual: {
        questions: crossLingualResults.length,
        hits: crossLingualHits,
        hitRate: (crossLingualHits / crossLingualResults.length) * 100,
      },
    },
    results,
  };

  // Εκτύπωση σύνοψης
  console.log("\n" + "═".repeat(70));
  console.log("  ΑΠΟΤΕΛΕΣΜΑΤΑ RAG — Σύνοψη Μετρικών");
  console.log("═".repeat(70));
  console.log(`  Χρόνος εκτέλεσης: ${elapsedSec}s\n`);
  console.log(`  Direct Hit Rate      (D01-D10):  ${colorRate(metrics.directHitRate)}  [${directHits}/${directResults.length}]`);
  console.log(`  Paraphrased Hit Rate (P01-P10):  ${colorRate(metrics.paraphrasedHitRate)}  [${paraphrasedHits}/${paraphrasedResults.length}]`);
  console.log(`  Off-topic Rejection  (O01-O05):  ${colorRate(metrics.offTopicRejectionRate)}  [${offTopicRejected}/${offTopicResults.length}]`);
  console.log(`  Cross-lingual Hit    (X01-X05):  ${colorRate(metrics.crossLingualHitRate)}  [${crossLingualHits}/${crossLingualResults.length}]`);
  printLine();
  console.log(`  Overall Precision    (D+P+X):    ${colorRate(metrics.overallPrecision)}  [${relevantHits}/${relevantTotal}]\n`);

  // Αποθήκευση αποτελεσμάτων σε JSON
  ensureResultsDir();
  const outputPath = path.join(RESULTS_DIR, "results-rag-only.json");
  fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2), "utf-8");
  console.log(`  ✓ Αποτελέσματα αποθηκεύτηκαν: ${outputPath}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 2: full-chat
// Πλήρης ροή RAG + AI για κάθε ερώτηση. Παράγει CSV για χειροκίνητη βαθμολόγηση.
// ─────────────────────────────────────────────────────────────────────────────
async function runFullChat(): Promise<void> {
  console.log("\n" + "═".repeat(70));
  console.log("  ShopEasy — Αξιολόγηση Full Chat (mode: full-chat)");
  console.log("═".repeat(70) + "\n");
  console.log("  Κάθε ερώτηση στέλνεται στο chatbot (RAG + AI).");
  console.log("  Το CSV που παράγεται χρειάζεται χειροκίνητη βαθμολόγηση (my_grade: 1/0).\n");

  await ConnectToDatabase();
  await WarmUp();

  // Μοναδικό ID για αυτό το run — αποφεύγει συγκρούσεις αν τρέξει ξανά
  const runId = uuidv4().slice(0, 8);
  const rows: string[] = [];
  const startTime = Date.now();

  // Επικεφαλίδα CSV
  rows.push(csvRow(["id", "category", "question", "bot_response", "rag_docs_used", "my_grade", "notes"]));

  for (let i = 0; i < TEST_SET.length; i++) {
    const q = TEST_SET[i];
    console.log(`  [${String(i + 1).padStart(2, "0")}/${TEST_SET.length}] ${q.id} — ${q.question.slice(0, 60)}`);

    // Ξεχωριστό sessionId ανά ερώτηση — καθαρό ιστορικό, χωρίς παρεμβολές
    const sessionId = `${EVAL_SESSION_PREFIX}fc-${runId}-${q.id.toLowerCase()}`;

    let botResponse = "";
    let ragDocsUsed = "";

    try {
      // Πλήρης ροή: RAG ανάκτηση + AI απάντηση
      const chatResult = await retryAICall(
        () => ProcessUserMessage(sessionId, q.question),
        q.id
      );
      botResponse = chatResult.reply;

      // Ξεχωριστή κλήση RAG για να καταγράψουμε ποια έγγραφα χρησιμοποιήθηκαν
      const ragResults = await FindRelevantDocs(q.question, 3);
      ragDocsUsed = ragResults.map((r) => r.document.title).join(" | ");

      console.log(`       ✓ Απάντηση: ${botResponse.slice(0, 80)}...`);
    } catch (error) {
      botResponse = `ΣΦΑΛΜΑ: ${(error as Error).message}`;
      console.error(`       ✗ Σφάλμα: ${(error as Error).message}`);
    }

    rows.push(csvRow([q.id, q.category, q.question, botResponse, ragDocsUsed, "", ""]));
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  ensureResultsDir();
  const outputPath = path.join(RESULTS_DIR, "results-full-chat.csv");
  fs.writeFileSync(outputPath, rows.join("\n"), "utf-8");

  console.log(`\n  Χρόνος εκτέλεσης: ${elapsedSec}s`);
  console.log(`  ✓ CSV αποθηκεύτηκε: ${outputPath}`);
  console.log("\n  Επόμενο βήμα: Άνοιξε το CSV και συμπλήρωσε my_grade (1=σωστό, 0=λάθος).");
  console.log("  Μετά τρέξε: npx ts-node --transpile-only src/scripts/compare.ts\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 3: baseline
// Κλήση AI χωρίς RAG context — χρησιμεύει ως βάση σύγκρισης (baseline).
// Δεν συνδέεται στη MongoDB, δεν αποθηκεύει conversations.
// ─────────────────────────────────────────────────────────────────────────────
async function runBaseline(): Promise<void> {
  console.log("\n" + "═".repeat(70));
  console.log("  ShopEasy — Αξιολόγηση Baseline χωρίς RAG (mode: baseline)");
  console.log("═".repeat(70) + "\n");
  console.log("  Κάθε ερώτηση στέλνεται ΜΟΝΟ στο AI, χωρίς γνωσιακή βάση.");
  console.log("  Σκοπός: σύγκριση με full-chat για να μετρηθεί η αξία του RAG.\n");

  // Στο baseline mode δεν χρειάζεται MongoDB — δεν γίνεται ανάκτηση FAQs
  const aiProvider = GetAIProvider();
  const rows: string[] = [];
  const startTime = Date.now();

  rows.push(csvRow(["id", "category", "question", "bot_response", "rag_docs_used", "my_grade", "notes"]));

  for (let i = 0; i < TEST_SET.length; i++) {
    const q = TEST_SET[i];
    console.log(`  [${String(i + 1).padStart(2, "0")}/${TEST_SET.length}] ${q.id} — ${q.question.slice(0, 60)}`);

    // Μοναδικό messageId για αυτή την ερώτηση
    const userMessage: Message = {
      messageId: uuidv4(),
      role: "user",
      content: q.question,
      timestamp: new Date(),
    };

    let botResponse = "";

    try {
      // Κλήση AI χωρίς RAG context — μόνο minimal system prompt
      botResponse = await retryAICall(
        () => aiProvider.GenerateResponse([userMessage], BASELINE_SYSTEM_PROMPT),
        q.id
      );
      console.log(`       ✓ Απάντηση: ${botResponse.slice(0, 80)}...`);
    } catch (error) {
      botResponse = `ΣΦΑΛΜΑ: ${(error as Error).message}`;
      console.error(`       ✗ Σφάλμα: ${(error as Error).message}`);
    }

    // rag_docs_used είναι κενό στο baseline — δεν έγινε ανάκτηση
    rows.push(csvRow([q.id, q.category, q.question, botResponse, "", "", ""]));
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  ensureResultsDir();
  const outputPath = path.join(RESULTS_DIR, "results-baseline.csv");
  fs.writeFileSync(outputPath, rows.join("\n"), "utf-8");

  console.log(`\n  Χρόνος εκτέλεσης: ${elapsedSec}s`);
  console.log(`  ✓ CSV αποθηκεύτηκε: ${outputPath}`);
  console.log("\n  Επόμενο βήμα: Άνοιξε το CSV και συμπλήρωσε my_grade (1=σωστό, 0=λάθος).");
  console.log("  Μετά τρέξε: npx ts-node --transpile-only src/scripts/compare.ts\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Κύρια συνάρτηση — ανάγνωση mode και εκτέλεση
// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Ανάγνωση --mode= από command-line arguments
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  const mode = (modeArg?.split("=")[1] ?? "rag-only") as EvalMode;

  if (!VALID_MODES.includes(mode)) {
    console.error(`\n  Άγνωστο mode: "${mode}"`);
    console.error(`  Έγκυρα: ${VALID_MODES.join(", ")}`);
    console.error("\n  Παράδειγμα:");
    console.error("    npx ts-node --transpile-only src/scripts/evaluate.ts --mode=rag-only\n");
    process.exit(1);
  }

  if (mode === "rag-only") {
    await runRagOnly();
  } else if (mode === "full-chat") {
    await runFullChat();
  } else {
    await runBaseline();
  }
}

// Εκτέλεση — σύνδεση, αξιολόγηση, αποσύνδεση
main()
  .then(() => mongoose.disconnect())
  .catch((error) => {
    console.error("\nΚρίσιμο σφάλμα κατά την αξιολόγηση:", error);
    process.exit(1);
  });
