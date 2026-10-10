/**
 * HTTP entry point. The Next.js frontend calls these routes:
 *
 *   GET    /health
 *   GET    /api/conversations               list the chats shown in the sidebar
 *   POST   /api/conversations               start a new chat
 *   DELETE /api/conversations/:id           remove a chat from the sidebar
 *   GET    /api/conversations/:id/messages  the chat's stored messages
 *   POST   /api/conversations/:id/chat      send a message; the answer streams back
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ConversationId } from "@earendil-works/pi-durable";
import { PiBot } from "./bot.ts";
import { config } from "./config.ts";

const bot = await PiBot.open();
bot.resume();

const app = new Hono();

app.use("*", cors({ origin: allowedOrigin }));

app.get("/health", (c) => c.json({ message: "OK" }));

app.get("/api/conversations", (c) => c.json(bot.listConversations()));

app.post("/api/conversations", async (c) => {
	const conversation = await bot.createConversation();
	return c.json(conversation, 201);
});

app.delete("/api/conversations/:id", async (c) => {
	const conversationId = readConversationId(c.req.param("id"));
	if (conversationId !== undefined) {
		await bot.deleteConversation(conversationId);
	}
	return c.body(null, 204);
});

app.get("/api/conversations/:id/messages", async (c) => {
	const conversationId = readConversationId(c.req.param("id"));
	if (conversationId === undefined || !bot.hasConversation(conversationId)) {
		return c.json({ error: "Conversation not found" }, 404);
	}
	return c.json(await bot.history(conversationId));
});

/**
 * Body sent by the frontend's `useChat`: { message: UIMessage }.
 * Only the new message is sent; the earlier ones are already in the conversation.
 */
app.post("/api/conversations/:id/chat", async (c) => {
	const conversationId = readConversationId(c.req.param("id"));
	if (conversationId === undefined || !bot.hasConversation(conversationId)) {
		return c.json({ error: "Conversation not found" }, 404);
	}

	const body = await c.req.json().catch(() => undefined);
	const message = readChatMessage(body?.message);
	if (message === undefined) {
		return c.json({ error: "message with a non-empty text part is required" }, 400);
	}

	return bot.streamReply(conversationId, message);
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`Pi backend listening on http://localhost:${info.port}`);
});

async function shutdown(): Promise<void> {
	console.log("Shutting down");
	server.close();
	await bot.close();
	process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

/** CORS: the configured frontend origin, or any localhost origin when none is configured. */
function allowedOrigin(origin: string): string | undefined {
	if (origin === "") return undefined; // not a browser request, e.g. the frontend's server-side fetch
	if (config.frontendOrigin !== "") {
		return origin === config.frontendOrigin ? origin : undefined;
	}
	return URL.canParse(origin) && new URL(origin).hostname === "localhost" ? origin : undefined;
}

/** Conversation ids are numbers in pi-durable and in the URL. */
function readConversationId(param: string): ConversationId | undefined {
	const value = Number(param);
	return Number.isInteger(value) ? (value as ConversationId) : undefined;
}

/** The raw JSON body is checked field by field, hence `any`. */
function readChatMessage(message: any): { id: string; text: string } | undefined {
	if (typeof message?.id !== "string" || !Array.isArray(message.parts)) return undefined;

	const text = message.parts
		.flatMap((part: any) => (part?.type === "text" && typeof part.text === "string" ? [part.text] : []))
		.join("")
		.trim();
	return text === "" ? undefined : { id: message.id, text };
}
