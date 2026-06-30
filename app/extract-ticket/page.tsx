// app/extract-ticket/page.tsx
"use client";

import { useState } from "react";
import type { SupportTicket } from "../api/extract-ticket/route";

export default function ExtractTicketPage() {
  const [description, setDescription] = useState("");
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
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

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold">Support Ticket Extractor</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue in plain language..." rows={5} disabled={isLoading} className="rounded-lg border border-gray-700 bg-gray-900 p-3 text-white outline-none focus:border-purple-500" />
          <button type="submit" disabled={isLoading || !description.trim()} className="self-start rounded-lg bg-purple-600 px-4 py-2 font-medium disabled:opacity-50">
            {isLoading ? "Extracting..." : "Extract Ticket"}
          </button>
        </form>

        {ticket && <pre className="mt-6 overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-200">{JSON.stringify(ticket, null, 2)}</pre>}
      </div>
    </div>
  );
}
