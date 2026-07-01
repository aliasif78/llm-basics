// app/weather-agent/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Fraunces, JetBrains_Mono } from 'next/font/google';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300'],
  style: ['italic'],
});
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'] });

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------
const ACCENT = '#0EA5E9';

type ToolName = 'get_user_location' | 'geocode_city' | 'get_current_weather' | 'get_forecast' | 'get_air_quality';

const TOOL_META: Record<ToolName, { label: string; description: string; icon: React.ReactNode }> = {
  get_user_location: {
    label: 'Detect Location',
    description: 'Resolves your approximate position from your IP address',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 16, height: 16 }}>
        <circle cx="10" cy="9" r="3" />
        <path d="M10 2C6.686 2 4 4.686 4 8c0 4.5 6 10 6 10s6-5.5 6-10c0-3.314-2.686-6-6-6z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  geocode_city: {
    label: 'Geocode City',
    description: 'Converts a city name to geographic coordinates',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 16, height: 16 }}>
        <rect x="2" y="2" width="16" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 8h16M8 2v16" strokeLinecap="round" />
      </svg>
    ),
  },
  get_current_weather: {
    label: 'Current Weather',
    description: 'Live temperature, humidity, wind, and conditions',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 16, height: 16 }}>
        <circle cx="10" cy="10" r="4" strokeLinecap="round" />
        <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" strokeLinecap="round" />
      </svg>
    ),
  },
  get_forecast: {
    label: 'Forecast',
    description: 'Daily high / low and conditions for up to 7 days',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 16, height: 16 }}>
        <rect x="2" y="4" width="16" height="14" rx="1.5" />
        <path d="M6 2v4M14 2v4M2 9h16" strokeLinecap="round" />
      </svg>
    ),
  },
  get_air_quality: {
    label: 'Air Quality',
    description: 'PM2.5, PM10, and European AQI with category label',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 16, height: 16 }}>
        <path d="M3 10c0 0 2-4 7-4s7 4 7 4" strokeLinecap="round" />
        <path d="M5 13c0 0 1.5-3 5-3s5 3 5 3" strokeLinecap="round" />
        <path d="M7 16c0 0 1-2 3-2s3 2 3 2" strokeLinecap="round" />
      </svg>
    ),
  },
};

const TOOL_NAMES = Object.keys(TOOL_META) as ToolName[];

// ---------------------------------------------------------------------------
// Tool result → compact one-line summary
// ---------------------------------------------------------------------------
function summariseResult(toolName: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  try {
    switch (toolName) {
      case 'get_user_location':
        return `${r.city}, ${r.country}`;
      case 'geocode_city':
        return `${r.city}, ${r.country} · (${(r.latitude as number).toFixed(2)}, ${(r.longitude as number).toFixed(2)})`;
      case 'get_current_weather':
        return `${r.temperature}${r.unit} · ${r.description} · ${r.humidity}% RH`;
      case 'get_forecast': {
        const days = (r.days as unknown[]).length;
        return `${days}-day forecast retrieved`;
      }
      case 'get_air_quality':
        return `AQI ${r.european_aqi} (${r.category}) · PM2.5 ${r.pm2_5} · PM10 ${r.pm10}`;
      default:
        return 'Result received';
    }
  } catch {
    return 'Result received';
  }
}

