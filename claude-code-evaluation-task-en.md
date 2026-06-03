# Task: Create an Evaluation Pipeline for the Thesis

I need a complete evaluation script for the **Evaluation Chapter** of my thesis. This script should generate real numerical results (precision, recall, accuracy) that will be included in Chapter 7 of the DOCX document.

Read `CLAUDE.md` carefully before starting. All comments must remain in **Greek**, while variables should be in English.

---

## 1. Create the file `backend/src/scripts/evaluate.ts`

### Test Set Structure (30 questions total)

Define a `TEST_SET` array with the following question categories. **Above each question, add a comment indicating which FAQ from `seedKnowledge.ts` the RAG system should ideally retrieve.**

```typescript
type QuestionCategory = "direct" | "paraphrased" | "off-topic" | "cross-lingual";

interface TestQuestion {
  id: string;                    // e.g. "D01", "P05", "O02", "X03"
  category: QuestionCategory;
  question: string;
  language: "el" | "en";
  expectedRelevantFaqIds: string[]; // titles or IDs from seedKnowledge — empty array for off-topic
  shouldFindRelevantDoc: boolean;   // false for off-topic, true for all others
}
```

### Categories

- **10 direct match (D01-D10):** Questions that closely match the FAQs in `seedKnowledge.ts`. Cover all 5 categories (returns, shipping, payments, products, account), 2 questions per category.
- **10 paraphrased (P01-P10):** Same meaning, different wording. Cover all 5 categories, 2 questions per category.
- **5 off-topic (O01-O05):** Unrelated questions. The RAG system should either find nothing or return only results below `MIN_SIMILARITY_SCORE (0.5)`.
- **5 cross-lingual (X01-X05):** English questions that should retrieve Greek FAQs, one per category.

Use realistic customer-style questions and mix formal and casual language.

---

## 2. Add three execution modes

```bash
npx ts-node --transpile-only src/scripts/evaluate.ts --mode=rag-only
npx ts-node --transpile-only src/scripts/evaluate.ts --mode=full-chat
npx ts-node --transpile-only src/scripts/evaluate.ts --mode=baseline
```

### Mode 1: `rag-only`

For each question:
1. Call `ragService.FindRelevantDocs(question)`
2. Log the question, top-3 results (title + similarity score), and whether a relevant document was found
3. Automatically calculate:
   - RAG Precision
   - RAG Recall
   - Off-topic rejection rate
   - Cross-lingual hit rate

A result is considered correct when the top-1 result matches `expectedRelevantFaqIds`.

### Mode 2: `full-chat`

For each question:
1. Call `chatService.ProcessUserMessage(testSessionId, question)`
2. Log the question, full bot response, and RAG documents used
3. Do not calculate accuracy automatically
4. Generate an output file for manual grading

### Mode 3: `baseline`

For each question:
1. Call the AI provider directly using only the system prompt:
   `You are ShopEasy assistant`
2. Do not provide RAG context
3. Log the response

This serves as the baseline comparison without RAG.

---

## 3. Output Files

Create the folder:

`backend/evaluation-results/`

### A) `results-rag-only.json`
Contains:
- Run date
- Metrics
- Per-category metrics
- Per-question results

### B) `results-full-chat.csv`
Columns:

`id, category, question, bot_response, rag_docs_used, my_grade, notes`

### C) `results-baseline.csv`
Same structure as `results-full-chat.csv`.

---

## 4. Add `compare.ts`

Create:

`backend/src/scripts/compare.ts`

The script reads the graded CSV files and calculates:

- Bot accuracy with RAG
- Bot accuracy without RAG
- Hallucination reduction
- Per-category breakdown

Output:

`evaluation-results/comparison-report.md`

with tables ready to copy into the thesis.

---

## 5. Feedback Loop Test

Create:

`feedback-experiment.ts`

### Step 1: Before

Run predefined edge-case questions and save:

`feedback-experiment-before.json`

### Step 2: Inject Correction

Insert feedback documents into MongoDB with:

```json
{
  "rating": -1,
  "correction": "TODO: correct answer",
  "status": "approved",
  "testRun": true
}
```

### Step 3: After

Run the same questions again with a new session ID and generate:

- `feedback-experiment-after.json`
- `feedback-experiment-report.md`

The report should show:

- Original question
- Before answer
- Approved correction
- After answer
- Whether behavior changed

---

## 6. Important Requirements

### Code Style

- Comments in Greek
- File header explaining purpose and dependencies
- Async/await only
- Try/catch around all external calls
- Named constants instead of magic numbers

### Logging

- Progress indication (e.g. Question 5/30)
- Colored summary metrics at the end
- Total execution time

### Constraints

- Do not modify existing services
- Do not expose private methods
- Feedback documents must use `testRun: true`
- Create `cleanup-test-data.ts` to remove test data

### Documentation

Update README.md with:

- How to run the scripts
- Generated outputs
- How to grade CSV files
- How to run `compare.ts`

Update TODO.md:

- Mark `[x] 3.3 Evaluation Setup` if it exists

---

## 7. Deliverables

After completion provide:

1. A list of all created/modified files
2. Example `rag-only` output (mock data)
3. Step-by-step instructions for running the evaluation
4. Estimated execution time for `rag-only` and `full-chat`

---

## Example Style

```typescript
// evaluate.ts
//
// Purpose: Automatic evaluation of the RAG pipeline and chat service
// using a predefined set of 30 test questions.
//
// Produces JSON/CSV files inside evaluation-results/
// used in Chapter 7 (Evaluation) of the thesis.
//
// Depends on: ragService, chatService, embeddingService,
// KnowledgeBase model.
```
