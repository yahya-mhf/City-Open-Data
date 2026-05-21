"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getChatContext, subscribeToChatContext } from "@/lib/chatbot-context";
import { createWebSocket } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface Suggestion {
  suggestions: string[];
}

interface AlertMessage {
  id?: string;
  sensor_id?: string;
  severity?: string;
  message?: string;
}

function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 15);
}

function formatText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const lines = text.split("\n");
  for (let li = 0; li < lines.length; li++) {
    if (li > 0) parts.push(<br key={`br-${li}`} />);
    const line = lines[li];
    const segments = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (seg.startsWith("`") && seg.endsWith("`")) {
        parts.push(
          <code
            key={`c-${li}-${si}`}
            className="bg-gray-100 px-1 rounded text-sm font-mono"
          >
            {seg.slice(1, -1)}
          </code>,
        );
      } else if (seg.startsWith("**") && seg.endsWith("**")) {
        parts.push(
          <strong key={`b-${li}-${si}`} className="font-semibold">
            {seg.slice(2, -2)}
          </strong>,
        );
      } else {
        parts.push(<span key={`t-${li}-${si}`}>{seg}</span>);
      }
    }
  }
  return parts;
}

export default function PulseAIChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ role: string; content: string; id: string }>
  >([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [connected, setConnected] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [hasAlertNotification, setHasAlertNotification] = useState(false);
  const [pendingAlert, setPendingAlert] = useState<AlertMessage | null>(null);
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContextRef = useRef(getChatContext());

  useEffect(() => {
    return subscribeToChatContext(() => {
      chatContextRef.current = getChatContext();
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText, scrollToBottom]);

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("access_token")
      : null;

  const activeAlertCount = messages.filter(
    (m) => m.role === "system" && m.content.startsWith("\u26A0\uFE0F"),
  ).length;
  const statusDot =
    activeAlertCount > 3
      ? "bg-red-500"
      : activeAlertCount > 0
        ? "bg-amber-500"
        : "bg-green-500";

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let backoffRef = 1000;

    const connect = () => {
      try {
        ws = createWebSocket("alerts");
        ws.onopen = () => {
          backoffRef = 1000;
          setConnected(true);
        };
        ws.onclose = () => {
          setConnected(false);
          const delay = Math.min(backoffRef, 30000);
          backoffRef = Math.min(backoffRef * 2, 30000);
          reconnectTimer = setTimeout(connect, delay);
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "alert" || data.message || data.sensor_id) {
              const msg: AlertMessage = {
                id: data.id ?? data.sensor_id,
                sensor_id: data.sensor_id,
                severity: data.severity,
                message: data.message ?? data.data?.message ?? "",
              };
              if (open) {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "system",
                    content: `\u26A0\uFE0F New alert: ${msg.message} in zone ${msg.sensor_id?.slice(0, 8) ?? "unknown"}. Ask me about it.`,
                    id: generateId(),
                  },
                ]);
              } else {
                setHasAlertNotification(true);
                setPendingAlert(msg);
              }
            }
          } catch {}
        };
        wsRef.current = ws;
      } catch {}
    };

    backoffRef = 1000;
    connect();
    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, [open]);

  useEffect(() => {
    if (open && pendingAlert) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `\u26A0\uFE0F New alert: ${pendingAlert.message} in zone ${pendingAlert.sensor_id?.slice(0, 8) ?? "unknown"}. Ask me about it.`,
          id: generateId(),
        },
      ]);
      setPendingAlert(null);
      setHasAlertNotification(false);
      setUnreadAlerts(0);
    }
  }, [open, pendingAlert]);

  useEffect(() => {
    if (!open || !token || messages.length > 0) return;
    const page = encodeURIComponent(pathname);
    fetch(`${API_URL}/chatbot/suggestions?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: Suggestion) => setSuggestions(data.suggestions.slice(0, 3)))
      .catch(() => {});
  }, [open, token, pathname, messages.length]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming || !token) return;
      setError("");
      setSuggestions([]);
      const userMsg = { role: "user", content: text.trim(), id: generateId() };
      const convId = conversationId || generateId();
      if (!conversationId) setConversationId(convId);
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setStreaming(true);
      setStreamText("");

      const ctx = chatContextRef.current;
      const body = {
        message: text.trim(),
        conversation_id: convId,
        context: {
          current_page: pathname,
          current_metric: pathname.startsWith("/maps/")
            ? pathname.split("/maps/")[1] || null
            : null,
          map_bounds: ctx.map_bounds,
          visible_sensors: ctx.visible_sensors,
        },
      };

      try {
        const res = await fetch(`${API_URL}/chatbot/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error("API error");
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader");
        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.delta) {
                  full += parsed.delta;
                  setStreamText(full);
                }
              } catch {}
            }
          }
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: full, id: generateId() },
        ]);
        setStreamText("");
      } catch {
        setError(
          "I'm having trouble accessing city data right now. Try again in a moment.",
        );
      }
      setStreaming(false);
    },
    [streaming, token, conversationId, pathname],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const newConversation = () => {
    setMessages([]);
    setConversationId("");
    setStreamText("");
    setStreaming(false);
    setSuggestions([]);
    setError("");
  };

  const handleSuggestionClick = (text: string) => {
    sendMessage(text);
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-all"
      >
        <span className="text-lg">🏙️</span>
        <span className="font-medium text-sm">Pulse AI</span>
        {(hasAlertNotification || unreadAlerts > 0) && !open && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
          <div
            className="fixed inset-0 bg-black/20 pointer-events-auto md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full h-full md:w-[400px] md:h-[600px] md:mr-6 md:mb-6 md:rounded-2xl bg-white shadow-2xl border border-gray-200 flex flex-col pointer-events-auto animate-slide-up overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">🏙️</span>
                <div>
                  <h2 className="font-semibold text-gray-900 text-sm">
                    Pulse AI
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-2 h-2 rounded-full ${statusDot}`}
                    />
                    <span className="text-xs text-gray-500">
                      {connected ? "Connected" : "Reconnecting..."}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={newConversation}
                  className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1 rounded-md hover:bg-primary-50 font-medium"
                >
                  + New
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 && !streaming && (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                  <span className="text-4xl mb-3">🏙️</span>
                  <p className="text-sm font-medium text-gray-500">
                    Ask me about city conditions
                  </p>
                  <p className="text-xs mt-1">
                    Sensors, alerts, reports, and more
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.role === "user";
                const isSystem = msg.role === "system";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-sm shrink-0 mr-2 mt-0.5">
                        🏙️
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                        isUser
                          ? "bg-primary-600 text-white rounded-br-md"
                          : isSystem
                            ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-md"
                            : "bg-gray-50 text-gray-800 rounded-bl-md"
                      }`}
                    >
                      {formatText(msg.content)}
                    </div>
                  </div>
                );
              })}

              {streaming && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-sm shrink-0 mr-2 mt-0.5">
                    🏙️
                  </div>
                  <div className="max-w-[85%] rounded-xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed bg-gray-50 text-gray-800">
                    {streamText ? (
                      formatText(streamText)
                    ) : (
                      <span className="flex gap-1 items-center h-5">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                      </span>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex justify-center">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 max-w-xs text-center">
                    {error}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {suggestions.length > 0 && !streaming && (
              <div className="px-5 pb-2 flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-gray-200 px-5 py-3 bg-white shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={autoResize}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Pulse AI..."
                  rows={1}
                  disabled={streaming}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed max-h-24"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={streaming || !input.trim()}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed shrink-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                  </svg>
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                Pulse AI may produce inaccurate information
              </p>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
