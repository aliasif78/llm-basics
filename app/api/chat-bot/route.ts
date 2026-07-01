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
// Retry policy
// ---------------------------------------------------------------------------
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

function isRetryable(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    // 429 = rate limited, 5xx = transient provider failure. Both are worth
    // retrying. A 4xx other than 429 means the request itself is malformed
    // or rejected — retrying it will fail identically every time, so don't.
    return error.statusCode === 429 || (error.statusCode !== undefined && error.statusCode >= 500);
  }
  return false;
}

function describeError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) {
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
      await sleep(BASE_DELAY_MS * 2 ** attempt);
    }
  }

  // Unreachable, but keeps TypeScript satisfied.
  throw lastError;
}

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
