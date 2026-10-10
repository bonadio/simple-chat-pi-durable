"use client";

import { MessageSquarePlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { createConversation } from "@/lib/api";

/** What the home page shows: a button that starts a conversation and opens it. */
export function StartChat() {
	const router = useRouter();

	async function start() {
		const conversation = await createConversation();
		router.push(`/chat/${conversation.id}`);
	}

	return (
		<div className="flex h-svh flex-col">
			<header className="flex items-center gap-2 border-b px-4 py-2">
				<SidebarTrigger />
				<h1 className="text-sm font-medium">Pi</h1>
			</header>
			<div className="flex flex-1 flex-col items-center justify-center gap-4">
				<p className="text-muted-foreground">Start a conversation with Pi.</p>
				<Button onClick={start}>
					<MessageSquarePlusIcon />
					New chat
				</Button>
			</div>
		</div>
	);
}
