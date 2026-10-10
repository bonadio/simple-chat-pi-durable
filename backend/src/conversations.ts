/**
 * The conversations listed in the chat sidebar.
 *
 * pi-durable stores every conversation but has no "list conversations" call, so the
 * backend keeps its own index as an append-only JSONL file. Each line is one event:
 *
 *   {"type":"created","conversationId":"...","at":"..."}
 *   {"type":"titled","conversationId":"...","title":"...","at":"..."}
 *   {"type":"deleted","conversationId":"...","at":"..."}
 *
 * On startup the file is replayed in order. Deleted conversations only disappear from
 * the sidebar; they are never removed from the SQLite storage.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ConversationId } from "@earendil-works/pi-durable";

type ConversationEvent =
	| { type: "created"; conversationId: ConversationId; at: string }
	| { type: "titled"; conversationId: ConversationId; title: string; at: string }
	| { type: "deleted"; conversationId: ConversationId; at: string };

export type ConversationSummary = {
	id: ConversationId;
	title: string;
	createdAt: string;
};

const UNTITLED = "New chat";

export class ConversationIndex {
	private readonly file: string;
	private readonly conversations = new Map<ConversationId, ConversationSummary>();

	private constructor(file: string) {
		this.file = file;
	}

	static async open(file: string): Promise<ConversationIndex> {
		const index = new ConversationIndex(file);
		await mkdir(dirname(file), { recursive: true });
		await index.replay();
		return index;
	}

	/** Newest conversation first. */
	list(): ConversationSummary[] {
		return [...this.conversations.values()].reverse();
	}

	has(conversationId: ConversationId): boolean {
		return this.conversations.has(conversationId);
	}

	/** True while the conversation has not been given a title from its first message. */
	isUntitled(conversationId: ConversationId): boolean {
		return this.conversations.get(conversationId)?.title === UNTITLED;
	}

	async create(conversationId: ConversationId): Promise<ConversationSummary> {
		await this.append({ type: "created", conversationId, at: new Date().toISOString() });
		return this.conversations.get(conversationId)!;
	}

	async title(conversationId: ConversationId, title: string): Promise<void> {
		await this.append({ type: "titled", conversationId, title, at: new Date().toISOString() });
	}

	async remove(conversationId: ConversationId): Promise<void> {
		await this.append({ type: "deleted", conversationId, at: new Date().toISOString() });
	}

	private async append(event: ConversationEvent): Promise<void> {
		await appendFile(this.file, `${JSON.stringify(event)}\n`);
		this.apply(event);
	}

	private apply(event: ConversationEvent): void {
		if (event.type === "created") {
			this.conversations.set(event.conversationId, { id: event.conversationId, title: UNTITLED, createdAt: event.at });
		} else if (event.type === "titled") {
			const conversation = this.conversations.get(event.conversationId);
			if (conversation !== undefined) conversation.title = event.title;
		} else {
			this.conversations.delete(event.conversationId);
		}
	}

	private async replay(): Promise<void> {
		let text: string;
		try {
			text = await readFile(this.file, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return; // first run
			throw error;
		}

		for (const line of text.split("\n")) {
			if (line.trim() === "") continue;
			this.apply(JSON.parse(line) as ConversationEvent);
		}
	}
}
