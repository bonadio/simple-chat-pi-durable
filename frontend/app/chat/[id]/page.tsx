import { notFound } from "next/navigation";
import { Chat } from "@/components/chat";
import { getMessages } from "@/lib/api";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
	const conversationId = Number((await params).id);
	const messages = Number.isInteger(conversationId) ? await getMessages(conversationId) : undefined;
	if (messages === undefined) notFound();

	// `key` gives every conversation its own chat state when navigating between them.
	return <Chat key={conversationId} conversationId={conversationId} initialMessages={messages} />;
}
