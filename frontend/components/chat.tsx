"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useMemo } from "react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { chatUrl, CONVERSATIONS_CHANGED } from "@/lib/api";

type ChatProps = {
	conversationId: number;
	initialMessages: UIMessage[];
};

export function Chat({ conversationId, initialMessages }: ChatProps) {
	// The backend keeps the history, so each request only carries the newest message.
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: chatUrl(conversationId),
				prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages[messages.length - 1] } }),
			}),
		[conversationId],
	);

	const { messages, sendMessage, status, stop, error } = useChat({
		id: String(conversationId),
		messages: initialMessages,
		transport,
		// The first message gives the chat its title in the sidebar.
		onFinish: () => window.dispatchEvent(new Event(CONVERSATIONS_CHANGED)),
	});

	return (
		<div className="flex h-svh flex-col">
			<header className="flex items-center gap-2 border-b px-4 py-2">
				<SidebarTrigger />
				<h1 className="text-sm font-medium">Pi</h1>
			</header>

			<Conversation className="flex-1">
				<ConversationContent className="mx-auto w-full max-w-3xl">
					{messages.length === 0 ? (
						<ConversationEmptyState title="Ask Pi anything" description="Try: what's the weather in Lisbon?" />
					) : (
						messages.map((message) => <ChatMessage key={message.id} message={message} />)
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="mx-auto w-full max-w-3xl space-y-2 p-4">
				{error && <p className="text-sm text-destructive">{error.message}</p>}
				<PromptInput
					onSubmit={({ text }) => {
						if (text.trim() !== "") void sendMessage({ text });
					}}
				>
					<PromptInputBody>
						<PromptInputTextarea placeholder="Message Pi…" />
					</PromptInputBody>
					<PromptInputFooter>
						<span />
						<PromptInputSubmit status={status} onStop={stop} />
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}

function ChatMessage({ message }: { message: UIMessage }) {
	return (
		<Message from={message.role}>
			<MessageContent>
				{message.parts.map((part, index) => {
					if (part.type === "text") {
						return <MessageResponse key={index}>{part.text}</MessageResponse>;
					}
					if (isToolUIPart(part)) {
						return (
							<Tool key={part.toolCallId}>
								{part.type === "dynamic-tool" ? (
									<ToolHeader type={part.type} state={part.state} toolName={part.toolName} />
								) : (
									<ToolHeader type={part.type} state={part.state} />
								)}
								<ToolContent>
									<ToolInput input={part.input} />
									<ToolOutput output={part.output} errorText={part.errorText} />
								</ToolContent>
							</Tool>
						);
					}
					return null;
				})}
			</MessageContent>
		</Message>
	);
}
