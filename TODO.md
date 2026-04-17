# ShopEasy ChatBot — TODO

> **Stack:** Node.js · React · MongoDB Atlas (Free M0) · Docker · OpenRouter/Gemini/OpenAI
> **Project:** AI Customer Support Chatbot with RAG and Feedback Loop (Human-in-the-Loop)

---

## 📖 Documentation Rules (Apply to EVERY change)

Every time a step is implemented, **the following must also be done:**

- [ ] **Code comments:** Every function/file must have comments in Greek explaining *what it does* and *why*
  ```js
  // Example of a good comment:
  // getEmbedding: Converts a text string into a numerical vector (embedding).
  // This vector allows the system to find semantically similar texts,
  // e.g. "I want a refund" ≈ "how do I return a product" even if the words differ.
  ```
- [ ] **README.md update:** Update `README.md` with a description of the new feature (1–3 sentences, plain language)
- [ ] **TODO.md update:** Check the corresponding checkbox and add a note if something was done differently from the original plan

---

## ✅ Already Implemented

- [x] Chat interface (React frontend)
- [x] Backend API (Node.js/Express)
- [x] MongoDB connection + Mongoose schemas
- [x] Conversation history (localStorage + MongoDB)
- [x] Swappable AI provider (OpenRouter / Gemini / OpenAI)
- [x] Thumbs up/down feedback on every bot reply
- [x] Basic feedback injection into the system prompt (negative examples)
- [x] Docker Compose (backend + MongoDB + Mongo Express)
- [x] Knowledge base (static system prompt or file)

---

## 🔵 PHASE 1 — Vector RAG with Local Embeddings

> **What is RAG?**
> Instead of the AI "remembering" everything, we give it only the relevant information from the knowledge base each time — like handing it the right book before it answers.

This phase upgrades the chatbot from keyword-based to semantic search.

### 1.1 Setup Local Embeddings

- [x] Install `@xenova/transformers` in the backend
  ```bash
  cd backend && npm install @xenova/transformers
  ```
