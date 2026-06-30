// app/api/extract-ticket/route.ts
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

export const maxDuration = 30;

const ticketSchema = z.object({
  category: z.enum(["inventory_discrepancy", "damaged_goods", "shipping_delay", "pricing_error", "sync_failure", "other"]).describe("The primary type of issue being reported. Use 'sync_failure' for Shopify/Amazon mismatch issues, 'other' only if nothing else fits."),
  severity: z.enum(["low", "medium", "high", "critical"]).describe("Business impact, inferred from tone and content — not stated explicitly. 'critical' means active revenue loss or customer-facing failure happening now."),
  summary: z.string().describe("One or two sentence neutral summary of the issue, written for an internal dashboard, not a quote from the customer."),
  affectedSkus: z.array(z.string()).describe("Any product SKUs, product names, or item identifiers mentioned. Empty array if none are mentioned — do not invent one."),
  customer: z.object({
    name: z.string().nullable().describe("Customer's name if mentioned, otherwise null."),
    email: z.string().nullable().describe("Customer's email if mentioned, otherwise null."),
  }),
  requiresImmediateAction: z.boolean().describe("True only if the issue implies active financial loss, a safety issue, or a hard deadline within 24 hours."),
});

export type SupportTicket = z.infer<typeof ticketSchema>;

export async function POST(req: Request) {
  const { description }: { description: string } = await req.json();

  const { output } = await generateText({
    model: google("gemini-2.5-flash-lite"),
    prompt: `Extract a structured support ticket from the following customer or staff message:\n\n"${description}"`,
    output: Output.object({ schema: ticketSchema }),
  });

  return Response.json(output);
}
