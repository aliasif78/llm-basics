"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export default function BasicChatInterface() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/basic-chat-interface",
    }),
  });
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-screen flex-col bg-black text-white">
      <header className="border-b border-purple-900/50 bg-linear-to-r from-purple-950 via-black to-blue-950 px-6 py-4">
        <h1 className="bg-linear-to-r from-purple-400 to-blue-400 bg-clip-text text-xl font-bold text-transparent">Basic Chat Interface</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && <p className="mt-10 text-center text-gray-500">Ask me anything to start the conversation.</p>}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${m.role === "user" ? "bg-linear-to-br from-purple-600 to-blue-600 text-white" : "border border-gray-800 bg-gray-900 text-gray-100"}`}>{m.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}</div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2 text-gray-400">Thinking...</div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-purple-900/50 bg-black px-6 py-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." className="flex-1 rounded-full border border-gray-700 bg-gray-900 px-4 py-2 text-white outline-none focus:border-purple-500" />
          <button type="submit" disabled={isLoading} className="rounded-full bg-linear-to-r from-purple-600 to-blue-600 px-6 py-2 font-medium text-white disabled:opacity-50">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
