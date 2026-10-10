import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "Pi",
	description: "Chat with Pi, a pi-durable agent",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={cn("font-sans", geist.variable)}>
			<body>
				<TooltipProvider>
					<SidebarProvider>
						<AppSidebar />
						<SidebarInset>{children}</SidebarInset>
					</SidebarProvider>
				</TooltipProvider>
			</body>
		</html>
	);
}
