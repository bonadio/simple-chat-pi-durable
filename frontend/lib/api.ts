/**
 * Calls to the Hono backend that runs pi-durable.
 *
 * The chat itself (sending a message and streaming the answer) goes through
 * `useChat` in `components/chat.tsx`; `chatUrl()` gives it the endpoint.
 */
import type { UIMessage } from "ai";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";

export type Conversation = {
	id: number;
	title: string;
	createdAt: string;
};

/** Dispatched on `window` whenever the list of conversations may have changed. */
export const CONVERSATIONS_CHANGED = "conversations:changed";

export function chatUrl(conversationId: number): string {
	return `${BACKEND_URL}/api/conversations/${conversationId}/chat`;
}

export async function listConversations(): Promise<Conversation[]> {
	return request<Conversation[]>("/api/conversations");
}

export async function createConversation(): Promise<Conversation> {
	return request<Conversation>("/api/conversations", { method: "POST" });
}

export async function deleteConversation(conversationId: number): Promise<void> {
	await request(`/api/conversations/${conversationId}`, { method: "DELETE" });
}

/** The stored messages of a conversation, or undefined when it does not exist. */
export async function getMessages(conversationId: number): Promise<UIMessage[] | undefined> {
	const response = await fetch(`${BACKEND_URL}/api/conversations/${conversationId}/messages`, { cache: "no-store" });
	if (response.status === 404) return undefined;
	if (!response.ok) throw new Error(`Backend answered ${response.status}`);
	return response.json();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", ...init });
	if (!response.ok) throw new Error(`Backend answered ${response.status}`);
	return response.status === 204 ? (undefined as T) : response.json();
}
