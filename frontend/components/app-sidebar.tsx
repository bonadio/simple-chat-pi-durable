"use client";

import { MessageSquareIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import {
	type Conversation,
	CONVERSATIONS_CHANGED,
	createConversation,
	deleteConversation,
	listConversations,
} from "@/lib/api";

export function AppSidebar() {
	const router = useRouter();
	const pathname = usePathname();
	const [conversations, setConversations] = useState<Conversation[]>([]);

	const refresh = useCallback(async () => {
		try {
			setConversations(await listConversations());
		} catch (error) {
			console.error("Could not load conversations", error);
		}
	}, []);

	// Reload on navigation, and when a chat tells us its title changed.
	useEffect(() => {
		void refresh();
	}, [refresh, pathname]);

	useEffect(() => {
		window.addEventListener(CONVERSATIONS_CHANGED, refresh);
		return () => window.removeEventListener(CONVERSATIONS_CHANGED, refresh);
	}, [refresh]);

	async function startNewChat() {
		const conversation = await createConversation();
		await refresh();
		router.push(`/chat/${conversation.id}`);
	}

	async function remove(conversation: Conversation) {
		await deleteConversation(conversation.id);
		await refresh();
		if (pathname === `/chat/${conversation.id}`) router.push("/");
	}

	return (
		<Sidebar>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton onClick={startNewChat} className="font-medium">
							<PlusIcon />
							New chat
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Chats</SidebarGroupLabel>
					<SidebarMenu>
						{conversations.map((conversation) => (
							<SidebarMenuItem key={conversation.id}>
								<SidebarMenuButton
									render={<Link href={`/chat/${conversation.id}`} />}
									isActive={pathname === `/chat/${conversation.id}`}
								>
									<MessageSquareIcon />
									<span>{conversation.title}</span>
								</SidebarMenuButton>

								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<SidebarMenuAction showOnHover>
												<MoreHorizontalIcon />
												<span className="sr-only">Chat options</span>
											</SidebarMenuAction>
										}
									/>
									<DropdownMenuContent side="right" align="start">
										<DropdownMenuItem onClick={() => remove(conversation)}>
											<Trash2Icon />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
