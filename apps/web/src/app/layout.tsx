import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import SeismicAlertWrapper from "@/components/SeismicAlertWrapper";
import ChatWrapper from "@/components/chatbot/ChatWrapper";

export const metadata: Metadata = {
  title: "Urban Pulse",
  description: "Urban Pulse — City Intelligence Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 dark:bg-night-primary dark:text-gray-100">
        <ThemeProvider>
          {children}
          <SeismicAlertWrapper />
          <ChatWrapper />
        </ThemeProvider>
      </body>
    </html>
  );
}
