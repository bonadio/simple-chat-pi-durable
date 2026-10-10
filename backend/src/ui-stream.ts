/**
 * Translation between pi-durable and the AI SDK's UI messages, which the frontend's
 * `useChat` understands.
 *
 *   - `ChunkTranslator` turns the live agent events of a run into UI message chunks.
 *   - `entriesToUiMessages()` rebuilds the UI messages of a finished transcript.
 *
 * A pi-durable answer to one user message can be several assistant messages (one before
 * each tool round, one after). The UI shows them as a single assistant message whose
 * parts are the text and the tool calls, in order.
 */
import type { AgentEvent, EntryRecord } from "@earendil-works/pi-durable";
import type { UIMessage, UIMessageChunk } from "ai";

// ---------------------------------------------------------------------------
// Live events → chunks
// ---------------------------------------------------------------------------

export class ChunkTranslator {
	/** Counts assistant messages, so text part ids stay unique across a multi-step answer. */
	private messageNumber = 0;
	/** For the current assistant message: the text already sent, by content index. Present once the part is open. */
	private readonly sentTexts = new Map<number, string>();

	translate(events: readonly AgentEvent[]): UIMessageChunk[] {
		return events.flatMap((event) => this.translateEvent(event));
	}

	private translateEvent(event: AgentEvent): UIMessageChunk[] {
		switch (event.type) {
			case "message_start":
				if (event.message.role !== "assistant") return [];
				this.messageNumber += 1;
				this.sentTexts.clear();
				// The message may already hold the first part of its text when the event is delivered.
				return [{ type: "start-step" }, ...this.syncTexts(event.message.content)];

			case "message_update":
				return event.changes.flatMap((change) => this.translateChange(change));

			case "message_end": {
				const message = event.entry.model?.[0];
				if (message?.role !== "assistant") return [];
				// The finished message is the source of truth: send whatever the updates did not carry.
				return [...this.syncTexts(message.content), ...this.closeTexts(), { type: "finish-step" }];
			}

			case "tool_execution_start":
				return [
					{ type: "tool-input-available", toolCallId: event.toolCallId, toolName: event.toolName, input: event.args },
				];

			case "tool_execution_end":
				return [toolOutputChunk(event.toolCallId, event.entry)];

			case "auto_retry_start":
				return [{ type: "data-status", data: { retrying: true, reason: event.errorMessage }, transient: true }];

			default:
				return [];
		}
	}

	private translateChange(change: Extract<AgentEvent, { type: "message_update" }>["changes"][number]): UIMessageChunk[] {
		switch (change.type) {
			case "text_start":
				return change.block.type === "text" ? this.syncText(change.contentIndex, change.block.text) : [];

			case "text_delta":
				return this.appendText(change.contentIndex, change.delta);

			// A whole block replaces what was sent before (providers that do not stream deltas, or a coalesced update).
			case "block":
				return change.block.type === "text" ? this.syncText(change.contentIndex, change.block.text) : [];

			// A snapshot of the whole in-flight message, sent when updates were coalesced.
			case "message":
				return this.syncTexts(change.message.content);

			default:
				return [];
		}
	}

	/** Send `delta` on the text part, opening it on first use. Empty text never opens a part. */
	private appendText(contentIndex: number, delta: string): UIMessageChunk[] {
		const id = this.textId(contentIndex);
		const sent = this.sentTexts.get(contentIndex);
		if (delta === "") return [];

		this.sentTexts.set(contentIndex, (sent ?? "") + delta);
		return sent === undefined
			? [
					{ type: "text-start", id },
					{ type: "text-delta", id, delta },
				]
			: [{ type: "text-delta", id, delta }];
	}

	private syncTexts(content: string | readonly { type: string; text?: string }[]): UIMessageChunk[] {
		if (typeof content === "string") return [];
		return content.flatMap((block, contentIndex) =>
			block.type === "text" && block.text !== undefined ? this.syncText(contentIndex, block.text) : [],
		);
	}

