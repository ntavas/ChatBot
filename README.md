# ShopEasy AI Customer Support Chatbot

An AI-powered customer support chatbot for a fictional e-shop called **ShopEasy**.
Built with Node.js, React, MongoDB, and a swappable AI provider backend (OpenRouter / Gemini / OpenAI).

---

## Features

- **Chat interface** — real-time conversation with a support bot grounded in ShopEasy's knowledge base
- **Conversation history** — sessions persist across page refreshes via localStorage; the full history is stored in MongoDB
- **Thumbs up / down feedback** — users can rate any bot response
- **Feedback loop** — 👎 votes + optional user corrections are saved to MongoDB and reviewed by an admin; approved corrections become golden rules injected into every future system prompt as few-shot examples
- **Swappable AI provider** — switch between OpenRouter, Gemini, or OpenAI via a single environment variable
- **Local multilingual embedding model** — uses `paraphrase-multilingual-MiniLM-L12-v2` (via `@xenova/transformers`) to convert text into 384-dimension vectors locally, with no cloud API required; supports 50+ languages (Greek, English, etc.) with cross-lingual semantic search — e.g. an English question matches a Greek FAQ entry
- **RAG (Retrieval-Augmented Generation)** — before every reply, the bot converts the user's question into a vector and searches the knowledge base for the 3 most semantically similar entries; only the relevant information is injected into the prompt, keeping answers focused and accurate
- **Human-in-the-Loop feedback loop** — when a user clicks 👎 they can optionally type what the correct answer should have been; an admin reviews submissions in the admin panel, approves or rejects them; approved corrections become "golden rules" injected into every future system prompt as few-shot examples
- **Admin panel** (`/admin`) — password-protected dashboard with: feedback stats (total votes, positive/negative %, pending/approved/rejected counts), per-entry approve/reject workflow, and full CRUD for the knowledge base (add, edit, delete FAQs with automatic embedding generation)

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes docker-compose)
- [Node.js 18+](https://nodejs.org/) — only needed to run the frontend dev server

---

## Setup

**1. Clone the repository**
```bash
git clone <repo-url>
cd ChatBot
```

**2. Create your `.env` file**
```bash
cp .env.example .env
```

Open `.env` and fill in your API key for the provider you want to use. The default is OpenRouter:
```
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
```

Get a free OpenRouter key at [openrouter.ai/keys](https://openrouter.ai/keys).

**3. Start the backend and database**
```bash
docker-compose up
```

This starts three services:
| Service | URL |
|---|---|
| Backend API | http://localhost:3000 |
| MongoDB | localhost:27017 |
| Mongo Express (DB UI) | http://localhost:8081 (login: admin / admin) |

**4. Start the frontend**
```bash
npm --prefix frontend install   # first time only
npm --prefix frontend run dev
```

Open **http://localhost:5173** in your browser.

---

## How to Use

1. Type a message and press **Enter** (or click Send)
2. The bot answers based on ShopEasy's knowledge base only
3. Click 👍 or 👎 on any bot reply to submit feedback
4. On 👎, an optional input appears — type what the correct answer should have been
5. Thumbs-down votes (and corrections) are reviewed by an admin at `/admin`

### Admin Panel

Navigate to **http://localhost:5173/admin** and log in with the password set in `ADMIN_PASSWORD` (default: `admin`).

**Dashboard tab:**
- Stats cards: total votes, positive %, negative %, pending corrections
- Bar chart: visual breakdown of positive / negative / pending / approved
- Feedback list: every 👎 with the user's question, the bot's wrong answer, and a correction field; Approve / Reject buttons

**Knowledge Base tab:**
- View all active FAQ entries (title, category, content)
- Add new entries — embedding is generated automatically
- Edit entries inline — embedding is regenerated only when content changes
- Delete entries (soft delete — entry is hidden from RAG but not erased)

### Admin API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/feedback` | List all negative feedback entries with context |
| GET | `/api/admin/feedback/stats` | Stats: totals, percentages, status breakdown |
| PUT | `/api/admin/feedback/:messageId` | Approve or reject a correction |
| POST | `/api/admin/feedback/:messageId/correct` | Save a correction (legacy) |
| GET | `/api/admin/knowledge` | List all active knowledge base entries |
| POST | `/api/admin/knowledge` | Create a new entry (auto-generates embedding) |
| PUT | `/api/admin/knowledge/:id` | Update an entry (re-embeds if content changed) |
| DELETE | `/api/admin/knowledge/:id` | Soft-delete an entry (`isActive: false`) |

---

## Switching AI Provider

Change `AI_PROVIDER` in `.env` and restart the backend:

| Value | Model env var | Where to get a key |
|---|---|---|
| `openrouter` | `OPENROUTER_MODEL` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `gemini` | `GEMINI_MODEL` | [aistudio.google.com](https://aistudio.google.com) |
| `openai` | `OPENAI_MODEL` | [platform.openai.com](https://platform.openai.com) |

```bash
docker-compose restart backend
```

---

## Project Structure

```
/
├── backend/src/
│   ├── config/          # env validation, DB connection, AI provider factory
│   ├── routes/          # POST /api/chat, POST /api/feedback, /api/admin/*
│   ├── services/        # chatService, ragService, embeddingService, feedbackEngine
│   ├── repositories/    # MongoDB queries (conversations, feedback, knowledge)
│   └── models/          # Mongoose schemas
├── frontend/src/
│   ├── components/      # ChatWindow, MessageBubble, FeedbackButtons
│   └── services/        # apiService (fetch calls to backend)
└── docker-compose.yml
```

See [`docs/architecture.md`](docs/architecture.md) for the full data flow.
