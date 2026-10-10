# Frontend

Next.js App Router running on vinext (Vite). See the [root README](../README.md).

- `app/` pages: `/` (start a chat) and `/chat/[id]`
- `components/app-sidebar.tsx` the shadcn sidebar listing conversations
- `components/chat.tsx` the chat view (`useChat` + AI Elements)
- `lib/api.ts` calls to the Hono backend
