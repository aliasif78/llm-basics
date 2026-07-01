// app/basic-chat-interface/page.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import { Fraunces, JetBrains_Mono } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300"],
  style: ["italic"],
});
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"] });

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ChatInterfaceWithErrorHandling() {
  const { messages, sendMessage, status, error, regenerate, clearError } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat-bot" }),
    onError: (err) => {
      console.error("Chat error:", err);
    },
  });

  const [input, setInput] = useState("");
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [inputFocused, setInputFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, error]);

  // Cursor glow
  useEffect(() => {
    const move = (e: MouseEvent) => {
      setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px";
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = input.trim();
      if (!text || isBusy) return;
      sendMessage({ text });
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  };

  const isSubmitted = status === "submitted";
  const isStreaming = status === "streaming";
  const isErrored = status === "error";
  const isBusy = isSubmitted || isStreaming;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ background: "#080810", color: "#E2E8F0" }}>
      <style>{`
        /* ── Message entrance ── */
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-in { animation: msgIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        /* ── Left border draws down from top ── */
        @keyframes borderDraw {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        .border-draw {
          transform-origin: top center;
          animation: borderDraw 450ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
        }

        /* ── Thinking wave ── */
        @keyframes dotWave {
          0%, 80%, 100% { opacity: 0.12; transform: translateY(0); }
          40%            { opacity: 1;    transform: translateY(-4px); }
        }
        .dot-wave-1 { animation: dotWave 1.3s ease-in-out 0s   infinite; }
        .dot-wave-2 { animation: dotWave 1.3s ease-in-out 0.18s infinite; }
        .dot-wave-3 { animation: dotWave 1.3s ease-in-out 0.36s infinite; }

        /* ── Stream cursor ── */
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .stream-cursor {
          display: inline-block;
          width: 7px;
          height: 0.85em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: #7C3AED;
          border-radius: 1px;
          animation: cursorBlink 0.9s step-start infinite;
        }

        /* ── Input top rule glow ── */
        @keyframes ruleGlow {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 1; }
        }
        .rule-active { animation: ruleGlow 2s ease-in-out infinite; }

        /* ── Grain overlay ── */
        .grain-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          opacity: 0.018;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 200px 200px;
        }

        /* ── Scrollbar ── */
        .messages-scroll::-webkit-scrollbar { width: 3px; }
        .messages-scroll::-webkit-scrollbar-track { background: transparent; }
        .messages-scroll::-webkit-scrollbar-thumb { background: #3A3558; border-radius: 2px; }

        /* ── Placeholder ── */
        textarea::placeholder { color: #4E4870; }

        @media (prefers-reduced-motion: reduce) {
          .msg-in, .border-draw,
          .dot-wave-1, .dot-wave-2, .dot-wave-3,
          .stream-cursor, .rule-active { animation: none !important; }
        }
      `}</style>

      {/* ── Cursor glow ── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `radial-gradient(ellipse 55% 45% at ${mouse.x * 100}% ${mouse.y * 100}%, rgba(124,58,237,0.12) 0%, transparent 70%)`,
          transition: "background 80ms linear",
        }}
      />

      {/* ── Film grain ── */}
      <div aria-hidden className="grain-overlay" />

      {/* ── Header ── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isBusy ? "#7C3AED" : isErrored ? "#EF4444" : "#7C3AED",
              boxShadow: isBusy ? "0 0 0 3px rgba(124,58,237,0.2), 0 0 8px #7C3AED" : isErrored ? "0 0 8px #EF4444" : "0 0 6px rgba(124,58,237,0.5)",
              transition: "box-shadow 400ms, background 400ms",
            }}
          />
          <span className={mono.className} style={{ fontSize: 10.5, letterSpacing: "0.22em", color: "#7A7298" }}>
            CHAT · 01
          </span>
        </div>
        <span className={mono.className} style={{ fontSize: 10, color: "#5C5678", letterSpacing: "0.1em" }}>
          gemini-2.5-flash-lite
        </span>
      </header>

      {/* ── Messages ── */}
      <div className="messages-scroll relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-12">
          {/* Empty state */}
          {messages.length === 0 && !isErrored && (
            <div className="flex min-h-[45vh] flex-col items-center justify-center gap-5 text-center">
              <p
                className={fraunces.className}
                style={{
                  fontSize: "clamp(38px, 7vw, 60px)",
                  fontStyle: "italic",
                  fontWeight: 300,
                  color: "rgba(255,255,255,0.14)",
                  lineHeight: 1.15,
                  userSelect: "none",
                  letterSpacing: "-0.01em",
                }}
              >
                Ask anything.
              </p>
              <p className={mono.className} style={{ fontSize: 10, letterSpacing: "0.22em", color: "#4E4870" }}>
                ENTER TO SEND · SHIFT+ENTER FOR NEWLINE
              </p>
            </div>
          )}

          {/* Message list */}
          <div className="flex flex-col gap-9">
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              const isLastAssistant = m.role === "assistant" && idx === messages.length - 1;
              const showCursor = isLastAssistant && isStreaming;

              // ── User message ──
              if (isUser) {
                return (
                  <div key={m.id} className="msg-in flex justify-end">
                    <div style={{ maxWidth: "72%" }}>
                      <p
                        className={mono.className}
                        style={{
                          fontSize: 9.5,
                          letterSpacing: "0.2em",
                          color: "#7A7298",
                          marginBottom: 6,
                          textAlign: "right",
                        }}
                      >
                        YOU
                      </p>
                      <p
                        className={mono.className}
                        style={{
                          fontSize: 13.5,
                          lineHeight: 1.75,
                          color: "#C4BDDB",
                          textAlign: "right",
                          wordBreak: "break-word",
                        }}
                      >
                        {m.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                      </p>
                    </div>
                  </div>
                );
              }

              // ── Assistant message ──
              return (
                <div key={m.id} className="msg-in flex gap-4">
                  {/* Animated left border — the signature element */}
                  <div
                    className="border-draw shrink-0"
                    style={{
                      width: 2,
                      background: "linear-gradient(to bottom, #7C3AED, rgba(124,58,237,0.3))",
                      borderRadius: 2,
                      alignSelf: "stretch",
                      minHeight: 20,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className={mono.className}
                      style={{
                        fontSize: 9.5,
                        letterSpacing: "0.2em",
                        color: "#7A7298",
                        marginBottom: 8,
                      }}
                    >
                      ASSISTANT
                    </p>
                    <p
                      className={mono.className}
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.8,
                        color: "#EAE6F5",
                        wordBreak: "break-word",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.parts.map((part, i) =>
                        part.type === "text" ? (
                          <span key={i}>
                            {part.text}
                            {showCursor && i === m.parts.length - 1 && <span className="stream-cursor" />}
                          </span>
                        ) : null,
                      )}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* ── Thinking state ── */}
            {isSubmitted && (
              <div className="msg-in flex gap-4">
                <div
                  className="border-draw shrink-0"
                  style={{
                    width: 2,
                    background: "linear-gradient(to bottom, #7C3AED, rgba(124,58,237,0.3))",
                    borderRadius: 2,
                    alignSelf: "stretch",
                    minHeight: 20,
                  }}
                />
                <div>
                  <p
                    className={mono.className}
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.2em",
                      color: "#7A7298",
                      marginBottom: 12,
                    }}
                  >
                    ASSISTANT
                  </p>
                  <div className="flex items-end gap-1">
                    <span className={`dot-wave-1 ${mono.className}`} style={{ fontSize: 20, color: "#7C3AED", lineHeight: 1, display: "inline-block" }}>
                      ·
                    </span>
                    <span className={`dot-wave-2 ${mono.className}`} style={{ fontSize: 20, color: "#7C3AED", lineHeight: 1, display: "inline-block" }}>
                      ·
                    </span>
                    <span className={`dot-wave-3 ${mono.className}`} style={{ fontSize: 20, color: "#7C3AED", lineHeight: 1, display: "inline-block" }}>
                      ·
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Error state ── */}
            {isErrored && error && (
              <div className="msg-in flex gap-4">
                <div
                  className="shrink-0"
                  style={{
                    width: 2,
                    background: "linear-gradient(to bottom, #EF4444, rgba(239,68,68,0.2))",
                    borderRadius: 2,
                    alignSelf: "stretch",
                    minHeight: 20,
                  }}
                />
                <div>
                  <p
                    className={mono.className}
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.2em",
                      color: "#B91C1C",
                      marginBottom: 8,
                    }}
                  >
                    ERROR
                  </p>
                  <p
                    className={mono.className}
                    style={{
                      fontSize: 13,
                      color: "#FCA5A5",
                      lineHeight: 1.7,
                      marginBottom: 14,
                      wordBreak: "break-word",
                    }}
                  >
                    {error.message}
                  </p>
                  <div className="flex gap-6">
                    <button
                      onClick={() => regenerate()}
                      className={mono.className}
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        color: "#7C3AED",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      ↺ RETRY
                    </button>
                    <button
                      onClick={() => clearError()}
                      className={mono.className}
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        color: "#6B6390",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      DISMISS
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input composer ── */}
      <div className="relative z-10 shrink-0">
        {/* Top rule — glows when focused */}
        <div
          className={inputFocused ? "rule-active" : ""}
          style={{
            height: 1,
            background: inputFocused ? "linear-gradient(90deg, transparent 0%, #7C3AED 40%, #9F67FF 60%, transparent 100%)" : "rgba(255,255,255,0.04)",
            transition: "background 400ms",
          }}
        />

        <form onSubmit={handleSubmit}>
          <div className="mx-auto max-w-2xl px-6 py-5">
            <div className="flex items-end gap-4">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  resizeTextarea();
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Type a message…"
                disabled={isBusy}
                rows={1}
                className={mono.className}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: "#E2E8F0",
                  caretColor: "#7C3AED",
                  overflowY: "hidden",
                  // Placeholder color via inline style isn't possible — handled by global
                }}
              />
              <button
                type="submit"
                disabled={isBusy || !input.trim()}
                className={mono.className}
                style={{
                  flexShrink: 0,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: isBusy || !input.trim() ? "#4E4870" : "#7C3AED",
                  background: "none",
                  border: "none",
                  cursor: isBusy || !input.trim() ? "default" : "pointer",
                  padding: "4px 0",
                  paddingBottom: 6,
                  transition: "color 200ms",
                  whiteSpace: "nowrap",
                }}
              >
                {isBusy ? "···" : "SEND ↵"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
