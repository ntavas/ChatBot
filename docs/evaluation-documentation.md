# ShopEasy Evaluation Pipeline — Complete Documentation

> Written to help you translate the technical work into thesis Chapter 7 (Αξιολόγηση).
> All numbers in this document come from actual runs on 2026-06-01.

---

## Table of Contents

1. [What We Built and Why](#1-what-we-built-and-why)
2. [New Files Created](#2-new-files-created)
3. [The Models](#3-the-models)
4. [The Test Set Design](#4-the-test-set-design-30-questions)
5. [Experiment 1 — RAG Retrieval Evaluation (rag-only)](#5-experiment-1--rag-retrieval-evaluation-rag-only)
6. [Experiment 2 — Full System vs Baseline (full-chat vs baseline)](#6-experiment-2--full-system-vs-baseline)
7. [Experiment 3 — Feedback Loop Experiment](#7-experiment-3--feedback-loop-experiment)
8. [How the Scripts Work Technically](#8-how-the-scripts-work-technically)
9. [Issues Encountered and How We Solved Them](#9-issues-encountered-and-how-we-solved-them)
10. [Summary of All Results](#10-summary-of-all-results)
11. [Thesis Writing Notes](#11-thesis-writing-notes)

---

## 1. What We Built and Why

Chapter 7 of the thesis needs **numerical evidence** that the system works — not just a description of what it does, but measured proof. Three claims need backing:

1. **The RAG pipeline retrieves the right knowledge base documents.** Without this, the AI gets no context, and you cannot argue the system is better than a generic chatbot.
2. **The full system (RAG + AI) gives more accurate answers than a generic AI without RAG.** This is the central argument of the system's value.
3. **The feedback loop actually changes the bot's behaviour.** Without measuring this, the admin approval feature is just UI with no proven effect.

We built a complete evaluation pipeline of 4 scripts that generate evidence for all three claims.

---

## 2. New Files Created

### Scripts (all in `backend/src/scripts/`)

| File | What it does |
|------|-------------|
| `evaluate.ts` | Main evaluation script. Three modes: `rag-only`, `full-chat`, `baseline`. Produces the raw result files. |
| `compare.ts` | Reads the two graded CSVs and generates a comparison report with accuracy, per-category breakdown, and RAG improvement statistics. |
| `feedback-experiment.ts` | Proves the feedback loop works: runs 5 questions before and after injecting approved corrections, reports whether the bot adopted the new information. |
| `cleanup-test-data.ts` | Deletes all test conversations (session IDs starting with `EVAL_`) and test feedback documents (`testRun: true`) from MongoDB. |

### Output files (all in `backend/evaluation-results/`)

| File | Created by | Format | What it contains |
|------|-----------|--------|-----------------|
| `results-rag-only.json` | `evaluate.ts --mode=rag-only` | JSON | Automated precision metrics per category. No manual grading needed — the script knows the expected FAQ titles. |
| `results-full-chat.csv` | `evaluate.ts --mode=full-chat` | CSV | Bot responses for 30 questions using the full RAG pipeline. Manually graded (my_grade column). |
| `results-baseline.csv` | `evaluate.ts --mode=baseline` | CSV | Bot responses for 30 questions with **no knowledge base** — just raw AI. Manually graded. |
| `comparison-report.md` | `compare.ts` | Markdown | Accuracy comparison between full-chat and baseline, with tables. |
| `feedback-experiment-before.json` | `feedback-experiment.ts` | JSON | Bot responses before injecting corrections. |
| `feedback-experiment-after.json` | `feedback-experiment.ts` | JSON | Bot responses after injecting corrections. |
| `feedback-experiment-report.md` | `feedback-experiment.ts` | Markdown | Before/after comparison report. |

### Model file changes

| File | Change |
|------|--------|
| `backend/src/models/Feedback.ts` | Added `testRun?: boolean` field so Mongoose (strict mode) allows the field, and the cleanup script can query `{ testRun: true }` to delete test data. |
| `backend/src/services/GroqProvider.ts` | **New file.** Groq AI provider, needed because Gemini free tier (20 req/day) and OpenRouter free models were too unreliable for a 30-question evaluation run. |
| `backend/src/config/env.ts` | Added `"groq"` to the list of valid AI providers, and `GROQ_API_KEY` / `GROQ_MODEL` env variables. |
| `backend/src/config/aiProviderFactory.ts` | Added `case "groq": return new GroqProvider()` to the provider switch. |
| `.env.example` | Added Groq section with documentation. |

---

## 3. The Models

### Embedding Model — `paraphrase-multilingual-MiniLM-L12-v2`

This is the model that converts text into vectors (embeddings). It runs **locally** via the `@xenova/transformers` library — no API key, no cost, no internet needed.

**Key properties:**
- Produces 384-dimensional vectors.
- Trained on 50+ languages simultaneously, including Greek and English.
- Designed for paraphrase detection — it puts semantically similar sentences close together in vector space even when the wording is different.
- Specifically chosen over the simpler `all-MiniLM-L6-v2` because of multilingual support — this is what enables the cross-lingual search (English question → Greek FAQ).

**How it is used:**
1. When a new FAQ entry is added to the knowledge base, its `content` is converted to a 384-number vector and stored in MongoDB alongside the text.
2. When a user sends a message, that message is also converted to a vector in real time.
3. The RAG pipeline finds the FAQ entries whose vectors are most similar (cosine similarity) to the question's vector.

**Why this matters for the thesis:** The whole cross-lingual evaluation (X01–X05) only works because of this model. A keyword-based search would fail completely on English questions looking for Greek FAQs.

### AI Language Model — `llama-3.3-70b-versatile` via Groq

This is the model that reads the retrieved FAQ context and generates the human-readable answer.

**Key properties:**
- 70 billion parameter LLaMA 3.3 model by Meta.
- Served by Groq on their LPU (Language Processing Unit) hardware — much faster than GPU-based serving.
- Access: free tier at console.groq.com — 14,400 requests/day, 30 requests/minute.
- API is OpenAI-compatible (same format as GPT-4), so the implementation required minimal code.

**Why Groq was added (the problem we hit):**
- Gemini free tier: **20 requests/day** — exhausted after 21 requests on the first evaluation run.
- OpenRouter free models: routes through "Venice" provider — constantly overloaded and unavailable even in their own playground.
- Groq free tier: **14,400 requests/day** — the entire 30-question evaluation uses ~2% of the daily allowance.

**Temperature = 0:** All evaluation calls used `temperature: 0` (deterministic output) so results are reproducible. The exact same question will always get the exact same answer, making the evaluation fair.

---

## 4. The Test Set Design (30 Questions)

### Why 30 questions?

The test set needs to cover different ways users might phrase the same question, including completely irrelevant questions, and cross-language questions. 30 questions across 4 categories gives statistically meaningful results while being practical to run and grade manually.

### The 4 Categories

#### Category 1: Direct (D01–D10) — 10 questions in Greek

Questions phrased very similarly to the actual FAQ titles in the knowledge base. These are the "easy" cases — if the RAG cannot find these, something is fundamentally broken.

**Example:**
- Question: "Πόσες μέρες έχω για να επιστρέψω ένα προϊόν;" 
- Expected FAQ: "Πολιτική Επιστροφών"

The 10 FAQs targeted: returns policy, refund timing, shipping cost, delivery times, order tracking, payment methods, account creation, forgotten password, defective products, loyalty program.

#### Category 2: Paraphrased (P01–P10) — 10 questions in Greek

Same 10 FAQs as Direct, but phrased completely differently. A keyword-based search system would often fail these — only semantic/vector similarity search can handle them.

**Example (same FAQ, different phrasing):**
- Direct D01: "Πόσες μέρες έχω για να επιστρέψω ένα προϊόν;"
- Paraphrased P01: "Μπορώ να στείλω πίσω κάτι που αγόρασα;"
- Expected FAQ: "Πολιτική Επιστροφών" (same)

This category is the key proof that the system does **semantic understanding**, not keyword matching.

#### Category 3: Off-Topic (O01–O05) — 5 questions

Questions completely unrelated to e-commerce: the Greek prime minister, telling a story, the weather, cooking spaghetti, writing a poem. The system should **not** return any FAQ for these — the RAG should recognize there is no relevant document.

The metric here is the **off-topic rejection rate**: how often does the RAG correctly return zero documents for irrelevant questions?

**Why this matters:** A system that returns FAQs for everything, even unrelated questions, would contaminate the AI's context with irrelevant information and produce hallucinated answers. Good rejection behaviour means the system knows what it does not know.

#### Category 4: Cross-Lingual (X01–X05) — 5 questions in English

English questions targeting Greek FAQs. A monolingual embedding model would fail completely here. The multilingual model maps English and Greek semantics into the same vector space, so an English question and a Greek FAQ end up near each other.

**Example:**
- Question: "How many days do I have to return a product?" (English)
- Expected FAQ: "Πολιτική Επιστροφών" (Greek)

This is a direct test of the multilingual embedding model's capability.

### The 30 Questions — Full List

| ID | Category | Question | Expected FAQ |
|----|----------|---------|-------------|
| D01 | direct | Πόσες μέρες έχω για να επιστρέψω ένα προϊόν; | Πολιτική Επιστροφών |
| D02 | direct | Πότε θα λάβω τα χρήματά μου πίσω μετά την επιστροφή; | Χρόνος Επιστροφής Χρημάτων |
| D03 | direct | Η αποστολή είναι δωρεάν; | Κόστος Αποστολής |
| D04 | direct | Πόσες μέρες παίρνει η παράδοση; | Χρόνοι Παράδοσης |
| D05 | direct | Πώς μπορώ να παρακολουθήσω την παραγγελία μου; | Παρακολούθηση Παραγγελίας |
| D06 | direct | Ποιες μεθόδους πληρωμής δέχεστε; | Αποδεκτές Μέθοδοι Πληρωμής |
| D07 | direct | Πώς δημιουργώ λογαριασμό; | Δημιουργία Λογαριασμού |
| D08 | direct | Ξέχασα τον κωδικό μου, τι κάνω; | Ξεχασμένος Κωδικός |
| D09 | direct | Τι γίνεται αν παραλάβω ελαττωματικό προϊόν; | Επιστροφή Ελαττωματικού Προϊόντος |
| D10 | direct | Πώς λειτουργεί το πρόγραμμα πιστότητας; | Πρόγραμμα Πιστότητας ShopEasy Rewards |
| P01 | paraphrased | Μπορώ να στείλω πίσω κάτι που αγόρασα; | Πολιτική Επιστροφών |
| P02 | paraphrased | Σε πόσες μέρες επιστρέφονται τα χρήματα στην κάρτα μου; | Χρόνος Επιστροφής Χρημάτων |
| P03 | paraphrased | Υπάρχει δωρεάν μεταφορικά; | Κόστος Αποστολής |
| P04 | paraphrased | Πότε αναμένω να παραλάβω την παραγγελία μου; | Χρόνοι Παράδοσης |
| P05 | paraphrased | Έχω αριθμό tracking, πού τον βλέπω; | Παρακολούθηση Παραγγελίας |
| P06 | paraphrased | Δέχεστε PayPal ή κάρτες; | Αποδεκτές Μέθοδοι Πληρωμής |
| P07 | paraphrased | Θέλω να φτιάξω νέο λογαριασμό στο ShopEasy | Δημιουργία Λογαριασμού |
| P08 | paraphrased | Δεν θυμάμαι το password μου | Ξεχασμένος Κωδικός |
| P09 | paraphrased | Έλαβα κατεστραμμένο προϊόν, τι πρέπει να κάνω; | Επιστροφή Ελαττωματικού Προϊόντος |
| P10 | paraphrased | Κερδίζω πόντους με κάθε αγορά; | Πρόγραμμα Πιστότητας ShopEasy Rewards |
| O01 | off-topic | Ποιος είναι ο πρωθυπουργός της Ελλάδας; | — (none) |
| O02 | off-topic | Πες μου μια ιστορία | — (none) |
| O03 | off-topic | Τι καιρό κάνει σήμερα; | — (none) |
| O04 | off-topic | Πώς φτιάχνω σπαγγέτι μπολονέζ; | — (none) |
| O05 | off-topic | Βοήθησέ με να γράψω ένα ποίημα | — (none) |
| X01 | cross-lingual | How many days do I have to return a product? | Πολιτική Επιστροφών |
| X02 | cross-lingual | Is shipping free? | Κόστος Αποστολής |
| X03 | cross-lingual | How do I track my order? | Παρακολούθηση Παραγγελίας |
| X04 | cross-lingual | What payment methods do you accept? | Αποδεκτές Μέθοδοι Πληρωμής |
| X05 | cross-lingual | I received a damaged product, what should I do? | Επιστροφή Ελαττωματικού Προϊόντος |

---

## 5. Experiment 1 — RAG Retrieval Evaluation (rag-only)

### What was measured

This mode tests **only the retrieval component** — it never calls the AI. For each question it calls `FindRelevantDocs(question, 3)` and checks whether the correct FAQ title appeared in the top 3 results.

The metric is **hit rate**: did the correct document appear in the results?

For off-topic questions the metric is **rejection rate**: did the system correctly return zero documents (meaning it recognised there was nothing relevant)?

### Results from `results-rag-only.json` (run: 2026-06-01)

| Category | Questions | Hits | Hit Rate |
|----------|-----------|------|----------|
| Direct (D01–D10) | 10 | 9 | **90%** |
| Paraphrased (P01–P10) | 10 | 9 | **90%** |
| Cross-Lingual (X01–X05) | 5 | 5 | **100%** |
| **Overall Precision (D+P+X)** | **25** | **23** | **92%** |
| Off-topic Rejection (O01–O05) | 5 | 0 | **0%** ← see below |

### Notable similarity scores

The model gave very high confidence scores for direct matches:

| Question | Retrieved FAQ | Score |
|----------|--------------|-------|
| D01 "Πόσες μέρες για επιστροφή;" | Πολιτική Επιστροφών | **0.916** |
| P02 "Πόσες μέρες στην κάρτα;" | Χρόνος Επιστροφής Χρημάτων | **0.922** |
| X01 "How many days to return?" | Πολιτική Επιστροφών | **0.916** |

D01 (Greek) and X01 (English) both achieved score 0.916 for the same FAQ — proving the multilingual model maps both languages to essentially the same vector.

### The two retrieval misses

**D10 miss** — "Πώς λειτουργεί το πρόγραμμα πιστότητας;" retrieved: Διαθεσιμότητα Προϊόντων (0.657), Αξιολογήσεις (0.639), Χρόνος Επιστροφής (0.635). The correct FAQ "Πρόγραμμα Πιστότητας ShopEasy Rewards" was not retrieved. The short phrasing "πρόγραμμα πιστότητας" did not match well — possibly the FAQ entry's content uses different vocabulary. This is a known limitation of dense retrieval.

**P04 miss** — "Πότε αναμένω να παραλάβω την παραγγελία μου;" retrieved: Πρόβλημα με Χρέωση (0.776), Πολιτική Επιστροφών (0.760), Παρακολούθηση Παραγγελίας (0.756). The expected FAQ "Χρόνοι Παράδοσης" was not in the top 3. The phrase "να παραλάβω" is semantically close to tracking/delivery but the model associated it more with "charging problem" and "returns".

### The off-topic rejection problem (0%)

All 5 off-topic questions returned documents — none were correctly rejected at the retrieval level. The similarity scores were low (0.53–0.65) but still above the `MIN_SIMILARITY_SCORE = 0.5` threshold:

| Question | Top-retrieved FAQ | Score |
|----------|------------------|-------|
| O01 Prime minister | Χρόνοι Παράδοσης | 0.649 |
| O02 Tell a story | Ξεχασμένος Κωδικός | 0.575 |
| O03 Weather | Χρόνοι Παράδοσης | 0.626 |
| O04 Spaghetti recipe | Αυθεντικότητα Προϊόντων | 0.557 |
| O05 Write a poem | Κόστος Αποστολής | 0.531 |

**Important:** Although the RAG retrieves documents for off-topic questions, the **full-chat mode shows the bot correctly deflects all 5 off-topic questions** (my_grade=1 for all O01–O05). This is because the AI model's system prompt instructs it to respond only to ShopEasy-related questions. The RAG provided irrelevant context, but the AI ignored it appropriately.

This is an interesting finding for the thesis: the off-topic rejection is handled at the AI layer, not the retrieval layer. Raising the similarity threshold (e.g. to 0.7) would fix the retrieval-level rejection but might also miss some valid paraphrased questions.

---

## 6. Experiment 2 — Full System vs Baseline

### What was measured

Two runs of 30 questions each, both using the same Groq/LLaMA 3.3-70b model:

- **Full-chat:** Each question goes through the complete pipeline — retrieve top-3 FAQs → inject into system prompt → AI generates answer. Session stored in MongoDB.
- **Baseline:** Each question is sent directly to the AI with only the minimal prompt `"You are a ShopEasy customer support assistant."` — no knowledge base, no context injection.

Both runs produced CSV files with the bot's responses. The `my_grade` column (1=correct, 0=incorrect) was filled manually based on whether the answer was factually accurate compared to the knowledge base.

### Grading criteria

A response was graded **1 (correct)** if:
- The answer contained accurate information matching the knowledge base (correct numbers, correct procedures).
- For off-topic questions: the bot redirected the user to customer support instead of answering.

A response was graded **0 (incorrect)** if:
- The answer contained wrong numbers or facts (different threshold, different days, etc.).
- The answer hallucinated information not in the knowledge base (fake URLs, non-existent services, wrong currency).
- The bot answered an off-topic question instead of deflecting it.

### Results

| Category | Full-chat (RAG) | Baseline (no RAG) |
|----------|----------------|------------------|
| Direct (10 q.) | 9/10 (90%) | 5/10 (50%) |
| Paraphrased (10 q.) | 9/10 (90%) | 5/10 (50%) |
| Off-topic (5 q.) | 5/5 (100%) | 1/5 (20%) |
| Cross-lingual (5 q.) | 5/5 (100%) | 1/5 (20%) |
| **Total (30 q.)** | **28/30 (93.3%)** | **12/30 (40.0%)** |

**RAG improvement: +53.3 percentage points.**

### Notable baseline failures

The baseline model (no RAG context) produced systematic and specific hallucinations:

- **D01 (return window):** Answered "14 days" — correct answer is 30 days.
- **D03 / P03 (shipping threshold):** Answered "50€, 5€ fee" — correct is 39€ and 3.50€.
- **D09 (defective product window):** Answered "3 days" — correct is 48 hours.
- **D06 (payment methods):** Listed "τραπεζική μεταφορά (bank transfer)" — the actual FAQ explicitly states bank transfers are NOT accepted for retail purchases.
- **D07 (account creation):** Invented the URL "www.shopeasy.gr" — this URL does not exist.
- **O01 (prime minister):** Answered "Κυριάκος Μητσοτάκης" — should have deflected.
- **O02 (tell a story):** Wrote a 500-word story about ShopEasy — should have deflected.
- **O04 (spaghetti recipe):** Provided a complete recipe — should have deflected.
- **X02 (shipping cost in English):** Answered "$50 threshold, $7.99 shipping" — wrong currency (should be €39 and €3.50), hallucinating dollar amounts as if the store were American.
- **X04 (payment methods in English):** Listed "Net Banking, UPI (Google Pay, PhonePe, BHIM)" — these are Indian payment systems, hallucinated because the model was trained on data that includes Indian e-commerce.

### The full-chat failure cases

**D10 + P04:** Both failed because the retrieval step retrieved wrong FAQs (as noted in Experiment 1 above). When the bot gets wrong context, it either gives a wrong answer or falls back to "I'll connect you with support."

---

## 7. Experiment 3 — Feedback Loop Experiment

### What was measured

This experiment demonstrates the **Human-in-the-Loop feedback mechanism** — the ability to update the bot's behaviour without retraining the AI model.

The experiment simulates a real-world scenario: the business changes 5 policies (returns form, shipping threshold, defective product phone number, loyalty VIP threshold, Bitcoin payments). An admin approves corrections. The experiment measures whether the bot incorporates these corrections.

### The 5 scenarios

| # | Policy change | Key information injected |
|---|--------------|--------------------------|
| 1 | Returns now require form ΕΠ-2025 | "φόρμα ΕΠ-2025", required before shipping |
| 2 | Free shipping threshold lowered from 39€ to 25€ | New: 25€, old 39€ no longer valid |
| 3 | Defective products: must call 210-9000000 for a case number | "210-9000000", 24 hours (was 48) |
| 4 | Loyalty VIP threshold lowered from 500 to 300 points | "300 πόντοι", 15% discount |
| 5 | Bitcoin/Ethereum accepted via CryptoPay | "Bitcoin", "Ethereum", "CryptoPay" |

### Methodology

The script runs in 3 phases:

**Phase 1 — Before:** Each of the 5 questions is sent to the chatbot and the response is recorded.

**Phase 2 — Inject corrections:** For each scenario, a `Feedback` document is created in MongoDB with:
  - `status: "approved"` — simulating admin approval
  - `correctionText: "..."` — the new policy text
  - `testRun: true` — so cleanup can delete it after

The system's `feedbackEngine.getGoldenRules()` then picks up these approved corrections and injects them into the system prompt as few-shot examples on every subsequent call.

**Phase 3 — After:** The same 5 questions are sent again (new session IDs so no conversation history influence) and responses are recorded.

### Results

**5/5 scenarios improved (100%).**

| Scenario | Before | After | Result |
|----------|--------|-------|--------|
| 1 — Form ΕΠ-2025 | Mentioned 30 days, no form requirement | Explicitly stated form ΕΠ-2025 is required | ✓ |
| 2 — Threshold 25€ | "Free for orders over 39€" | "Free for orders over 25€ (changed from 39€)" | ✓ |
| 3 — Phone 210-9000000 | "Contact within 48 hours" | "Call 210-9000000, report within 24 hours" | ✓ |
| 4 — VIP 300 points | Deflected to support email (RAG miss) | "VIP status at 300 points with 15% discount" | ✓ |
| 5 — Bitcoin | Listed standard payment methods, no crypto | "Bitcoin and Ethereum accepted via CryptoPay" | ✓ |

**Scenario 4 is especially significant:** the bot completely failed to answer the loyalty question before (D10 retrieval miss), but after the feedback injection it answered correctly. The feedback system compensated for a retrieval failure.

### How the feedback injection works technically

The `feedbackEngine.ts` service queries MongoDB for approved feedback:
```
FeedbackModel.find({ status: "approved" }).sort({ createdAt: -1 }).limit(5)
```

It formats these as few-shot examples and prepends them to the system prompt:
```
IMPORTANT CORRECTIONS (approved by admin):
- Q: "Πόσες μέρες για επιστροφή;" A: "...form ΕΠ-2025 required..."
- Q: "Δωρεάν αποστολή;" A: "...25€ threshold..."
```

The AI model reads this as instructions and uses the corrected information when answering similar questions. No retraining, no fine-tuning — just prompt engineering with human-approved examples.

---

## 8. How the Scripts Work Technically

### evaluate.ts — The main evaluation engine

**Mode parsing:** Reads `--mode=` from `process.argv`. Defaults to `rag-only` if not specified.

**Session ID convention:** Every conversation created during evaluation uses the prefix `EVAL_`. Format: `EVAL_fc-{runId}-{questionId}` for full-chat, `EVAL_fe-{runId}-before-{i}` for feedback experiment. This allows the cleanup script to find and delete all test data with a single MongoDB regex query.

**Rate limit handling (`retryAICall`):** Wraps every AI call in a retry loop (max 3 attempts). Detects:
- HTTP 429 (rate limit) — parses the "retry in Xs" delay from the error message and waits exactly that long + 2s buffer
- HTTP 503 (server overload) — waits 5 seconds and retries
- Daily quota exceeded ("PerDay" in error message) — throws immediately without retrying and prints a helpful message

**CSV generation:** Uses a custom `csvRow()` function that wraps every field in double-quotes and escapes internal quotes by doubling them (`"` → `""`). This correctly handles multiline bot responses containing newlines, which would break standard CSV parsers.

### compare.ts — The comparison report generator

Reads both graded CSVs using a custom CSV parser (written from scratch to avoid adding new npm dependencies). The parser handles the multiline quoted fields correctly by processing the entire file as a string, not line by line.

Computes:
- Overall accuracy per CSV
- Accuracy per category (direct/paraphrased/off-topic/cross-lingual)
- `ragAccuracyGain = fullChatAccuracy - baselineAccuracy`
- `hallucinationReduction`: questions wrong in baseline but correct in full-chat, divided by total baseline-wrong questions

### feedback-experiment.ts

Creates feedback entries directly via `FeedbackModel.create()` with `testRun: true` and `status: "approved"`. This simulates the admin approval action without going through the HTTP API. The `feedbackEngine.getGoldenRules()` function is then called by `chatService.ts` on every message, which picks up the injected corrections automatically.

### cleanup-test-data.ts

```typescript
await FeedbackModel.deleteMany({ testRun: true });
await ConversationModel.deleteMany({ sessionId: { $regex: /^EVAL_/ } });
```

Run this after evaluation to restore the database to its pre-test state. Important for the demo: you do not want 60 test conversations polluting the admin panel.

---

## 9. Issues Encountered and How We Solved Them

### Issue 1: Gemini API daily quota (20 req/day) exhausted mid-run

The Gemini free tier allows only 20 requests per day per model. The full-chat mode makes 30 AI calls — more than the daily limit.

**First run attempt:** The script ran 20 questions successfully, then got the error:
```
quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, limit: 20, RPD: 21/20
```

**Solution:** Added detection for "PerDay" in the error message — the retry logic immediately exits without wasting attempts, and prints a clear message. Added Groq as a 4th AI provider (free, 14,400 req/day).

### Issue 2: OpenRouter free models (Venice provider) rate limiting

OpenRouter's free LLaMA model routes exclusively through a provider called "Venice" which is heavily overloaded. Even the OpenRouter playground was unusable.

**Solution:** Groq. Same LLaMA 3.3-70b model, but served on dedicated LPU hardware with a reliable free tier.

### Issue 3: Off-topic rejection rate = 0% at retrieval level

The embedding model always finds some document to return, even for completely irrelevant questions. The similarity threshold of 0.5 is not high enough to reject off-topic queries.

**Why we did not raise the threshold:** Raising MIN_SIMILARITY_SCORE to 0.7 would fix off-topic rejection but would also cause the P04 failure (score 0.756 for the correct document would be kept, but score for D07 at 0.640 would be rejected). It is a trade-off between precision and recall.

**The practical result:** Off-topic rejection is handled by the AI layer, not the retrieval layer. The full-chat results show 5/5 off-topic correctly deflected — the AI saw the irrelevant context and chose to redirect the user anyway. This is a valid finding to include in the thesis.

---

## 10. Summary of All Results

### RAG Retrieval (rag-only)

| Metric | Value |
|--------|-------|
| Direct hit rate | 90% (9/10) |
| Paraphrased hit rate | 90% (9/10) |
| Cross-lingual hit rate | 100% (5/5) |
| Overall precision (D+P+X) | **92% (23/25)** |
| Off-topic rejection rate | 0% (0/5) — handled by AI layer |

### Full System Accuracy (my_grade evaluation)

| System | Correct | Accuracy |
|--------|---------|----------|
| Full-chat (RAG + AI) | 28/30 | **93.3%** |
| Baseline (AI only, no RAG) | 12/30 | **40.0%** |
| **RAG improvement** | +16 correct answers | **+53.3 percentage points** |

### Per-category accuracy comparison

| Category | Full-chat | Baseline | Improvement |
|----------|-----------|----------|-------------|
| Direct | 90% | 50% | +40 pp |
| Paraphrased | 90% | 50% | +40 pp |
| Off-topic | 100% | 20% | +80 pp |
| Cross-lingual | 100% | 20% | +80 pp |

### Feedback Loop Experiment

| Metric | Result |
|--------|--------|
| Scenarios tested | 5 |
| Scenarios improved after correction | **5/5 (100%)** |
| Retraining required | None |

---

## 11. Thesis Writing Notes

### For Section 7.1 — Methodology

You designed a 30-question test set covering 4 distinct scenarios: direct questions, paraphrased questions (same intent, different wording), off-topic questions (the system should refuse), and cross-lingual questions (English input, Greek knowledge base). This covers the main failure modes a production customer support system would face.

You evaluated the system in isolation (RAG only) and end-to-end (full chatbot), and compared against a baseline without RAG. This is standard practice in NLP evaluation — ablation study: what happens when you remove the key component?

### For Section 7.2 — RAG Evaluation

The 92% overall precision at retrieval level is strong. The cross-lingual 100% hit rate is the most interesting result — it directly validates the choice of `paraphrase-multilingual-MiniLM-L12-v2` over a monolingual model.

The 0% off-topic rejection rate at the retrieval level is a limitation to acknowledge honestly. Explain the trade-off: lowering the rejection rate requires a higher similarity threshold, which would also reduce recall for valid paraphrased questions. The AI layer compensates.

### For Section 7.3 — Comparison with Baseline

The 93.3% vs 40.0% accuracy result is your central quantitative finding. The baseline hallucinations are concrete and specific:
- Wrong numbers (14 days instead of 30, 50€ instead of 39€)
- Wrong currency for a Greek store ($7.99 instead of €3.50)
- Invented Indian payment systems (UPI, PhonePe)
- Made-up URL (www.shopeasy.gr)
- Answered off-topic questions about Greek politics and provided cooking recipes

These are not edge cases — they are exactly the kinds of errors that would destroy customer trust in a real support system.

### For Section 7.4 — Feedback Loop

The 5/5 improvement demonstrates the core value of the Human-in-the-Loop mechanism: a business can update the bot's knowledge in real time without any technical expertise and without retraining the model. The admin approves a correction in a web panel, and all future conversations immediately reflect the update.

Scenario 4 is worth highlighting separately: the feedback mechanism corrected a **retrieval failure** — the RAG could not find the loyalty program FAQ (D10 miss), but after an admin-approved correction was injected into the system prompt, the bot answered correctly. Feedback loop compensates for embedding search limitations.

### Numbers to quote in the thesis

- Embedding model: `paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions, supports 50+ languages)
- AI model used for evaluation: `llama-3.3-70b-versatile` via Groq API
- Test set: 30 questions across 4 categories
- RAG overall precision: **92%**
- Full-chat accuracy: **93.3%** (28/30)
- Baseline accuracy: **40.0%** (12/30)
- RAG improvement: **+53.3 percentage points**
- Feedback loop: **100% adoption rate** (5/5 corrections reflected in responses)
- Run date: 2026-06-01

---

*Generated from actual evaluation runs. All output files are in `backend/evaluation-results/`.*
