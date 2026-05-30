# THESIS CONTEXT — Full Knowledge Document

> **Purpose:** Feed this file to Claude (or any AI) to give complete context about the thesis project — theoretical background, technical implementation, architecture, and all design decisions. Use this as the starting point for any writing session.

---

## 1. THESIS IDENTITY

- **Title (Greek):** Διερεύνηση και Ανάπτυξη AI Chatbot Εξυπηρέτησης Πελατών με RAG και Human-in-the-Loop Feedback Loop
- **Title (English):** Investigation and Development of an AI Customer Support Chatbot with RAG and Human-in-the-Loop Feedback Loop
- **Type:** Undergraduate thesis (πτυχιακή εργασία)
- **Project name:** ShopEasy ChatBot
- **Scenario:** Fictional e-shop called "ShopEasy" — the chatbot handles customer support (returns, shipping, payments, products, account)
- **Language of thesis text:** Greek
- **Code language:** TypeScript/JavaScript, comments in Greek

---

## 2. THESIS STRUCTURE (Chapter Outline)

```
1. Εισαγωγή
2. Θεωρητικό Υπόβαθρο
   2.1 Εξέλιξη των AI συστημάτων στην εξυπηρέτηση πελατών (2021–2025)
   2.2 Τάσεις και προσδοκίες καταναλωτών
   2.3 Τεχνολογικές αρχιτεκτονικές: RAG, Fine-tuning, RLHF
3. Ανάλυση Αγοράς
   3.1 Σύγκριση υπαρχουσών λύσεων (Intercom, Zendesk, Salesforce κ.ά.)
   3.2 Κενά αγοράς και ανάγκη για custom υλοποίηση
4. Σχεδιασμός και Αρχιτεκτονική Συστήματος
   4.1 Επιλογή τεχνολογιών (Node.js, React, MongoDB, Docker)
   4.2 Αφαίρεση παρόχου AI (OpenRouter / OpenAI / Gemini)
   4.3 Δομή backend και frontend
5. Υλοποίηση
   5.1 Chat interface και διαχείριση session
   5.2 Μηχανισμός feedback loop (Human-in-the-Loop)
   5.3 Admin panel και διαχείριση διορθώσεων
   5.4 Σύνδεση με τη φάση Reward Modeling του RLHF
6. Αξιολόγηση και Περιορισμοί
7. Συμπεράσματα και Μελλοντική Εργασία
8. Βιβλιογραφία
```

---

## 3. THEORETICAL BACKGROUND (from pre-thesis research paper)

### 3.1 The Problem Being Solved

The period 2021–2025 marked a fundamental shift in customer service: from rigid rule-based chatbots to AI agents capable of reasoning, memory, and action. Despite rapid adoption (82% of business leaders invested in AI in 2025), only 10% of teams reached a mature integration level. This "deployment gap" is caused by the high complexity and unpredictable cost of enterprise solutions.

Key statistics used in the thesis:
- AI systems reduce operational costs by up to **30%**, automating **70%** of queries
- **80%** of customers are satisfied with AI resolution speed
- Chatbot retail transactions expected to reach **$72 billion by 2028**
- **50%** of consumers feel negatively about over-reliance on AI (fear of losing personal contact)
- **63%** of customers report chatbots failed to solve their problem
- Despite high investment, hallucinations and inability to learn from mistakes remain the top failure points

### 3.2 Market Benchmarking (Chapter 3 content)

| Solution | Key Advantage | Key Limitation | Cost |
|---|---|---|---|
| Intercom Fin | Fast deployment, RAG architecture | Per-resolution pricing ($0.99), closed UI ecosystem | High (Variable) |
| Zendesk AI | Integrated with helpdesk, pre-trained CX models | Limited complex workflow depth | Medium (Add-on) |
| Salesforce Einstein | Deep CRM integration, Agentforce automation | Requires specialized technical staff | Very High |
| Freshdesk Freddy | Predictive ticket routing, mid-market friendly | Limited NLP complexity | Medium |
| Tidio Lyro | Ideal for SMBs, easy setup | Lacks emotional analysis depth and context | Low |

