"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";

export default function BasicChatInterface() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/basic-chat-interface",
    }),
  });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  const isSubmitted = status === "submitted"; // request sent, no tokens yet
  const isStreaming = status === "streaming"; // tokens arriving
  const isBusy = isSubmitted || isStreaming;

  return (
    <div className="flex h-screen flex-col bg-black text-white">
      <style>{`
        @keyframes messageIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .message-enter {
          animation: messageIn 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes orbit {
          0% { transform: rotate(0deg) translateX(7px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(7px) rotate(-360deg); }
        }
        @keyframes orbDrift {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1); }
        }
        .think-orb {
          position: relative;
          width: 22px;
          height: 22px;
        }
        .think-orb span {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 5px;
          height: 5px;
          margin: -2.5px 0 0 -2.5px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #c084fc, #60a5fa);
          animation: orbit 1.1s linear infinite, orbDrift 1.1s ease-in-out infinite;
        }
        .think-orb span:nth-child(1) { animation-delay: 0s, 0s; }
        .think-orb span:nth-child(2) { animation-delay: -0.37s, -0.37s; }
        .think-orb span:nth-child(3) { animation-delay: -0.74s, -0.74s; }

        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .stream-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: #c084fc;
          animation: cursorBlink 0.9s step-start infinite;
        }

        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0); }
          50% { box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15); }
        }
        .input-glow:focus-within {
          animation: glowPulse 2s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .message-enter, .think-orb span, .stream-cursor, .input-glow:focus-within {
            animation: none !important;
          }
        }
      `}</style>

      <header className="border-b border-purple-900/50 bg-linear-to-r from-purple-950 via-black to-blue-950 px-6 py-4">
        <h1 className="bg-linear-to-r from-purple-400 to-blue-400 bg-clip-text text-xl font-bold text-transparent">Basic Chat Interface</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && <p className="mt-10 text-center text-gray-500">Ask me anything to start the conversation.</p>}

          {messages.map((m, idx) => {
            const isLastAssistant = m.role === "assistant" && idx === messages.length - 1;
            const showCursor = isLastAssistant && isStreaming;

            return (
              <div key={m.id} className={`message-enter flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${m.role === "user" ? "bg-linear-to-br from-purple-600 to-blue-600 text-white" : "border border-gray-800 bg-gray-900 text-gray-100"}`}>
                  {m.parts.map((part, i) =>
                    part.type === "text" ? (
                      <span key={i}>
                        {part.text}
                        {showCursor && i === m.parts.length - 1 && <span className="stream-cursor" />}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            );
          })}

          {isSubmitted && (
            <div className="message-enter flex justify-start">
              <div className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-gray-400">
                <div className="think-orb">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="text-sm">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-purple-900/50 bg-black px-6 py-4">
        <div className="input-glow mx-auto flex max-w-2xl gap-2 rounded-full">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." disabled={isBusy} className="flex-1 rounded-full border border-gray-700 bg-gray-900 px-4 py-2 text-white outline-none transition-colors focus:border-purple-500 disabled:opacity-60" />
          <button type="submit" disabled={isBusy || !input.trim()} className="rounded-full bg-linear-to-r from-purple-600 to-blue-600 px-6 py-2 font-medium text-white transition-opacity disabled:opacity-50">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