- [x] Create `backend/src/services/embeddingService.js`
  - [x] Load model `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions, ~250MB, 50+ γλώσσες)
    > Note: Αλλάχτηκε από `all-MiniLM-L6-v2` σε `paraphrase-multilingual-MiniLM-L12-v2` για cross-lingual υποστήριξη — ερωτήσεις στα Ελληνικά και Αγγλικά βρίσκουν τα ίδια FAQs. Τα embeddings ξαναγεννήθηκαν.
  - [x] Singleton pattern — load once at startup, reuse everywhere
  - [x] Function `getEmbedding(text)` → returns `Float32Array` → `Array`
  - [x] Comments explaining: what an embedding is, why 384 numbers, what cosine similarity means
  - [x] Optional: cache embeddings in memory (Map) for repeated queries
  > Note: File is TypeScript (`embeddingService.ts`). Used `new Function('return import(...)')()` trick to avoid TypeScript compiler converting dynamic `import()` to `require()` (which fails for ESM packages in a CommonJS project). Also exports `WarmUp()` for preloading the model at server startup, and `EMBEDDING_DIMENSIONS` constant for reuse in other files.
- [x] Test: run `getEmbedding("test")` and verify it returns an array of 384 numbers
- [x] 📝 Update README.md: "Added local embedding model (paraphrase-multilingual-MiniLM-L12-v2)"

### 1.2 Knowledge Base Collection

- [x] Create Mongoose model `KnowledgeBase` (`backend/src/models/KnowledgeBase.ts`)
  - [x] Comments above every field explaining what it stores and why
  > Note: File is TypeScript. Added a text index on `content`+`title` for the Atlas fallback in 1.6, and a compound index on `category`+`isActive` for admin filtering. Embedding validated to be exactly 384 dimensions at the schema level.
- [x] Seed script: `backend/src/scripts/seedKnowledge.ts`
  - [x] Comment at the top: "This script loads initial knowledge into the database. Run once during setup."
  - [x] Write 15–25 FAQs/entries for ShopEasy across 5 categories (25 total, 5 per category):
    - Returns & Exchanges (returns) — 5 entries
    - Shipping & Delivery (shipping) — 5 entries
    - Payments & Invoicing (payments) — 5 entries
    - Products & Availability (products) — 5 entries
    - Account & Registration (account) — 5 entries
  - [x] For each FAQ: `GetEmbedding(content)` → store together with the embedding
  - [x] Run: `npx ts-node --transpile-only src/scripts/seedKnowledge.ts`
- [x] 📝 Update README.md: instructions for running the seed script

### 1.3 MongoDB Atlas Vector Search Index

- [x] Switch to **MongoDB Atlas Free Tier (M0)** if running local MongoDB
- [x] Create Vector Search Index in the Atlas UI:
  - Collection `knowledgebases` → Atlas Search → Create Search Index → JSON Editor
  - Name: `vector_index`, numDimensions: 384, similarity: cosine
  > Note: Mongoose pluralises the model name to `knowledgebases`, not `knowledge_base` as originally planned.
- [x] Update `.env` with Atlas connection string
- [x] Update `.env.example` with placeholder for Atlas URI
- [x] 📝 Update README.md: steps to set up the Atlas index

### 1.4 RAG Search Service

- [x] Create `backend/src/services/ragService.ts`
  - [x] File comment: "This service is the 'smart search' of the system."
  - [x] Function `FindRelevantDocs(userMessage, limit=3)`:
    1. `GetEmbedding(userMessage)` — convert question to a vector
    2. `$vectorSearch` aggregation pipeline — search for similar documents
    3. Return top-N documents with score (filtered by MIN_SIMILARITY_SCORE = 0.5)
  - [x] Function `BuildRAGContext(docs)` — converts docs into a formatted string for the prompt
  - [x] Comments on every pipeline step explaining what happens
  - [x] Auto-detects Atlas vs local via URI prefix and uses the correct search method
- [x] Test: ask "can I return what I bought?" → should find the returns FAQ (tested in 1.5)
- [x] 📝 Update README.md: plain-language explanation of RAG (1 paragraph)

### 1.5 Integration into chatService

- [x] Modify `backend/src/services/chatService.ts`
  - [x] 6-step flow with comments: history → RAG → build prompt → AI call → save → return
  - [x] Dynamic system prompt: base instructions + RAG context + negative feedback examples
  - [x] Removed hardcoded SHOPEASY_KNOWLEDGE_BASE — replaced entirely with RAG
  - [x] Logs which documents RAG found (title + score) for each request

### 1.6 Fallback: Local MongoDB (without Atlas)

- [x] For development/offline: fallback to MongoDB text search
  - [x] Text index on the `content` field
  - [x] Comment: "If there is no Atlas connection, we use simple keyword search as an alternative"
  - [x] `ragService` checks if Atlas → vectorSearch, otherwise → `$text` search
  > Note: Implemented inside `ragService.ts` via `IsAtlas()` which checks the `MONGODB_URI` prefix. Text index was added to the `KnowledgeBase` schema on `content`+`title` fields.
- [x] 📝 Update README.md: explanation of the difference between Atlas vs local mode

---

## 🟡 PHASE 2 — Feedback Loop & Human-in-the-Loop

> **What is a Feedback Loop?**
> Every time a user says "bad answer" (👎) and provides the correct one, the system saves it. On future questions, it shows those examples to the AI so it avoids the same mistake — without retraining the model.

### 2.1 Enhanced Feedback Schema

- [ ] Update Mongoose model `Feedback` (`backend/src/models/Feedback.js`)
  - [ ] File comment: "Each document here represents a user's rating of a bot response"
  - [ ] Comments on every field:
  ```
  {
    conversationId:  ObjectId,  // which conversation this belongs to
    messageIndex:    Number,    // which message within the conversation
    userQuestion:    String,    // what the user asked
    botAnswer:       String,    // what the bot answered
    rating:          Number,    // +1 (good) or -1 (bad)
    correction:      String,    // (optional) the correct answer from user/admin
    status:          String,    // "pending" = awaiting approval | "approved" | "rejected"
    category:        String,    // question topic (auto or manual)
    createdAt:       Date
  }
  ```
- [ ] 📝 Update TODO.md with any differences from the original schema

### 2.2 Correction Input in the Frontend

- [ ] When the user clicks 👎, show a text input:
  "What would the correct answer have been?" (optional)
- [ ] POST `/api/feedback` sends: `{ messageId, rating, correction? }`
- [ ] Comment on the component: "This input only appears after a negative rating and is optional"

### 2.3 Golden Rules Engine

- [ ] Create `backend/src/services/feedbackEngine.js`
  - [ ] File comment: "This service converts approved feedback into rules that are injected into the system prompt, so the AI learns from its mistakes"
  - [ ] Function `getGoldenRules(limit=5)`:
    - [ ] Comment: "Fetches examples of correct answers that have been approved by an admin"
    - Fetches approved corrections from MongoDB
    - Formats them as few-shot examples
  - [ ] Function `getNegativeExamples(limit=5)`:
    - [ ] Comment: "Fetches examples of bad answers so the AI avoids repeating them"
    - Fetches thumbs-down entries without a correction
  - [ ] Injection into the system prompt:
    ```
    LEARN FROM PREVIOUS CORRECTIONS:
    Q: "how do I make a return?"
    ❌ Wrong: "Send an email to support"
    ✅ Correct: "Account > Orders > Return within 30 days"

    AVOID THIS TYPE OF ANSWER:
    - "I'm not sure, try to..."
    - "As an AI, I cannot..."
    ```
- [ ] 📝 Update README.md: explanation of how the feedback → improvement cycle works

### 2.4 Admin Panel — Backend Routes

- [ ] Comment on the router file: "These endpoints are for administrators only. They allow monitoring and correcting the bot's behaviour."
- [ ] `GET  /api/admin/feedback` — list feedbacks (paginated, filterable by status/rating)
- [ ] `GET  /api/admin/feedback/stats` — statistics: % positive, % negative, top topics
- [ ] `PUT  /api/admin/feedback/:id` — approve/reject correction, edit
- [ ] `GET  /api/admin/knowledge` — list knowledge base entries
- [ ] `POST /api/admin/knowledge` — add new FAQ (auto-generate embedding)
- [ ] `PUT  /api/admin/knowledge/:id` — edit FAQ (re-generate embedding)
- [ ] `DELETE /api/admin/knowledge/:id` — soft delete (isActive: false)
- [ ] 📝 Update README.md: list all admin endpoints with a short description

### 2.5 Admin Panel — Frontend (React)

- [ ] Route `/admin` — protected page (basic auth or simple password for demo)
- [ ] Comment on the component: "This page is accessible only to the administrator. It allows monitoring and improving the bot."
- [ ] **Dashboard tab:**
  - [ ] Cards: Total conversations, Positive %, Negative %, Pending corrections
  - [ ] Bar chart: feedback by category (recharts or chart.js)
  - [ ] List of recent thumbs-down with approve/reject buttons
- [ ] **Knowledge Base tab:**
  - [ ] CRUD table: title, category, content, actions (edit/delete)
  - [ ] Form: add new FAQ
- [ ] **Tone Settings tab** (optional/stretch):
  - [ ] Dropdown: Professional / Friendly / Concise
  - [ ] Dynamically changes the system prompt tone
- [ ] 📝 Update README.md with screenshots and description of the admin panel

---

## 🟢 PHASE 3 — Polish & Final Features

### 3.1 Conversation Features

- [ ] Session management: group messages by session ID
- [ ] "New conversation" button in the frontend
- [ ] Typing indicator (loading animation while waiting for response)
- [ ] Auto-scroll to the last message
- [ ] Timestamp on every message
- [ ] Comments on every component explaining its function

### 3.2 Architecture Documentation

- [ ] Update `docs/architecture.md` with:
  - [ ] Data flow diagram (User → Frontend → Backend → RAG → AI → Response)
  - [ ] MongoDB schema diagrams
  - [ ] Sequence diagram: how a chat request works end-to-end
  - [ ] Component diagram: frontend components
  - [ ] Explanatory text under each diagram (plain language)
- [ ] Screenshots of every page
- [ ] 📝 Update README.md with link to architecture.md

### 3.3 Evaluation Setup

- [ ] Create 20–30 test questions (evaluation dataset):
  - 10 direct (direct match with knowledge base)
  - 10 paraphrased (semantic similarity test)
  - 5–10 off-topic (bot should say "I don't know")
- [ ] Script `backend/src/scripts/evaluate.js`:
  - [ ] File comment: "This script automatically evaluates the chatbot's accuracy. It runs questions with known answers and counts how many were answered correctly."
  - Runs questions automatically
  - Measures: accuracy, relevance score, false positives
  - Comparison: before feedback loop vs after (shows improvement)
- [ ] Results table for the project report

### 3.4 Docker & Local Setup

- [ ] Update `docker-compose.yml`:
  - [ ] Backend: add volume for model cache (`@xenova/transformers` downloads the model)
  - [ ] Environment variables: Atlas URI, AI provider config
  - [ ] Comments next to each service explaining what it does
- [ ] 📝 Full `README.md` refresh:
  - [ ] What the project is (2–3 sentences)
  - [ ] How to set it up (step-by-step, for someone with no experience)
  - [ ] How to run it (`docker compose up`)
  - [ ] Where each important file is located
- [ ] `.env.example` update with comments on every variable

---

## 🔴 STRETCH GOALS (Future Work)

These **do not need to be implemented** — listed as suggestions for future extension:

- [ ] **Multimodal (GPT-4 Vision):** upload a damage photo, AI identifies the problem
- [ ] **Function Calling:** AI calls functions (check order status, initiate return)
- [ ] **Tone Profiles:** multiple brand voices stored in MongoDB
- [ ] **Auto-categorization:** AI automatically categorizes each question
- [ ] **Escalation:** auto-handoff to a human agent after N failures
- [ ] **WebSocket:** real-time chat instead of polling
- [ ] **Multi-language:** Greek + English support

---

## ⚠️ Notes

**Cost = ~€0**
- MongoDB Atlas M0: free (512MB storage, sufficient for this project)
- Embeddings: locally with Transformers.js (free)
- AI Provider: OpenRouter free tier or Gemini free tier

**Atlas vs Local MongoDB:**
- Development: local MongoDB (Docker) with text search fallback
- Demo: Atlas M0 with real vector search
- The code supports both automatically
