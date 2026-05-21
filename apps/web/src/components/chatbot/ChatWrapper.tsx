"use client";

import dynamic from "next/dynamic";

const PulseAIChat = dynamic(() => import("./PulseAIChat"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center p-4"><span className="text-gray-400">Loading chat...</span></div>,
});

export default function ChatWrapper() {
  return <PulseAIChat />;
}