**Core critique of all solutions:** They are "black boxes" — businesses have minimal control over the model's learning process unless they pay for enterprise contracts.

### 3.3 Why This Thesis Exists (Unique Value Proposition)

Three problems the thesis implementation solves that off-the-shelf tools don't:

1. **Transparency and Cost Control:** Unlike Intercom's $0.99/resolution model, using the AI API on our own infrastructure gives full cost control. We also avoid paying for incorrect resolutions.

2. **Custom Feedback Mechanism (Human-in-the-Loop):** Users' corrections are stored in MongoDB and used to dynamically improve prompts (few-shot prompting). In commercial solutions this is locked behind enterprise contracts.

3. **Technical Data Sovereignty:** MongoDB as a unified store for conversations AND vector data (Vector Search) reduces complexity and keeps the business's context under developer control, enabling specialized "Agentic" functions that generic solutions don't support.

### 3.4 Theoretical Framework: RAG, Fine-tuning, RLHF

**RAG (Retrieval-Augmented Generation):**
- Preferred architecture for dynamic data
- Instead of giving the AI the entire knowledge base every time, it finds only the 3 most relevant documents using vector similarity search (cosine similarity)
- Uses vector databases (MongoDB Atlas Vector Search) to find semantically similar content — understands meaning, not just keywords
- Example: "θέλω επιστροφή" matches "πώς επιστρέφω ένα προϊόν" even though the exact words differ

**Fine-tuning:**
- Critical for adopting a specific tone of voice (brand identity)
- More expensive and static than RAG — requires full retraining for knowledge updates
- Not implemented in this thesis; mentioned as future work

**RLHF (Reinforcement Learning from Human Feedback):**
- Critical for model alignment
- The thesis implements a simplified version of the Reward Modeling phase:

| RLHF Phase | Description | This Thesis Implementation |
|---|---|---|
| SFT (Supervised Fine-Tuning) | Train on selected pairs | Initial tone setup (Professional/Friendly via system prompt) |
| Reward Modeling | Human ranking of responses | "Thumbs Up/Down" stored in MongoDB with correction text |
| RL Optimization | Policy optimization | Dynamic system prompt adaptation (golden rules injection) |

The thesis does NOT implement full RL optimization (that would require model retraining). Instead, it simulates the effect at inference time by injecting approved corrections directly into the system prompt as few-shot examples. This achieves similar outcomes for a thesis context without the compute cost.

---

## 4. TECH STACK

| Layer | Technology | Version | Why Chosen |
|---|---|---|---|
| Frontend | React + TypeScript | 18 | Component model, easy to explain, widely understood |
| Frontend styling | Tailwind CSS | v4 | Utility-first, no design system needed |
| Frontend bundler | Vite | — | Fast dev server, simple config |
| Backend | Node.js + Express + TypeScript | 18+ | Lightweight, async-first, easy routing |
| Database | MongoDB + Mongoose | 7 | Flexible schema + native Vector Search on Atlas |
| Vector Search | MongoDB Atlas $vectorSearch | — | Same DB for documents and vectors, no extra service |
| Local Vector Search fallback | MongoDB $text search | — | Works without Atlas, for local development |
| Embeddings | @xenova/transformers (local) | — | No cloud API needed, runs locally, free |
| Embedding model | paraphrase-multilingual-MiniLM-L12-v2 | — | 384 dimensions, 50+ languages (Greek + English cross-lingual) |
| AI Provider (default) | OpenRouter | — | Free tier available, multiple models via single API |
| AI Provider (alt 1) | Google Gemini | — | Free tier, fast |
| AI Provider (alt 2) | OpenAI | — | Most capable, paid |
| Infrastructure | Docker + docker-compose | — | Consistent environment, one-command startup |
| Icons | lucide-react | — | Clean, minimal, tree-shakeable |
| ID generation | uuid (v4) | — | Session and message IDs |

