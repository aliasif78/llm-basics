import { google } from "@ai-sdk/google";
import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, APICallError, toUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";

export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Token limit
// ---------------------------------------------------------------------------
// gemini-2.5-flash-lite's real input window is ~1,048,576 tokens. We are NOT
// using that number here. We cap input far below it on purpose:
//   1. Cost control — nothing in the UI stops a user from pasting a massive
//      block of text. A real limit protects you from a runaway bill.
//   2. Testability — a 1M-token ceiling can't be demonstrated in a manual
//      demo. This number is low enough that you can actually trigger and
//      verify the failure path below.
// Tune this per use case; it has nothing to do with the model's real limit.
const MAX_INPUT_TOKENS = 6000;

// Gemini does not ship a client-side tokenizer the way OpenAI's tiktoken
// does. Google's own docs (ai.google.dev/gemini-api/docs/tokens) give
// "~4 characters per token" as their own approximation for English text.
// This is a heuristic, not a real count — it will be off for code, non-Latin
// scripts, and dense punctuation. That's why MAX_INPUT_TOKENS above leaves
// real headroom under the actual model limit rather than cutting it close.
// For an exact count, Google's API exposes a countTokens() call, but that's
// a separate network round trip per request — a heuristic pre-check that
// avoids a wasted generation call is the right tradeoff here.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// 429 classification
// ---------------------------------------------------------------------------
// A 429 from Google can mean two entirely different things:
//
//   RATE_LIMITED      — too many requests per minute. Retry after the delay
//                       the API tells you to wait. Quota resets in seconds.
//
//   QUOTA_EXHAUSTED   — daily (or monthly) free-tier cap hit. The quota
//                       metric name contains "free_tier". Retrying in
//                       milliseconds is pointless — fail fast.
//
// Conflating them (treating all 429s as "retry soon") wastes 3 retry slots
// burning 1-2 seconds before an inevitable failure, and gives the user a
// misleading "try again in a moment" message when the real answer is
// "come back tomorrow or add billing."

type RateLimitKind = "rate_limited" | "quota_exhausted";

function classify429(error: APICallError): RateLimitKind {
  try {
    const body = typeof error.responseBody === "string" ? JSON.parse(error.responseBody) : error.responseBody;

    // Google surfaces quota exhaustion via RESOURCE_EXHAUSTED status and
    // a quotaMetric name that contains "free_tier".
    if (body?.error?.status === "RESOURCE_EXHAUSTED") {
      const violations: Array<{ quotaMetric?: string }> = body?.error?.details?.find((d: { "@type": string }) => d["@type"] === "type.googleapis.com/google.rpc.QuotaFailure")?.violations ?? [];

      const isFreeTierExhaustion = violations.some((v) => v.quotaMetric?.includes("free_tier"));

      if (isFreeTierExhaustion) return "quota_exhausted";
    }
  } catch {
    // Unparseable body — treat conservatively as rate-limited so we still
    // attempt a retry rather than silently dropping a potentially transient error.
  }

  return "rate_limited";
}

// ---------------------------------------------------------------------------
// Retry delay
// ---------------------------------------------------------------------------
// Google's API includes a RetryInfo detail with the exact number of seconds
// to wait. Using it is strictly better than our own backoff: it avoids
// both retrying too early (wasting a slot) and waiting longer than necessary.
// Fall back to exponential backoff only when the header is absent.

const BASE_DELAY_MS = 500;

function getRetryDelayMs(error: APICallError, attempt: number): number {
  try {
    const body = typeof error.responseBody === "string" ? JSON.parse(error.responseBody) : error.responseBody;

    const retryInfo = body?.error?.details?.find((d: { "@type": string }) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo");

    if (retryInfo?.retryDelay) {
      // retryDelay arrives as e.g. "38s" or "38.834098922s"
      const seconds = parseFloat(retryInfo.retryDelay.replace("s", ""));
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
      }
    }
  } catch {
    // Fall through to exponential backoff.
  }

  return BASE_DELAY_MS * 2 ** attempt;
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------
const MAX_RETRIES = 2;

function isRetryable(error: unknown): boolean {
  if (!APICallError.isInstance(error)) return false;

  if (error.statusCode !== undefined && error.statusCode >= 500) return true;

  if (error.statusCode === 429) {
    // Only retry genuine rate limits, not exhausted quotas.
    return classify429(error) === "rate_limited";
  }

  return false;
}

function describeError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) {
      const kind = classify429(error);
      if (kind === "quota_exhausted") {
        return "You've hit the daily request limit for this assistant. Add billing to your Google AI project at ai.dev, or try again tomorrow.";
      }
      return "The assistant is receiving too many requests right now. Please wait a moment and try again.";
    }
    if (error.statusCode !== undefined && error.statusCode >= 500) {
      return "The assistant's provider is temporarily unavailable. Please try again shortly.";
    }
    if (error.statusCode === 400) {
      return "The request was rejected by the model provider — likely due to content or formatting it won't accept.";
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong while generating a response. Please try again.";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Pre-stream retry
// ---------------------------------------------------------------------------
// Important constraint: once a chunk has been forwarded to the client, you
// cannot "retry" — the user has already seen partial output, and silently
// replacing it would be incoherent. So retries only apply to failures that
// happen BEFORE the first chunk is produced (auth failures, immediate
// rate-limit rejections, connectivity errors). We force this by reading the
// first chunk inside the try block before forwarding anything downstream.
// Any error that happens AFTER the first chunk is sent is not retried here —
// it's reported via onError below, and the user can manually regenerate.
async function startStreamWithRetry(modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>, systemPrompt: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = streamText({
      model: google("gemini-2.5-flash-lite"),
      system: systemPrompt,
      messages: modelMessages,
    });

    const reader = toUIMessageStream({ stream: result.stream }).getReader();

    try {
      const first = await reader.read();
      return { reader, first };
    } catch (error) {
      lastError = error;

      if (attempt === MAX_RETRIES || !isRetryable(error)) throw error;

      // Wait whatever the API tells us to wait — not our own fixed backoff.
      const delayMs = APICallError.isInstance(error) ? getRetryDelayMs(error, attempt) : BASE_DELAY_MS * 2 ** attempt;

      await sleep(delayMs);
    }
  }

  // Unreachable, but keeps TypeScript satisfied.
  throw lastError;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const modelMessages = await convertToModelMessages(messages);
  const systemPrompt = "You are a helpful, concise assistant.";

  const estimatedTokens = estimateTokens(systemPrompt) + modelMessages.reduce((sum, m) => sum + estimateTokens(JSON.stringify(m.content)), 0);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Pre-flight check — runs before any model call, so an over-limit
      // conversation never costs you a wasted generation request.
      if (estimatedTokens > MAX_INPUT_TOKENS) {
        throw new Error(`This conversation is too long for this assistant (~${estimatedTokens} estimated tokens, limit ${MAX_INPUT_TOKENS}). Start a new conversation, or remove some earlier messages.`);
      }

      const { reader, first } = await startStreamWithRetry(modelMessages, systemPrompt);

      if (!first.done) {
        writer.write(first.value as UIMessageChunk);
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        writer.write(value as UIMessageChunk);
      }
    },
    onError: (error) => {
      // Logged server-side for observability; the returned string is what
      // reaches the client as the error message.
      console.error("chat-bot route error:", error);
      return describeError(error);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