	/** Make the part's text equal `fullText` by sending only what has not been sent yet. */
	private syncText(contentIndex: number, fullText: string): UIMessageChunk[] {
		const sent = this.sentTexts.get(contentIndex) ?? "";
		return fullText.startsWith(sent) ? this.appendText(contentIndex, fullText.slice(sent.length)) : [];
	}

	private closeTexts(): UIMessageChunk[] {
		const chunks = [...this.sentTexts.keys()].map((contentIndex): UIMessageChunk => ({
			type: "text-end",
			id: this.textId(contentIndex),
		}));
		this.sentTexts.clear();
		return chunks;
	}

	private textId(contentIndex: number): string {
		return `text-${this.messageNumber}-${contentIndex}`;
	}
}

function toolOutputChunk(toolCallId: string, entry: EntryRecord | undefined): UIMessageChunk {
	const result = entry?.model?.[0];
	if (result?.role !== "toolResult") {
		return { type: "tool-output-error", toolCallId, errorText: "The tool did not return a result." };
	}
	const text = joinText(result.content);
	return result.isError
		? { type: "tool-output-error", toolCallId, errorText: text }
		: { type: "tool-output-available", toolCallId, output: parseJsonOrText(text) };
}

// ---------------------------------------------------------------------------
// Stored transcript → UI messages
// ---------------------------------------------------------------------------

type UiPart = UIMessage["parts"][number];

const USER_ENTRY = "pi.user";
const ASSISTANT_ENTRY = "pi.assistant";
const TOOL_RESULT_ENTRY = "pi.tool-result";

/** Rebuild the chat as the frontend shows it, from a conversation's entries in order. */
export function entriesToUiMessages(entries: readonly EntryRecord[]): UIMessage[] {
	const messages: UIMessage[] = [];
	let assistant: UIMessage | undefined;

	for (const entry of entries) {
		const message = entry.model?.[0];
		if (message === undefined) continue;

		if (entry.kind === USER_ENTRY && message.role === "user") {
			assistant = undefined;
			const text = typeof message.content === "string" ? message.content : joinText(message.content);
			messages.push({ id: String(entry.id), role: "user", parts: [{ type: "text", text }] });
		} else if (entry.kind === ASSISTANT_ENTRY && message.role === "assistant") {
			const current: UIMessage = assistant ?? { id: String(entry.id), role: "assistant", parts: [] };
			if (assistant === undefined) messages.push(current);
			assistant = current;
			current.parts.push(...assistantParts(message.content));
		} else if (entry.kind === TOOL_RESULT_ENTRY && message.role === "toolResult") {
			const part = assistant?.parts.find((candidate) => "toolCallId" in candidate && candidate.toolCallId === message.toolCallId);
			if (part !== undefined) completeToolPart(part, message.isError, joinText(message.content));
		}
	}

	// A failed attempt stores an assistant entry with no text and no tool calls.
	return messages.filter((message) => message.parts.length > 0);
}

function assistantParts(content: readonly { type: string; [key: string]: any }[]): UiPart[] {
	const parts: UiPart[] = [];
	for (const block of content) {
		if (block.type === "text" && block.text !== "") {
			parts.push({ type: "text", text: block.text, state: "done" });
		} else if (block.type === "toolCall") {
			parts.push({
				type: `tool-${block.name}`,
				toolCallId: block.id,
				state: "input-available",
				input: block.arguments,
			} as UiPart);
		}
	}
	return parts;
}

function completeToolPart(part: UiPart, isError: boolean, text: string): void {
	const toolPart = part as Record<string, unknown>;
	if (isError) {
		toolPart.state = "output-error";
		toolPart.errorText = text;
	} else {
		toolPart.state = "output-available";
		toolPart.output = parseJsonOrText(text);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function joinText(content: readonly { type: string; text?: string }[]): string {
	return content.flatMap((block) => (block.type === "text" ? [block.text ?? ""] : [])).join("");
}

/** Tools answer with JSON text; the UI is easier to write against the parsed value. */
function parseJsonOrText(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
