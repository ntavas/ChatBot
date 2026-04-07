# ShopEasy AI Customer Support Chatbot

An AI-powered customer support chatbot for a fictional e-shop called **ShopEasy**.
Built with Node.js, React, MongoDB, and a swappable AI provider backend (OpenRouter / Gemini / OpenAI).

---

## Features

- **Chat interface** — real-time conversation with a support bot grounded in ShopEasy's knowledge base
- **Conversation history** — sessions persist across page refreshes via localStorage; the full history is stored in MongoDB
- **Thumbs up / down feedback** — users can rate any bot response
- **Feedback loop** — thumbs-down votes are injected into the system prompt as negative examples, steering future responses away from unhelpful patterns
- **Swappable AI provider** — switch between OpenRouter, Gemini, or OpenAI via a single environment variable
- **Local embedding model** — uses `all-MiniLM-L6-v2` (via `@xenova/transformers`) to convert text into 384-dimension vectors locally, with no cloud API required; enables semantic similarity search for the RAG pipeline
- **RAG (Retrieval-Augmented Generation)** — before every reply, the bot converts the user's question into a vector and searches the knowledge base for the 3 most semantically similar entries; only the relevant information is injected into the prompt, keeping answers focused and accurate

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
4. Thumbs-down votes are automatically injected into the system prompt — the bot will avoid similar phrasing in future responses

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
│   ├── routes/          # POST /api/chat, POST /api/feedback
│   ├── services/        # chatService (orchestration), AI provider implementations
│   ├── repositories/    # MongoDB queries (conversations, feedback)
│   └── models/          # Mongoose schemas
├── frontend/src/
│   ├── components/      # ChatWindow, MessageBubble, FeedbackButtons
│   └── services/        # apiService (fetch calls to backend)
└── docker-compose.yml
```

See [`docs/architecture.md`](docs/architecture.md) for the full data flow.
