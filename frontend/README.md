# ShopEasy ChatBot — Frontend

React + TypeScript + Vite frontend for the ShopEasy AI customer support chatbot.

---

## What it does

Provides two pages:

- **`/`** — The chat interface where customers talk to the AI bot
- **`/admin`** — The admin panel where corrections and knowledge base entries are managed

---

## Tech Stack

| Tool | Purpose |
|---|---|
| React 19 | UI components |
| TypeScript | Type safety |
| Vite | Dev server and bundler |
| Tailwind CSS | Styling |
| React Router | Client-side routing |

---

## Project Structure

```
frontend/src/
├── components/
│   ├── ChatWindow.tsx      # Main chat UI — message list, input bar, send button
│   ├── MessageBubble.tsx   # Renders a single message (user or bot)
│   ├── FeedbackButtons.tsx # Thumbs up/down on bot replies
│   └── AdminPage.tsx       # Admin panel — feedback review and corrections
├── services/
│   └── apiService.ts       # All fetch calls to the backend (/api/*)
├── types/
│   └── index.ts            # Shared TypeScript types
├── App.tsx                 # Root component — routing + dark/light theme
└── main.tsx                # React entry point
```

---

## How to Run

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

The frontend proxies `/api/*` requests to the backend at `http://localhost:3000`.
Make sure the backend is running before using the app.

---

## Features

- **Chat interface** — send messages, receive AI responses, conversation history persisted in localStorage and MongoDB
- **Feedback buttons** — thumbs up / thumbs down on every bot reply
- **Dark / light theme** — toggled via a button in the header, persisted in localStorage, defaults to OS preference
- **Admin panel** (`/admin`) — lists all thumbs-down feedback with the triggering question and bad answer; allows submitting a correction that gets injected into the system prompt

---

## API Endpoints Used

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/chat` | Send a message, get a bot reply |
| `POST` | `/api/feedback` | Submit a thumbs up or down vote |
| `GET` | `/api/admin/feedback` | Fetch all negative feedback entries |
| `POST` | `/api/admin/feedback/:id/correct` | Submit a correction for a bad answer |
