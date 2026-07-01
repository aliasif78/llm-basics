// app/extract-ticket/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import type { SupportTicket } from "../api/extract-ticket/route";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"] });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"] });

const SEVERITY_COLOR: Record<SupportTicket["severity"], string> = {
  low: "#6EE7B7",
  medium: "#FBBF24",
  high: "#FB923C",
  critical: "#F2545B",
};

const CATEGORY_LABEL: Record<SupportTicket["category"], string> = {
  inventory_discrepancy: "Inventory Discrepancy",
  damaged_goods: "Damaged Goods",
  shipping_delay: "Shipping Delay",
  pricing_error: "Pricing Error",
  sync_failure: "Sync Failure",
  other: "Other",
};

export default function ExtractTicketPage() {
  const [description, setDescription] = useState("");
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      setMouse({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsLoading(true);
    setTicket(null);

    const res = await fetch("/api/extract-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });

    const data: SupportTicket = await res.json();
    setTicket(data);
    setIsLoading(false);
  };

  const fields: Array<{ label: string; node: React.ReactNode }> = ticket
    ? [
        {
          label: "Category",
          node: <span style={{ color: "#D4AF6A" }}>{CATEGORY_LABEL[ticket.category]}</span>,
        },
        {
          label: "Severity",
          node: (
            <span className="inline-flex items-center gap-2">
              <span className="seal" style={{ background: SEVERITY_COLOR[ticket.severity], boxShadow: `0 0 10px ${SEVERITY_COLOR[ticket.severity]}` }} />
              <span className="capitalize">{ticket.severity}</span>
            </span>
          ),
        },
        { label: "Summary", node: <span>{ticket.summary}</span> },
        {
          label: "Affected SKUs",
          node: ticket.affectedSkus.length ? <span className={mono.className}>{ticket.affectedSkus.join(", ")}</span> : <span style={{ color: "#5A5768" }}>none mentioned</span>,
        },
        {
          label: "Customer",
          node:
            ticket.customer.name || ticket.customer.email ? (
              <span>
                {ticket.customer.name ?? "—"}
                {ticket.customer.email ? <span style={{ color: "#8C899C" }}> · {ticket.customer.email}</span> : null}
              </span>
            ) : (
              <span style={{ color: "#5A5768" }}>not identified</span>
            ),
        },
        {
          label: "Immediate Action",
          node: <span style={{ color: ticket.requiresImmediateAction ? "#F2545B" : "#8C899C" }}>{ticket.requiresImmediateAction ? "Required" : "Not required"}</span>,
        },
      ]
    : [];

  return (
    <div className="relative min-h-screen" style={{ background: "#0B0B12", color: "#E7E5EF" }}>
      <style>{`
        @keyframes drawRule { from { width: 0%; } to { width: 100%; } }
        @keyframes transcribe {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmerSweep {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .seal-rule {
          height: 1px;
          background: #D4AF6A;
          animation: drawRule 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .field-row {
          animation: transcribe 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .seal {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 9999px;
        }
        textarea.transmuting {
          background-image: linear-gradient(110deg, transparent 40%, rgba(212,175,106,0.18) 50%, transparent 60%);
          background-size: 200% 100%;
          animation: shimmerSweep 1.4s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .seal-rule, .field-row, textarea.transmuting { animation: none !important; }
        }
      `}</style>

      {/* ── Cursor-following gold glow ── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `radial-gradient(ellipse 55% 45% at ${mouse.x * 100}% ${mouse.y * 100}%, rgba(212,175,106,0.10) 0%, transparent 70%)`,
          transition: "background 80ms linear",
        }}
      />

      {/* ── Content (sits above the glow) ── */}
      <div className="relative z-10 mx-auto max-w-xl px-6 py-16">
        <p className={mono.className} style={{ fontSize: 11, letterSpacing: "0.15em", color: "#8C899C", marginBottom: 8 }}>
          INVENTORY · SUPPORT
        </p>
        <h1 className={fraunces.className} style={{ fontSize: 32, fontStyle: "italic", fontWeight: 600, marginBottom: 28 }}>
          Describe the issue. Watch it take shape.
        </h1>

        <form onSubmit={handleSubmit}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. the blue hoodies are showing in stock on Shopify but Amazon says we're out, customer Jamie at jamie@example.com is asking…"
            rows={5}
            disabled={isLoading}
            className={`${mono.className} ${isLoading ? "transmuting" : ""}`}
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid #2A2A38",
              borderRadius: 4,
              padding: 14,
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "#E7E5EF",
              outline: "none",
              resize: "vertical",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#D4AF6A")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A38")}
          />

          <button
            type="submit"
            disabled={isLoading || !description.trim()}
            className={fraunces.className}
            style={{
              marginTop: 16,
              fontStyle: "italic",
              fontSize: 15,
              background: "transparent",
              border: "1px solid #D4AF6A",
              color: isLoading || !description.trim() ? "#5A5768" : "#D4AF6A",
              borderColor: isLoading || !description.trim() ? "#2A2A38" : "#D4AF6A",
              padding: "8px 20px",
              borderRadius: 4,
              cursor: isLoading || !description.trim() ? "default" : "pointer",
            }}
          >
            {isLoading ? "Transmuting…" : "Extract"}
          </button>
        </form>

        {ticket && (
          <div style={{ marginTop: 40 }}>
            <div className="seal-rule" />
            <dl style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {fields.map((f, i) => (
                <div key={f.label} className="field-row" style={{ animationDelay: `${i * 90}ms`, display: "flex", gap: 16, alignItems: "baseline" }}>
                  <dt className={mono.className} style={{ width: 130, flexShrink: 0, fontSize: 10.5, letterSpacing: "0.1em", color: "#8C899C", textTransform: "uppercase" }}>
                    {f.label}
                  </dt>
                  <dd style={{ fontSize: 14, margin: 0 }}>{f.node}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