// ---------------------------------------------------------------------------
// Args → compact display for pending invocation card
// ---------------------------------------------------------------------------
function summariseArgs(toolName: string, args: unknown): string {
  const a = args as Record<string, unknown>;
  if (!a || Object.keys(a).length === 0) return '';
  try {
    switch (toolName) {
      case 'geocode_city':
        return String(a.city ?? '');
      case 'get_current_weather':
      case 'get_forecast':
      case 'get_air_quality':
        return `${(a.latitude as number).toFixed(2)}, ${(a.longitude as number).toFixed(2)}`;
      default:
        return '';
    }
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// ToolInvocationCard
// ---------------------------------------------------------------------------
type ToolInvocationPart = {
  type: 'tool-invocation';
  toolInvocationId: string;
  toolName: string;
  state: 'partial-call' | 'call' | 'result';
  args: unknown;
  result?: unknown;
};

function ToolInvocationCard({ part }: { part: ToolInvocationPart }) {
  const meta = TOOL_META[part.toolName as ToolName];
  const isPending = part.state === 'call' || part.state === 'partial-call';
  const isDone = part.state === 'result';
  const argHint = summariseArgs(part.toolName, part.args);

  return (
    <div
      className={`tool-card ${isPending ? 'tool-pending' : ''} ${isDone ? 'tool-done' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '9px 12px',
        margin: '6px 0',
        borderRadius: 4,
        border: `1px solid ${isDone ? 'rgba(14,165,233,0.25)' : 'rgba(14,165,233,0.45)'}`,
        background: isDone ? 'rgba(14,165,233,0.04)' : 'rgba(14,165,233,0.08)',
        transition: 'border-color 300ms, background 300ms',
      }}>
      <span style={{ flexShrink: 0, marginTop: 1, color: isDone ? '#22C55E' : ACCENT, fontSize: 11, lineHeight: 1 }}>{isDone ? '✓' : '⟳'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className={mono.className}
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            color: isDone ? 'rgba(14,165,233,0.7)' : ACCENT,
            marginBottom: argHint || isDone ? 3 : 0,
            textTransform: 'uppercase',
          }}>
          {meta?.label ?? part.toolName}
        </p>
        {isPending && argHint && (
          <p className={mono.className} style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0 }}>
            {argHint}
          </p>
        )}
        {isDone && part.result !== undefined && (
          <p className={mono.className} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            {summariseResult(part.toolName, part.result)}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar ToolCard
// ---------------------------------------------------------------------------
type ToolStatus = 'idle' | 'active' | 'used';

function SidebarToolCard({ name, status }: { name: ToolName; status: ToolStatus }) {
  const meta = TOOL_META[name];
  const isActive = status === 'active';
  const isUsed = status === 'used';

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 6,
        border: `1px solid ${isActive ? 'rgba(14,165,233,0.5)' : isUsed ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
        background: isActive ? 'rgba(14,165,233,0.06)' : isUsed ? 'rgba(34,197,94,0.03)' : 'transparent',
        transition: 'border-color 300ms, background 300ms',
        position: 'relative',
        overflow: 'hidden',
      }}>
      {isActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(110deg, transparent 40%, rgba(14,165,233,0.06) 50%, transparent 60%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.6s linear infinite',
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: isActive ? ACCENT : isUsed ? '#6EE7B7' : '#6B7280',
            transition: 'color 300ms',
          }}>
          {meta.icon}
          <span
            className={mono.className}
            style={{
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: isActive ? ACCENT : isUsed ? '#6EE7B7' : 'rgba(255,255,255,0.35)',
              transition: 'color 300ms',
            }}>
            {meta.label}
          </span>
        </div>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            flexShrink: 0,
            background: isActive ? ACCENT : isUsed ? '#22C55E' : 'rgba(255,255,255,0.1)',
            boxShadow: isActive ? `0 0 6px ${ACCENT}` : 'none',
            transition: 'background 300ms, box-shadow 300ms',
            animation: isActive ? 'statusPulse 1.4s ease-in-out infinite' : 'none',
          }}
        />
      </div>
      <p style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.25)', margin: 0 }}>{meta.description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function WeatherAgentPage() {
  const { messages, sendMessage, status, error, regenerate, clearError } = useChat({
    transport: new DefaultChatTransport({ api: '/api/weather-agent' }),
    onError: (err) => {
      console.error('[weather-agent] useChat onError', {
        message: err.message,
        name: err.name,
      });
    },
  });

  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isSubmitted = status === 'submitted';
  const isStreaming = status === 'streaming';
  const isErrored = status === 'error';
  const isBusy = isSubmitted || isStreaming;

  // Log status transitions
  useEffect(() => {
    console.log('[weather-agent] status →', status);
  }, [status]);

  // Log error state changes
  useEffect(() => {
    if (error) {
      console.error('[weather-agent] error state set', { message: error.message, name: error.name });
    }
  }, [error]);

  // Log message list changes — summarise parts rather than dumping the whole object
  useEffect(() => {
    if (messages.length === 0) return;
    const summary = messages.map((m) => ({
      id: m.id,
      role: m.role,
      partTypes: m.parts.map((p) => (p as { type: string }).type),
    }));
    console.log('[weather-agent] messages updated', { count: messages.length, summary });
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status, error]);

  // Cursor glow
  useEffect(() => {
    const move = (e: MouseEvent) => setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    console.log('[weather-agent] sendMessage', { text });
    sendMessage({ text });
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input.trim();
      if (!text || isBusy) return;
      console.log('[weather-agent] sendMessage (Enter)', { text });
      sendMessage({ text });
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  // Derive tool statuses and log active tool changes
  const toolStatuses = useMemo<Record<ToolName, ToolStatus>>(() => {
    const active = new Set<string>();
    const used = new Set<string>();

    for (const m of messages) {
      for (const part of m.parts ?? []) {
        if ((part as { type: string }).type !== 'tool-invocation') continue;
        const p = part as unknown as ToolInvocationPart;
        if (p.state === 'call' || p.state === 'partial-call') {
          active.add(p.toolName);
        } else if (p.state === 'result') {
          active.delete(p.toolName);
          used.add(p.toolName);
        }
      }
    }

    if (active.size > 0) {
      console.log('[weather-agent] tools active', { active: [...active] });
    }

    const result = {} as Record<ToolName, ToolStatus>;
    for (const name of TOOL_NAMES) {
      result[name] = active.has(name) ? 'active' : used.has(name) ? 'used' : 'idle';
    }
    return result;
  }, [messages]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ background: '#080810', color: '#E2E8F0' }}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-in { animation: msgIn 280ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes borderDraw {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        .border-draw {
          transform-origin: top center;
          animation: borderDraw 420ms cubic-bezier(0.16, 1, 0.3, 1) 60ms both;
        }
        @keyframes dotWave {
          0%, 80%, 100% { opacity: 0.12; transform: translateY(0); }
          40%            { opacity: 1;    transform: translateY(-4px); }
        }
        .dot-1 { animation: dotWave 1.3s ease-in-out 0s    infinite; }
        .dot-2 { animation: dotWave 1.3s ease-in-out 0.18s infinite; }
        .dot-3 { animation: dotWave 1.3s ease-in-out 0.36s infinite; }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .stream-cursor {
          display: inline-block;
          width: 6px;
          height: 0.85em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: ${ACCENT};
          border-radius: 1px;
          animation: cursorBlink 0.9s step-start infinite;
        }
        @keyframes ruleGlow {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 1; }
        }
        .rule-active { animation: ruleGlow 2s ease-in-out infinite; }
        .scroll-thin::-webkit-scrollbar { width: 3px; }
        .scroll-thin::-webkit-scrollbar-track { background: transparent; }
        .scroll-thin::-webkit-scrollbar-thumb { background: #2D3748; border-radius: 2px; }
        textarea::placeholder { color: #4A5568; }
        @media (prefers-reduced-motion: reduce) {
          .msg-in, .border-draw, .dot-1, .dot-2, .dot-3,
          .stream-cursor, .rule-active,
          [style*="animation"] { animation: none !important; }
        }
      `}</style>

      {/* Cursor glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `radial-gradient(ellipse 50% 40% at ${mouse.x * 100}% ${mouse.y * 100}%, rgba(14,165,233,0.09) 0%, transparent 70%)`,
          transition: 'background 80ms linear',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-3">
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isErrored ? '#EF4444' : ACCENT,
              boxShadow: isBusy ? `0 0 0 3px rgba(14,165,233,0.2), 0 0 8px ${ACCENT}` : isErrored ? '0 0 8px #EF4444' : `0 0 6px rgba(14,165,233,0.4)`,
              transition: 'box-shadow 400ms, background 400ms',
            }}
          />
          <span className={mono.className} style={{ fontSize: 10.5, letterSpacing: '0.22em', color: '#6B7280' }}>
            WEATHER AGENT · 03
          </span>
        </div>
        <span className={mono.className} style={{ fontSize: 10, color: '#4B5563', letterSpacing: '0.1em' }}>
          gemini-2.5-flash-lite
        </span>
      </header>

      {/* Two-column body */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Chat column */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="scroll-thin flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-6 py-10">
              {messages.length === 0 && !isErrored && (
                <div className="flex min-h-[42vh] flex-col items-center justify-center gap-6 text-center">
                  <p
                    className={fraunces.className}
                    style={{
                      fontSize: 'clamp(34px, 6vw, 56px)',
                      fontStyle: 'italic',
                      fontWeight: 300,
                      color: 'rgba(255,255,255,0.12)',
                      lineHeight: 1.2,
                      userSelect: 'none',
                    }}>
                    Ask about the weather.
                  </p>
                  <div className={mono.className} style={{ fontSize: 10, letterSpacing: '0.2em', color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <p style={{ margin: 0 }}>&ldquo;What&rsquo;s the weather here?&rdquo; · sequential</p>
                    <p style={{ margin: 0 }}>&ldquo;Air quality and forecast in Tokyo&rdquo; · parallel</p>
                    <p style={{ margin: 0 }}>&ldquo;Current conditions in London&rdquo; · single chain</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-8">
                {messages.map((m, idx) => {
                  const isUser = m.role === 'user';
                  const isLastAssistant = m.role === 'assistant' && idx === messages.length - 1;
                  const showCursor = isLastAssistant && isStreaming;

                  if (isUser) {
                    return (
                      <div key={m.id} className="msg-in flex justify-end">
                        <div style={{ maxWidth: '72%' }}>
                          <p className={mono.className} style={{ fontSize: 9.5, letterSpacing: '0.2em', color: '#6B7280', marginBottom: 5, textAlign: 'right' }}>
                            YOU
                          </p>
                          <p className={mono.className} style={{ fontSize: 13.5, lineHeight: 1.75, color: '#9CA3AF', textAlign: 'right', wordBreak: 'break-word' }}>
                            {m.parts.map((part, i) => ((part as { type: string }).type === 'text' ? <span key={i}>{(part as { text: string }).text}</span> : null))}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className="msg-in flex gap-4">
                      <div
                        className="border-draw shrink-0"
                        style={{
                          width: 2,
                          background: `linear-gradient(to bottom, ${ACCENT}, rgba(14,165,233,0.2))`,
                          borderRadius: 2,
                          alignSelf: 'stretch',
                          minHeight: 20,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className={mono.className} style={{ fontSize: 9.5, letterSpacing: '0.2em', color: '#6B7280', marginBottom: 8 }}>
                          AGENT
                        </p>
                        {m.parts.map((part, i) => {
                          const p = part as { type: string };
                          if (p.type === 'text') {
                            const tp = part as { type: string; text: string };
                            const isLast = i === m.parts.length - 1;
                            return (
                              <p key={i} className={mono.className} style={{ fontSize: 13.5, lineHeight: 1.8, color: '#E2E8F0', wordBreak: 'break-word', whiteSpace: 'pre-wrap', margin: '4px 0' }}>
                                {tp.text}
                                {showCursor && isLast && <span className="stream-cursor" />}
                              </p>
                            );
                          }
                          if (p.type === 'tool-invocation') {
                            return <ToolInvocationCard key={i} part={part as unknown as ToolInvocationPart} />;
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  );
                })}

                {isSubmitted && (
                  <div className="msg-in flex gap-4">
                    <div
                      className="border-draw shrink-0"
                      style={{
                        width: 2,
                        background: `linear-gradient(to bottom, ${ACCENT}, rgba(14,165,233,0.2))`,
                        borderRadius: 2,
                        alignSelf: 'stretch',
                        minHeight: 20,
                      }}
                    />
                    <div>
                      <p className={mono.className} style={{ fontSize: 9.5, letterSpacing: '0.2em', color: '#6B7280', marginBottom: 12 }}>
                        AGENT
                      </p>
                      <div className="flex items-end gap-1">
                        {(['dot-1', 'dot-2', 'dot-3'] as const).map((cls) => (
                          <span key={cls} className={`${cls} ${mono.className}`} style={{ fontSize: 20, color: ACCENT, lineHeight: 1, display: 'inline-block' }}>
                            ·
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {isErrored && error && (
                  <div className="msg-in flex gap-4">
                    <div
                      className="shrink-0"
                      style={{
                        width: 2,
                        background: 'linear-gradient(to bottom, #EF4444, rgba(239,68,68,0.2))',
                        borderRadius: 2,
                        alignSelf: 'stretch',
                        minHeight: 20,
                      }}
                    />
                    <div>
                      <p className={mono.className} style={{ fontSize: 9.5, letterSpacing: '0.2em', color: '#B91C1C', marginBottom: 8 }}>
                        ERROR
                      </p>
                      <p className={mono.className} style={{ fontSize: 13, color: '#FCA5A5', lineHeight: 1.7, marginBottom: 14, wordBreak: 'break-word' }}>
                        {error.message}
                      </p>
                      <div className="flex gap-6">
                        <button
                          onClick={() => {
                            console.log('[weather-agent] user triggered regenerate');
                            regenerate();
                          }}
                          className={mono.className}
                          style={{ fontSize: 10, letterSpacing: '0.18em', color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          ↺ RETRY
                        </button>
                        <button
                          onClick={() => {
                            console.log('[weather-agent] user triggered clearError');
                            clearError();
                          }}
                          className={mono.className}
                          style={{ fontSize: 10, letterSpacing: '0.18em', color: '#4B5563', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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

          {/* Input composer */}
          <div className="shrink-0">
            <div
              className={inputFocused ? 'rule-active' : ''}
              style={{
                height: 1,
                background: inputFocused ? `linear-gradient(90deg, transparent 0%, ${ACCENT} 40%, #38BDF8 60%, transparent 100%)` : 'rgba(255,255,255,0.04)',
                transition: 'background 400ms',
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
                    placeholder="Ask about weather anywhere…"
                    disabled={isBusy}
                    rows={1}
                    className={mono.className}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      fontSize: 14,
                      lineHeight: 1.65,
                      color: '#E2E8F0',
                      caretColor: ACCENT,
                      overflowY: 'hidden',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isBusy || !input.trim()}
                    className={mono.className}
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      color: isBusy || !input.trim() ? '#374151' : ACCENT,
                      background: 'none',
                      border: 'none',
                      cursor: isBusy || !input.trim() ? 'default' : 'pointer',
                      padding: '4px 0',
                      paddingBottom: 6,
                      transition: 'color 200ms',
                      whiteSpace: 'nowrap',
                    }}>
                    {isBusy ? '···' : 'SEND ↵'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Tool sidebar */}
        <aside className="scroll-thin flex-none overflow-y-auto" style={{ width: 272, borderLeft: '1px solid rgba(255,255,255,0.04)', padding: '20px 16px' }}>
          <p className={mono.className} style={{ fontSize: 9, letterSpacing: '0.22em', color: '#374151', textTransform: 'uppercase', marginBottom: 14 }}>
            Available Tools
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TOOL_NAMES.map((name) => (
              <SidebarToolCard key={name} name={name} status={toolStatuses[name]} />
            ))}
          </div>
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { color: '#374151', label: 'Idle' },
              { color: ACCENT, pulse: true, label: 'Active' },
              { color: '#22C55E', label: 'Used this session' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: item.color, boxShadow: item.pulse ? `0 0 5px ${item.color}` : 'none' }} />
                <span className={mono.className} style={{ fontSize: 9.5, letterSpacing: '0.1em', color: '#4B5563' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
