"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import SoftAurora from "@/components/SoftAurora";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
});
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"] });

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ color: "#E7E5EF" }}>
      <style>{`
        @keyframes heroIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-enter   { animation: heroIn 800ms cubic-bezier(0.16,1,0.3,1) 100ms both; }
        .card-enter-1 { animation: cardIn 700ms cubic-bezier(0.16,1,0.3,1) 300ms both; }
        .card-enter-2 { animation: cardIn 700ms cubic-bezier(0.16,1,0.3,1) 420ms both; }
        @media (prefers-reduced-motion: reduce) {
          .hero-enter, .card-enter-1, .card-enter-2 { animation: none !important; }
        }
      `}</style>

      {/* ── Aurora background ── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-black">
        <SoftAurora speed={0.6} scale={1.5} brightness={1} color1="#f7f7f7" color2="#e100ff" noiseFrequency={2.5} noiseAmplitude={1} bandHeight={0.5} bandSpread={1} octaveDecay={0.1} layerOffset={0} colorSpeed={1} enableMouseInteraction mouseInfluence={0.25} />
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-24">
        {/* Eyebrow */}
        <p
          className={`${mono.className} hero-enter mb-4 text-center`}
          style={{
            fontSize: 10.5,
            letterSpacing: "0.25em",
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
          }}
        >
          Phase 1 · Week 2 · Vercel AI SDK
        </p>

        {/* Heading */}
        <h1
          className={`${fraunces.className} hero-enter mb-5 text-center`}
          style={{
            fontSize: "clamp(54px, 11vw, 104px)",
            fontWeight: 300,
            fontStyle: "italic",
            lineHeight: 0.95,
            letterSpacing: "-0.025em",
          }}
        >
          LLM{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #e100ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Tools
          </span>
        </h1>

        {/* Sub */}
        <p
          className="hero-enter mb-16 text-center"
          style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.3)",
            maxWidth: 380,
            lineHeight: 1.65,
          }}
        >
          Two live experiments in streaming AI, structured outputs, and graceful error handling.
        </p>

        {/* Cards */}
        <div className="grid w-full max-w-2xl grid-cols-1 gap-5 md:grid-cols-2">
          <div className="card-enter-1">
            <ToolCard
              href="/chat-bot"
              eyebrow="01 · Streaming UI"
              title="Chat Bot"
              description="useChat with streaming, submitted / streaming / error states, retry logic, and token-limit handling built into the route."
              accent="#8B5CF6"
              accentAlt="#3B82F6"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
            />
          </div>
          <div className="card-enter-2">
            <ToolCard
              href="/extract-ticket"
              eyebrow="02 · Structured Output"
              title="Ticket Extractor"
              description="Natural language → typed support ticket via generateObject, Zod schema validation, and severity inference."
              accent="#D4AF6A"
              accentAlt="#F59E0B"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <rect x="9" y="2" width="6" height="6" rx="1" />
                  <path d="M9 8H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-4" />
                  <path d="M9 13h6M9 17h4" />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card — self-contained cursor tracking, glass surface over the aurora
// ---------------------------------------------------------------------------
type ToolCardProps = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  accentAlt: string;
  icon: React.ReactNode;
};

function ToolCard({ href, eyebrow, title, description, accent, accentAlt, icon }: ToolCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const ref = useRef<HTMLAnchorElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  return (
    <Link
      ref={ref}
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMove}
      style={{
        display: "block",
        position: "relative",
        padding: "28px 26px 24px",
        borderRadius: 10,
        border: `1px solid ${hovered ? accent + "60" : "rgba(255,255,255,0.08)"}`,
        // Glass over the aurora
        background: hovered ? `radial-gradient(ellipse 85% 75% at ${pos.x * 100}% ${pos.y * 100}%, ${accent}18 0%, transparent 65%), rgba(11,11,18,0.55)` : "rgba(11,11,18,0.45)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        textDecoration: "none",
        color: "inherit",
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 250ms, box-shadow 250ms, background 120ms",
        boxShadow: hovered ? `0 0 0 1px ${accent}25, 0 8px 36px rgba(0,0,0,0.45), 0 0 60px ${accent}12` : "0 2px 16px rgba(0,0,0,0.35)",
      }}
    >
      {/* Top shimmer rule */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "10%",
          right: "10%",
          height: 1,
          background: hovered ? `linear-gradient(90deg, transparent, ${accent}90, ${accentAlt}70, transparent)` : "transparent",
          transition: "background 300ms",
        }}
      />

      {/* Icon */}
      <div
        style={{
          marginBottom: 18,
          color: accent,
          opacity: hovered ? 1 : 0.4,
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
          transition: "opacity 250ms, transform 250ms",
        }}
      >
        {icon}
      </div>

      {/* Eyebrow */}
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "rgba(255,255,255,0.25)",
          marginBottom: 7,
          fontFamily: "var(--font-geist-mono)",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </p>

      {/* Title */}
      <h2
        style={{
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 10,
          color: hovered ? accent : "rgba(255,255,255,0.85)",
          transition: "color 250ms",
        }}
      >
        {title}
      </h2>

      {/* Description */}
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.65,
          color: "rgba(255,255,255,0.3)",
        }}
      >
        {description}
      </p>

      {/* CTA */}
      <div
        style={{
          marginTop: 22,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          letterSpacing: "0.12em",
          fontFamily: "var(--font-geist-mono)",
          color: accent,
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateX(0)" : "translateX(-10px)",
          transition: "opacity 250ms, transform 250ms",
        }}
      >
        OPEN
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 12, height: 12 }}>
          <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}
