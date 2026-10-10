/**
 * The bot: turns chat messages from the web frontend into pi-durable submissions and
 * streams the answer back.
 *
 * Every chat in the sidebar is one pi-durable conversation (see `conversations.ts` for
 * the list). A message is submitted to its conversation as user input. pi-durable stores
 * it before anything else happens, runs the model and the tools, and settles the
 * submission with the answer. While that happens we watch the conversation's agent
 * events and forward them to the browser.
 *
 * If a message arrives while the conversation is still answering an earlier one,
 * pi-durable queues it and answers it right after, so we never run the same
 * conversation twice at the same time.
 *
 * If the process dies mid-answer, the work stays in SQLite. On startup `resume()` lets
 * pi-durable continue it; the browser finds the finished answer when it reloads the chat.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import {
	type Conversation,
	type ConversationId,
	createRegistry,
	type EntryRecord,
	Harness,
	type SubmissionId,
	watchEvents,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { config } from "./config.ts";
import { ConversationIndex, type ConversationSummary } from "./conversations.ts";
import { Pi } from "./pi.ts";
import { ChunkTranslator, entriesToUiMessages } from "./ui-stream.ts";

/** Nothing the bot does is cancelled from outside; shutdown goes through `close()`. */
const context: Context = BACKGROUND_CONTEXT;

const TITLE_MAX_LENGTH = 60;
const ENTRIES_PER_PAGE = 200;

export type ChatMessage = {
	/** Id the browser gave the message. Used as the submission's request id, so a retried request is answered once. */
	id: string;
	text: string;
};

export class PiBot {
	private readonly harness: Harness;
	private readonly index: ConversationIndex;

	private constructor(harness: Harness, index: ConversationIndex) {
		this.harness = harness;
		this.index = index;
	}

	static async open(): Promise<PiBot> {
		const models = createModels();
		models.setProvider(googleProvider());

		const registry = createRegistry();
		registry.install(Pi);

		await mkdir(dirname(config.databaseFile), { recursive: true });
		const storage = await openNodeSqliteStorage(config.databaseFile);
		const harness = await Harness.open(
			storage,
			{
				models,
				registry,
				settings: { retry: { maxRetries: 5 } },
				onReport: (error) => console.error("[pi-durable]", error),
			},
			context,
		);

		const index = await ConversationIndex.open(config.conversationsFile);
		return new PiBot(harness, index);
	}

	async close(): Promise<void> {
		await this.harness.close(context);
	}

	/** Continue the answers that were still running when the previous process stopped. */
	resume(): void {
		this.harness.resume();
	}

	// -------------------------------------------------------------------------
	// Conversations
	// -------------------------------------------------------------------------

	listConversations(): ConversationSummary[] {
		return this.index.list();
	}

	hasConversation(conversationId: ConversationId): boolean {
		return this.index.has(conversationId);
	}

	async createConversation(): Promise<ConversationSummary> {
		const conversation = await this.harness.createConversation(
			{ ownership: { kind: "ownerless" }, agent: { model: config.model } },
			context,
		);
		console.log(`Started conversation ${conversation.id}`);
		return this.index.create(conversation.id);
	}

	/** Remove the chat from the sidebar. pi-durable keeps the conversation in storage. */
	async deleteConversation(conversationId: ConversationId): Promise<void> {
		await this.index.remove(conversationId);
	}

	/** The chat as the frontend shows it. */
	async history(conversationId: ConversationId): Promise<UIMessage[]> {
		const conversation = await this.conversation(conversationId);
		const entries: EntryRecord[] = [];

		let cursor: Awaited<ReturnType<Conversation["entries"]>>["next"];
		do {
			const page = await conversation.entries({}, ENTRIES_PER_PAGE, cursor, context);
			entries.push(...page.items);
			cursor = page.next;
		} while (cursor !== undefined);

		// Pages come newest first; the chat reads oldest first.
		entries.sort((a, b) => a.id - b.id);
		return entriesToUiMessages(entries);
	}

	// -------------------------------------------------------------------------
	// Replies
	// -------------------------------------------------------------------------

	/**
	 * Submit the message and stream the answer as an AI SDK UI message stream.
	 *
	 * The watch is attached before the message is submitted, so no event of the answer
	 * is missed. The stream ends when pi-durable reports the submission as settled; the
	 * events are delivered in order, so everything the answer produced has gone out by then.
	 *
	 * If the browser disconnects, the answer keeps running and is stored; the frontend
	 * shows it when it loads the chat again.
	 */
	async streamReply(conversationId: ConversationId, message: ChatMessage): Promise<Response> {
		const conversation = await this.conversation(conversationId);

		const stream = createUIMessageStream({
			execute: async ({ writer }) => {
				const events = await watchEvents(this.harness, conversation.id, context);
				const translator = new ChunkTranslator();
				let markSettled!: () => void;
				const settled = new Promise<void>((resolve) => {
					markSettled = resolve;
				});
				let submissionId: SubmissionId | undefined;

				events.start(async (batch) => {
					for (const chunk of translator.translate(batch)) {
						writer.write(chunk);
					}
					const submissionSettled = batch.some(
						(event) =>
							event.type === "submission" &&
							event.record.id === submissionId &&
							(event.record.status === "done" || event.record.status === "unanswered"),
					);
					if (submissionSettled) markSettled();
				});

				try {
					const submission = await conversation.submit(
						{ type: "input", content: message.text, requestId: message.id },
						context,
					);
					submissionId = submission.id;

					await this.nameConversationAfter(conversation.id, message.text);

					const record = await submission.wait(context);
					await settled;
					if (record.status === "unanswered") {
						writer.write({ type: "error", errorText: `The message was not answered (${record.reason}).` });
					}
				} finally {
					await events.stop();
				}
			},
			onError: (error) => {
				console.error(`Failed to answer in conversation ${conversationId}`, error);
				return "Something went wrong while answering. Please try again.";
			},
		});

		return createUIMessageStreamResponse({ stream });
	}

	/** The first message becomes the chat's title in the sidebar. */
	private async nameConversationAfter(conversationId: ConversationId, text: string): Promise<void> {
		if (!this.index.isUntitled(conversationId)) return;
		const oneLine = text.replace(/\s+/g, " ").trim();
		const title = oneLine.length > TITLE_MAX_LENGTH ? `${oneLine.slice(0, TITLE_MAX_LENGTH - 1)}…` : oneLine;
		await this.index.title(conversationId, title);
	}

	private async conversation(conversationId: ConversationId): Promise<Conversation> {
		const conversation = await this.harness.conversation(conversationId, context);
		if (conversation === undefined) {
			throw new Error(`Conversation ${conversationId} not found`);
		}
		return conversation;
	}
}