### AI Provider Abstraction
The system uses a factory pattern (`aiProviderFactory.ts`) to swap AI providers via a single environment variable `AI_PROVIDER`. All providers implement the same `AIProvider` interface with a single `GenerateResponse(messages, systemPrompt)` method. This means zero code changes when switching providers.

---

## 5. SYSTEM ARCHITECTURE

### 5.1 Folder Structure

```
shopeasy-chatbot/
├── backend/
│   └── src/
│       ├── config/
│       │   ├── aiProviderFactory.ts   — reads AI_PROVIDER env var, returns correct implementation
│       │   ├── database.ts            — MongoDB connection (Mongoose)
│       │   └── env.ts                 — validates all .env variables at startup
│       ├── middleware/
│       │   └── errorHandler.ts        — centralized Express error handling
│       ├── models/
│       │   ├── Conversation.ts        — schema: sessionId, messages[], timestamps
│       │   ├── Feedback.ts            — schema: messageId, rating, userQuestion, botAnswer, correction, status
│       │   └── KnowledgeBase.ts       — schema: title, content, category, embedding[384], isActive
│       ├── repositories/
│       │   ├── conversationRepository.ts  — GetSessionHistory, SaveMessage
│       │   ├── feedbackRepository.ts      — SaveFeedback, UpdateFeedbackStatus
│       │   ├── knowledgeRepository.ts     — CRUD for knowledge base entries
│       │   └── adminRepository.ts         — GetAdminFeedback, GetFeedbackStats (with aggregation)
│       ├── routes/
│       │   ├── chatRoutes.ts          — POST /api/chat
│       │   ├── feedbackRoutes.ts      — POST /api/feedback
│       │   └── adminRoutes.ts         — GET/PUT /api/admin/feedback, CRUD /api/admin/knowledge
│       ├── scripts/
│       │   └── seedKnowledge.ts       — one-time script to seed 25 FAQs with embeddings
│       ├── services/
│       │   ├── AIProvider.ts          — interface: GenerateResponse(messages, systemPrompt)
│       │   ├── GeminiProvider.ts      — Gemini implementation via @google/generative-ai
│       │   ├── OpenAIProvider.ts      — OpenAI implementation
│       │   ├── OpenRouterProvider.ts  — OpenRouter implementation (uses openai SDK, different base URL)
│       │   ├── chatService.ts         — orchestrates the full chat flow (6 steps)
│       │   ├── ragService.ts          — FindRelevantDocs, BuildRAGContext
│       │   ├── embeddingService.ts    — GetEmbedding, WarmUp (singleton ML model)
│       │   └── feedbackEngine.ts      — GetGoldenRules, GetNegativeExamples, BuildFeedbackPromptSection
│       ├── types/
│       │   └── index.ts               — shared TypeScript interfaces
│       └── server.ts                  — Express entry point
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ChatWindow.tsx         — main chat UI, session management
│       │   ├── MessageBubble.tsx      — single message + feedback buttons
│       │   ├── FeedbackButtons.tsx    — 👍/👎 + correction input
│       │   └── AdminPage.tsx          — full admin panel (login + dashboard + knowledge CRUD)
│       ├── services/
│       │   └── apiService.ts          — all fetch() calls to the backend
│       ├── types/
│       │   └── index.ts               — frontend TypeScript interfaces
│       ├── App.tsx                    — React Router setup (/ and /admin routes)
│       └── main.tsx                   — React entry point
├── docs/
│   └── architecture.md               — (needs updating)
├── docker-compose.yml                 — backend + MongoDB + Mongo Express + model_cache volume
├── README.md
├── CLAUDE.md                          — Claude Code project rules
└── TODO.md                            — implementation checklist
```

### 5.2 MongoDB Collections

