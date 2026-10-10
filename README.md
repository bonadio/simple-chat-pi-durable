# pi-durable chat

A web chat for a [pi-durable](https://earendil.com/posts/pi-durable) agent ("Pi").

- `backend/`: Hono + pi-durable (SQLite storage). Exposes the conversations and streams answers as AI SDK UI messages.
- `frontend/`: Next.js App Router (via vinext) with shadcn sidebar, AI SDK `useChat` and AI Elements.

## Run

```bash
cd backend && cp .env.example .env   # set GEMINI_API_KEY
pnpm install 

cd frontend && pnpm install && pnpm start-all
```

The frontend finds the backend at `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:8787`).

## Adding tools

Define a tool in `backend/src/tools.ts` and add it to `allTools`. The chat shows every tool call as a card.
