"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Bot, X, Send, Loader2, ChevronRight, Sparkles } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolResults?: any[];
  navigation?: string | null;
  timestamp: number;
}

const STORAGE_KEY = "tp-assistant-history";
const MAX_HISTORY = 50;

function loadHistory(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
  } catch {}
}

// Format tool results into readable content
function ToolResultDisplay({ results }: { results: any[] }) {
  if (!results || results.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {results.map((tr, i) => {
        const data = tr.result;
        if (!data) return null;

        // Story list
        if (data.stories && Array.isArray(data.stories)) {
          return (
            <div key={i} className="space-y-1">
              {data.stories.map((s: any, j: number) => (
                <a
                  key={j}
                  href={`/stories/${s.id}`}
                  className="block px-2 py-1.5 rounded bg-surface-300/20 hover:bg-surface-300/40 transition-colors text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      "px-1 py-px rounded text-[9px] font-bold uppercase",
                      s.status === 'BREAKING' ? "text-red-400 bg-red-500/10" :
                      s.status === 'TOP_STORY' ? "text-orange-400 bg-orange-500/10" :
                      s.status === 'DEVELOPING' ? "text-amber-400 bg-amber-500/10" :
                      "text-gray-400 bg-gray-500/10"
                    )}>
                      {s.status}
                    </span>
                    <span className="text-gray-200 truncate flex-1">{s.title}</span>
                    {s.compositeScore !== undefined && (
                      <span className="text-gray-500 text-[10px] tabular-nums">{Math.round(s.compositeScore * 100)}</span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          );
        }

        // Market list
        if (data.markets && Array.isArray(data.markets)) {
          return (
            <div key={i} className="flex flex-wrap gap-1">
              {data.markets.map((m: any, j: number) => (
                <span key={j} className="px-2 py-0.5 rounded bg-surface-300/20 text-[10px] text-gray-300">
                  {m.name}{m.state ? `, ${m.state}` : ""} ({m.sourceCount})
                </span>
              ))}
            </div>
          );
        }

        // Source list
        if (data.sources && Array.isArray(data.sources)) {
          return (
            <div key={i} className="space-y-1">
              {data.sources.slice(0, 10).map((s: any, j: number) => (
                <div key={j} className="flex items-center gap-2 px-2 py-1 rounded bg-surface-300/20 text-xs">
                  <span className={clsx("w-1.5 h-1.5 rounded-full", s.isActive ? "bg-green-500" : "bg-gray-600")} />
                  <span className="text-gray-200 truncate flex-1">{s.name}</span>
                  <span className="text-gray-500">{s.platform}</span>
                </div>
              ))}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Build context from current page state
  const getContext = useCallback(() => {
    const ctx: Record<string, any> = { currentPage: pathname };
    // Extract story ID from URL
    const storyMatch = pathname.match(/\/stories\/([a-zA-Z0-9]+)/);
    if (storyMatch) ctx.activeStoryId = storyMatch[1];
    // Get search params for filter context
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const filters: Record<string, string> = {};
      for (const [k, v] of params.entries()) filters[k] = v;
      if (Object.keys(filters).length > 0) ctx.activeFilters = filters;
      if (filters.markets) ctx.activeMarket = filters.markets;
    }
    return ctx;
  }, [pathname]);

  // Load history on mount
  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input + check proactive alerts when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);

      // Check for proactive alerts (new stories in saved views)
      if (messages.length === 0 || (messages.length > 0 && Date.now() - messages[messages.length - 1].timestamp > 5 * 60 * 1000)) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/v1/assistant/alerts`, {
          headers: getAuthHeaders(),
        })
          .then(r => r.json())
          .then(data => {
            if (data.alerts && data.alerts.length > 0) {
              const alertText = data.alerts.slice(0, 3).map((a: any) =>
                `**${a.viewName}**: ${a.newStoryCount} new ${a.newStoryCount === 1 ? 'story' : 'stories'}${a.topStory ? ` — "${a.topStory.title.substring(0, 60)}..."` : ''}`
              ).join('\n');
              const alertMsg: Message = {
                role: "assistant",
                content: `New stories in your views:\n${alertText}\n\nAsk me about any of these, or try "show me breaking stories".`,
                timestamp: Date.now(),
              };
              setMessages(prev => {
                // Don't duplicate if already shown
                if (prev.some(m => m.content.includes('New stories in your views'))) return prev;
                return [...prev, alertMsg];
              });
            }
          })
          .catch(() => {}); // Silent fail
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut: Cmd+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const requestBody = {
      message: userMessage.content,
      history: updatedMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      context: getContext(),
    };

    // Decide streaming vs non-streaming:
    // Use non-streaming when tool calls are likely (questions about data, admin tasks)
    // Use streaming for conversational/open-ended messages
    const looksLikeToolCall = /\b(show|find|list|get|how many|what|status|breaking|trending|create|add|heal|clear|trigger|navigate)\b/i.test(userMessage.content);
    const useStream = !looksLikeToolCall;

    try {
      if (useStream) {
        // ── SSE Streaming ──
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
        const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
        const res = await fetch(`${apiBase}/api/v1/assistant/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...requestBody, stream: true }),
        });

        if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

        // Create a placeholder assistant message that we'll update as tokens arrive
        const streamMsg: Message = { role: "assistant", content: "", timestamp: Date.now() };
        const streamMessages = [...updatedMessages, streamMsg];
        setMessages(streamMessages);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "token") {
                fullContent += data.content;
                streamMsg.content = fullContent;
                setMessages([...updatedMessages, { ...streamMsg }]);
              } else if (data.type === "error") {
                streamMsg.content = fullContent + `\n\n(Error: ${data.message})`;
                setMessages([...updatedMessages, { ...streamMsg }]);
              }
            } catch { /* skip malformed */ }
          }
        }

        streamMsg.content = fullContent;
        const finalMessages = [...updatedMessages, { ...streamMsg }];
        setMessages(finalMessages);
        saveHistory(finalMessages);
      } else {
        // ── Non-streaming (for tool calls) ──
        const response = await apiFetch<{
          message: string;
          toolResults?: any[];
          navigation?: string | null;
          model?: string;
        }>("/api/v1/assistant/chat", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(requestBody),
        });

        const assistantMessage: Message = {
          role: "assistant",
          content: response.message,
          toolResults: response.toolResults,
          navigation: response.navigation,
          timestamp: Date.now(),
        };

        const finalMessages = [...updatedMessages, assistantMessage];
        setMessages(finalMessages);
        saveHistory(finalMessages);

        // Auto-navigate if the assistant says to
        if (response.navigation) {
          setTimeout(() => router.push(response.navigation!), 1500);
        }
      }
    } catch (err: any) {
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${err.message || "Unknown error"}. Try again or check your connection.`,
        timestamp: Date.now(),
      };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      saveHistory(finalMessages);
    } finally {
      setIsLoading(false);
    }
  }, [input, messages, isLoading, router, getContext]);

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Don't render for unauthenticated users
  if (typeof window !== "undefined" && !isAuthenticated()) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all",
          isOpen
            ? "bg-surface-100 border border-surface-300 text-gray-400 hover:text-white"
            : "bg-accent hover:bg-accent-dim text-white"
        )}
        title="AI Assistant (⌘K)"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </button>

      {/* Chat drawer */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[400px] max-h-[600px] bg-surface-100 border border-surface-300 rounded-xl shadow-2xl flex flex-col animate-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-300/50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-white">TopicPulse AI</span>
              <span className="text-[10px] text-gray-500 bg-surface-300/30 px-1.5 py-0.5 rounded">⌘K</span>
            </div>
            <button onClick={clearHistory} className="text-[10px] text-gray-500 hover:text-gray-300">
              Clear
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[300px] max-h-[440px]">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <Bot className="w-8 h-8 text-gray-600 mx-auto" />
                <p className="text-sm text-gray-500">Ask me anything about your news.</p>
                <div className="space-y-1">
                  {["What's breaking right now?", "Show me Houston stories", "How many sources are active?", "Clear failed ingestion jobs"].map(q => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="block w-full text-left px-3 py-1.5 rounded bg-surface-200/50 hover:bg-surface-300/50 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <ChevronRight className="w-3 h-3 inline mr-1 text-gray-600" />{q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={clsx("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={clsx(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-accent/20 text-white"
                    : "bg-surface-200/50 text-gray-200"
                )}>
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  {msg.toolResults && <ToolResultDisplay results={msg.toolResults} />}
                  {msg.navigation && (
                    <button
                      onClick={() => router.push(msg.navigation!)}
                      className="mt-2 text-xs text-accent hover:underline flex items-center gap-1"
                    >
                      <ChevronRight className="w-3 h-3" /> Go to page
                    </button>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-surface-200/50 rounded-lg px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-surface-300/50 px-3 py-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about stories, sources, markets..."
                className="flex-1 bg-surface-200/50 border border-surface-300/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent/50"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className={clsx(
                  "p-2 rounded-lg transition-colors",
                  input.trim() && !isLoading
                    ? "bg-accent hover:bg-accent-dim text-white"
                    : "bg-surface-300/30 text-gray-600 cursor-not-allowed"
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