**`conversations`**
```json
{
  "sessionId": "uuid-string",
  "messages": [
    {
      "messageId": "uuid-string",
      "role": "user | assistant",
      "content": "string",
      "timestamp": "Date"
    }
  ],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**`feedbacks`**
```json
{
  "messageId": "uuid-string",
  "sessionId": "uuid-string",
  "rating": 1 | -1,
  "userQuestion": "string | null",
  "botAnswer": "string | null",
  "correction": "string | null",
  "status": "pending | approved | rejected",
  "category": "string | null",
  "createdAt": "Date"
}
```

**`knowledgebases`**
```json
{
  "title": "string",
  "content": "string",
  "category": "returns | shipping | payments | products | account",
  "embedding": [/* 384 numbers */],
  "isActive": true,
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

---

## 6. CORE FLOWS (for Chapter 5)

### 6.1 Chat Request Flow (end-to-end)

```
User types message
  → ChatWindow.tsx: optimistic UI update (shows user message immediately)
  → POST /api/chat { sessionId, message }
    → chatRoutes.ts
      → chatService.ProcessUserMessage(sessionId, userMessage)

          Step 1: Load conversation history
            conversationRepository.GetSessionHistory(sessionId)
            → returns [] for new sessions

          Step 2: RAG — find relevant knowledge base documents
            ragService.FindRelevantDocs(userMessage)
              → embeddingService.GetEmbedding(userMessage) → 384-dim vector
              → if Atlas: $vectorSearch aggregation (cosine similarity, MIN_SCORE=0.5, TOP 3)
              → if local: $text search fallback
            → returns up to 3 documents with similarity scores

          Step 3: Build dynamic system prompt
            BuildSystemPrompt(ragContext)
              → base instructions (ShopEasy assistant role)
              → RAG context section (relevant FAQs)
              → feedbackEngine.GetGoldenRules() → approved corrections → "❌ Wrong → ✅ Correct"
              → feedbackEngine.GetNegativeExamples() → pending 👎 → "avoid this type of answer"

          Step 4: Call AI provider
            GetAIProvider().GenerateResponse([...history, userMessage], systemPrompt)

          Step 5: Save to MongoDB
            conversationRepository.SaveMessage(sessionId, userMessage)
            conversationRepository.SaveMessage(sessionId, assistantMessage)

          Step 6: Return
            → { sessionId, reply, messageId }

  → ChatWindow.tsx: appends bot reply, plays notification sound
  → MessageBubble.tsx: renders reply with 👍/👎 buttons
```

### 6.2 Feedback Loop Flow (end-to-end)

```
User clicks 👎 on a bot reply
  → FeedbackButtons.tsx: shows correction text input
    "Ποια θα ήταν η σωστή απάντηση; (προαιρετικό)"
  → User optionally types correction, clicks "Υποβολή"
  → POST /api/feedback { messageId, sessionId, vote: "down", userQuestion, botAnswer, correction? }
    → feedbackRoutes.ts: converts vote → rating (-1), saves to MongoDB
    → Feedback document saved with status: "pending"

Admin visits /admin panel (password: admin/admin for demo)
  → Dashboard tab: sees all pending 👎 entries
    → Each entry shows: user's question, bot's wrong answer, correction field
  → Admin can edit the correction text
  → Admin clicks "Approve"
    → PUT /api/admin/feedback/:messageId { status: "approved", correction }
    → Feedback document: status → "approved"

Next chat request (any user, any session)
  → chatService.BuildSystemPrompt()
    → feedbackEngine.GetGoldenRules() finds this approved feedback
    → Injects into system prompt:
      "ΜΑΘΕ ΑΠΟ ΠΡΟΗΓΟΥΜΕΝΕΣ ΔΙΟΡΘΩΣΕΙΣ:
       Ε: "original question" | ❌ Λάθος: "wrong answer" | ✅ Σωστό: "correct answer""
  → AI now has the correction as a few-shot example
  → Bot gives improved answer without any retraining
```

### 6.3 Knowledge Base Management Flow

```
Admin visits /admin → Knowledge Base tab
  → Sees list of all 25 active FAQ entries (title, category, content preview)
  
  ADD new FAQ:
    → Admin fills in title, content, category
    → POST /api/admin/knowledge
      → embeddingService.GetEmbedding(content) → 384 numbers
      → KnowledgeBase.create({ title, content, category, embedding, isActive: true })
    → New entry immediately searchable by RAG

  EDIT existing FAQ:
    → Inline edit form (title, content, category)
    → PUT /api/admin/knowledge/:id
      → if content changed: re-generates embedding automatically
      → if only title/category changed: no re-embedding needed

  DELETE FAQ:
    → Two-step confirmation (click Delete → click Confirm)
    → Soft delete: isActive → false
    → Entry hidden from RAG but preserved in DB
```

---

## 7. KEY TECHNICAL DECISIONS AND RATIONALE

### Why MongoDB for both documents and vectors?
Single database for conversations, feedback, and knowledge base. No need for a separate vector database service (e.g., Pinecone, Weaviate). MongoDB Atlas provides $vectorSearch natively. For local development, falls back to $text search automatically — zero configuration needed.

### Why local embeddings (@xenova/transformers)?
- No cloud API cost for embedding generation
- No rate limits
- Works offline / in Docker without internet after first download
- The `paraphrase-multilingual-MiniLM-L12-v2` model supports 50+ languages — a Greek question correctly matches a Greek FAQ entry, AND an English question also matches Greek FAQ entries (cross-lingual semantic search)
- Model size: ~250MB, downloaded once, cached in Docker volume

### Why not full RLHF / fine-tuning?
Full RLHF requires: compute resources for training, labeled reward datasets, policy optimization infrastructure. For a thesis project, the Reward Modeling phase is simulated at inference time by injecting golden rules directly into the system prompt (few-shot prompting). This achieves the same behavioral improvement visible to the user, without the infrastructure cost.

### Why is the system prompt dynamic?
The system prompt is rebuilt on every request. It combines:
1. Static base instructions (ShopEasy role, language rule, rules for when knowledge is not found)
2. Dynamic RAG context (3 most relevant FAQs for this specific question)
3. Dynamic feedback section (golden rules + negative examples from the DB)

This means the bot gets smarter after every admin approval, without restart.

### Why AI provider abstraction?
Single interface (`AIProvider.ts`) with `GenerateResponse(messages, systemPrompt)`. All three providers (OpenRouter, Gemini, OpenAI) implement this. Switching is done via `AI_PROVIDER` env var. This demonstrates the "Dependency Inversion" principle and allows the thesis to compare different models without code changes.

### Atlas vs Local MongoDB detection
`ragService.IsAtlas()` checks if `MONGODB_URI` starts with `mongodb+srv://`. If yes: uses `$vectorSearch` (Atlas only). If no: uses `$text` fallback. This is automatic — same codebase runs in both environments.

---

## 8. KNOWLEDGE BASE CONTENT

25 FAQ entries across 5 categories, seeded via `seedKnowledge.ts`:

| Category | Count | Examples |
|---|---|---|
| returns | 5 | Return policy (30 days), Refund timeline (5–7 days), Product exchange, Defective items, Non-returnable products |
| shipping | 5 | Delivery times (3–5 days Greece), Shipping costs (free over €39), Order tracking, Alternative address, Missed delivery |
| payments | 5 | Accepted methods (Visa, PayPal, Apple Pay, etc.), Payment security (SSL/Stripe), Invoice issuance, Billing problems, Discount codes |
| products | 5 | Availability indicators, Size guide, Product authenticity, Product comparison, Reviews policy |
| account | 5 | Account creation, Forgotten password, Change account details, Account deletion, Loyalty program (ShopEasy Rewards) |

All content is in Greek. Embeddings are multilingual (cross-lingual search: English query → Greek FAQ).

---

## 9. ADMIN PANEL DETAILS

**URL:** `/admin`  
**Credentials (demo):** username: `admin`, password: `admin`

**Dashboard Tab:**
- 4 stats cards: Total feedback, Positive %, Negative %, Pending review
- Bar chart (CSS only, no chart library): Positive / Negative / Pending / Approved breakdown
- Feedback list with filter tabs (All / Needs correction / Corrected)
- Each entry expands to show: user question, bot answer (highlighted red), correction textarea, Save button, Approve / Reject buttons
- Optimistic UI: stats update immediately on approve/reject without page reload
- Pagination (20 per page)

**Knowledge Base Tab:**
- Add FAQ form: title + category dropdown + content textarea → generates embedding on backend
- List of all active entries with category color badges
- Inline edit with automatic re-embedding when content changes
- Two-step delete confirmation

**API Endpoints:**
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/feedback` | All negative feedback with context (userQuestion, botAnswer) |
| GET | `/api/admin/feedback/stats` | Stats: total, positivePercent, negativePercent, pending, approved, rejected |
| PUT | `/api/admin/feedback/:messageId` | Approve or reject (+ optional correction update) |
| POST | `/api/admin/feedback/:messageId/correct` | Save correction only (legacy endpoint) |
| GET | `/api/admin/knowledge` | List all active knowledge base entries (no embeddings) |
| POST | `/api/admin/knowledge` | Create entry + auto-generate embedding |
| PUT | `/api/admin/knowledge/:id` | Update entry + re-embed if content changed |
| DELETE | `/api/admin/knowledge/:id` | Soft delete (isActive: false) |

---

## 10. CHAT INTERFACE DETAILS

- Welcome message always shown: "👋 Hi there! I'm your AI support assistant..."
- Session ID generated with `crypto.randomUUID()`, stored in `localStorage`
- Message history stored in `localStorage` (persists across page refresh)
- Typing indicator: three bouncing dots animation while waiting for bot reply
- Notification sound: plays on each bot reply (`/chat-message-sound.mp3`)
- Two-step clear chat: first click shows "Clear?" confirmation, second click wipes history and starts new session
- Error banner: auto-dismisses after 4 seconds
- Enter to send, Shift+Enter for newline
- Light/dark mode toggle (persisted)
- Feedback buttons (👍/👎) appear below every bot message
- On 👎: correction input appears in Greek "Ποια θα ήταν η σωστή απάντηση;"
- The `userQuestion` (the message before the bot reply) is passed to the feedback for admin context

---

## 11. ENVIRONMENT VARIABLES

```env
# Database
MONGODB_URI=          # mongodb://mongo:27017/chatbot (local) or mongodb+srv://... (Atlas)

# AI Provider
AI_PROVIDER=          # "openrouter" | "gemini" | "openai"

# OpenRouter (default)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=     # e.g. meta-llama/llama-3.3-70b-instruct

# Gemini (alternative)
GEMINI_API_KEY=
GEMINI_MODEL=         # e.g. gemini-1.5-flash

# OpenAI (alternative)
OPENAI_API_KEY=
OPENAI_MODEL=         # e.g. gpt-4o-mini

# App
PORT=3000
NODE_ENV=development
ADMIN_PASSWORD=admin  # Note: currently hardcoded in frontend as admin/admin for demo
```

---

## 12. HOW TO RUN (for demos)

```bash
# 1. Copy env
cp .env.example .env
# Fill in API key for your provider

# 2. Start everything (backend + MongoDB + Mongo Express)
docker-compose up

# 3. Start frontend (separate terminal)
npm --prefix frontend install
npm --prefix frontend run dev

# 4. Seed knowledge base (first time only)
docker exec -it <backend_container> npx ts-node --transpile-only src/scripts/seedKnowledge.ts

# 5. Open browser
# Chat: http://localhost:5173
# Admin: http://localhost:5173/admin (admin / admin)
# MongoDB UI: http://localhost:8081 (admin / admin)
```

---

## 13. WHAT IS IMPLEMENTED vs WHAT IS FUTURE WORK

### Implemented ✅
- Full chat interface with session management and localStorage persistence
- RAG with local multilingual embeddings (no cloud API needed)
- MongoDB Atlas vector search with automatic $text fallback for local dev
- Dynamic system prompt (RAG context + feedback injection on every request)
- Human-in-the-Loop feedback loop (👎 → correction → admin approve → golden rule)
- Admin panel: dashboard with approve/reject workflow
- Admin panel: knowledge base CRUD with automatic embedding generation/update
- Swappable AI provider (OpenRouter / Gemini / OpenAI via factory pattern)
- Docker Compose with model cache volume (avoids re-downloading ~250MB on restart)
- 25 FAQ entries seeded in Greek across 5 categories

### NOT Implemented (Future Work / Stretch Goals) ❌
- Evaluation script (no automated accuracy measurement)
- Multimodal support (image analysis via GPT-4 Vision)
- Function calling (checking real order status, initiating returns)
- Long-term memory (OpenAI Threads / persistent cross-session memory)
- Auto-categorization of questions
- Escalation to human agent after N failures
- WebSocket (real-time instead of REST)
- Full RLHF / fine-tuning pipeline
- Message timestamps in the UI
- Production deployment (local/demo only by design)
- Authentication system (hardcoded admin/admin by design — thesis scope)

---

## 14. REFERENCES (from pre-thesis research paper)

1. Implementing AI Chatbots in Customer Service Optimization — MDPI (2025)
2. AI Powered Chatbots for Customer Support — ResearchGate
3. Customer service trends 2025: AI hype vs. customer trust — The Future of Commerce
4. 30+ AI Customer Service Statistics [2025] — YourGPT Blog
5. Vector Databases vs Traditional Databases: When to Use MongoDB — GeeksforGeeks
6. Unveiling Customer Expectations of Chatbot Interactions — Tandfonline
7. RAG vs. fine-tuning — Red Hat
8. 2025 Ultimate Guide to Open-Source RAG Frameworks — Morphik Blog
9. Bridging the Trust Gap: Human + AI Customer Service in 2025 — Netfor
10. The 2025 AI Index Report — Stanford HAI
11. Prompting vs Fine-tuning vs RAG vs RL — sanj.dev
12. Retrieval-Augmented Generation (RAG) with MongoDB Atlas — MongoDB Docs
13. Fine-Tuning + RAG based Chatbot — HuggingFace Discussion
14. MongoDB Extends Search and Vector Search Capabilities — MongoDB Investors
15. Building Intelligent AI Agents with MongoDB Atlas — dev.to/mongodb
16. Function Calling — OpenAI API Docs
17. The AI deployment gap is widening — Intercom Blog (2026)

---

## 15. KEY TERMINOLOGY (Greek ↔ English)

| Greek | English |
|---|---|
| Γνωσιακή βάση | Knowledge base |
| Ανάκτηση Ενισχυμένη Παραγωγή | Retrieval-Augmented Generation (RAG) |
| Ενσωμάτωση / Διάνυσμα | Embedding / Vector |
| Ομοιότητα συνημιτόνου | Cosine similarity |
| Κύκλος ανατροφοδότησης | Feedback loop |
| Χρυσοί κανόνες | Golden rules |
| Αρνητικά παραδείγματα | Negative examples |
| Δυναμικό system prompt | Dynamic system prompt |
| Ελάχιστες προσδοκίες | Few-shot examples |
| Ενίσχυση μάθηση από ανθρώπινη ανατροφοδότηση | Reinforcement Learning from Human Feedback (RLHF) |
| Μοντελοποίηση ανταμοιβής | Reward Modeling |
| Επεξεργασία φυσικής γλώσσας | Natural Language Processing (NLP) |
| Ψευδαισθήσεις | Hallucinations |
| Αφαίρεση παρόχου | Provider abstraction |
| Απαλή διαγραφή | Soft delete |
| Πίνακας διαχείρισης | Admin panel / Dashboard |
| Αποθήκευση session | Session storage |
| Ιστορικό συνομιλίας | Conversation history |