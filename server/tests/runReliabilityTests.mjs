/**
 * Reliability-layer tests for the Gemini service.
 *
 * Run with: node server/tests/runReliabilityTests.mjs
 *
 * The SDK client is stubbed in-memory (no network calls), so this verifies:
 *   - error classification categories
 *   - bounded retry with backoff for transient 503s
 *   - immediate failure for non-retryable errors (auth, quota, invalid request)
 *   - fallback model used only after primary retries are exhausted
 *   - success on a later retry attempt
 *   - user-facing messages never leak provider internals
 */
import assert from "node:assert/strict";

// Set config BEFORE importing env.js / gemini.js (ESM imports are hoisted, so
// everything is loaded dynamically after the env overrides).
process.env.AI_RETRY_BASE_DELAY_MS = "50";
process.env.GEMINI_FALLBACK_MODEL = "gemini-3.6-flash-lite";

const { gemini, classifyGeminiError } = await import("../services/ai/gemini.js");
const { AppError } = await import("../utils/errors.js");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

// ---------- A. Error classification ----------
console.log("=== A. classifyGeminiError ===");
check("503 is TRANSIENT and retryable", () => {
  const c = classifyGeminiError({ status: 503, message: "high demand" });
  assert.equal(c.type, "TRANSIENT");
  assert.equal(c.retryable, true);
  assert.equal(c.fallbackEligible, true);
});
check("401/403 is AUTHENTICATION, not retryable", () => {
  for (const status of [401, 403]) {
    const c = classifyGeminiError({ status, message: "denied" });
    assert.equal(c.type, "AUTHENTICATION");
    assert.equal(c.retryable, false);
  }
});
check("400 is INVALID_REQUEST, not retryable", () => {
  const c = classifyGeminiError({ status: 400, message: "bad request" });
  assert.equal(c.type, "INVALID_REQUEST");
  assert.equal(c.retryable, false);
});
check("429 with quota message is RATE_LIMITED_QUOTA, not retryable", () => {
  const c = classifyGeminiError({
    status: 429,
    message: "Resource has been exhausted (e.g. check quota).",
  });
  assert.equal(c.type, "RATE_LIMITED_QUOTA");
  assert.equal(c.retryable, false);
});
check("429 without quota message is RATE_LIMITED, retryable", () => {
  const c = classifyGeminiError({ status: 429, message: "too many requests" });
  assert.equal(c.type, "RATE_LIMITED");
  assert.equal(c.retryable, true);
});
check("network error (no status) is TRANSIENT", () => {
  const c = classifyGeminiError(new Error("fetch failed"));
  assert.equal(c.type, "TRANSIENT");
  assert.equal(c.retryable, true);
});
check("timeout AppError is TRANSIENT", () => {
  const c = classifyGeminiError(new AppError("timeout", 504, "AI_TIMEOUT"));
  assert.equal(c.type, "TRANSIENT");
  assert.equal(c.retryable, true);
});

// ---------- B. Retry + fallback behavior (stubbed SDK client) ----------
console.log("=== B. retry & fallback behavior ===");

function stubClient(behavior) {
  let calls = 0;
  return {
    calls: () => calls,
    models: {
      async *list() {
        yield { name: "models/gemini-3.6-flash" };
        yield { name: "models/gemini-3.6-flash-lite" };
      },
      async generateContent({ model }) {
        calls++;
        const result = behavior(calls, model);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

const transient503 = () => Object.assign(new Error("overloaded"), { status: 503 });

async function scenario(name, behavior, expectations) {
  const previousClient = gemini._client;
  const previousFallback = gemini._fallbackAvailable;
  gemini._client = stubClient(behavior);
  gemini._fallbackAvailable = null;
  try {
    await expectations();
  } finally {
    gemini._client = previousClient;
    gemini._fallbackAvailable = previousFallback;
  }
  passed++;
  console.log(`  ok - ${name}`);
}

await scenario("succeeds on 3rd attempt after transient 503s", (n) => (n < 3 ? transient503() : { text: '{"ok":true}' }), async () => {
  const text = await gemini.generateContent("prompt");
  assert.equal(text, '{"ok":true}');
  assert.equal(gemini._client.calls(), 3);
});

await scenario("falls back to the fallback model after primary retries exhaust", (n, model) =>
  model === gemini.model ? transient503() : { text: '{"ok":true}' },
  async () => {
    const text = await gemini.generateContent("prompt");
    assert.equal(text, '{"ok":true}');
    // 3 primary attempts (1 + AI_MAX_RETRIES=2) + 1 fallback attempt.
    assert.equal(gemini._client.calls(), 4);
  },
);

await scenario("fails fast on quota-exhausted 429 (no retries, no fallback)", () =>
  Object.assign(new Error("Resource has been exhausted (e.g. check quota)."), { status: 429 }),
  async () => {
    await assert.rejects(
      () => gemini.generateContent("prompt"),
      (error) => {
        assert.equal(error.statusCode, 429);
        assert.equal(error.details, "AI_RATE_LIMITED");
        assert.equal(gemini._client.calls(), 1);
        // No provider internals leak to the user-facing message.
        assert.ok(!/quota|resource/i.test(error.message));
        return true;
      },
    );
  },
);

await scenario("fails fast on auth error (no retries, no fallback)", () =>
  Object.assign(new Error("permission denied"), { status: 403 }),
  async () => {
    await assert.rejects(
      () => gemini.generateContent("prompt"),
      (error) => {
        assert.equal(error.statusCode, 502);
        assert.equal(error.details, "AI_AUTH_ERROR");
        assert.equal(gemini._client.calls(), 1);
        return true;
      },
    );
  },
);

await scenario("fails fast on malformed request (no retries, no fallback)", () =>
  Object.assign(new Error("invalid payload"), { status: 400 }),
  async () => {
    await assert.rejects(
      () => gemini.generateContent("prompt"),
      (error) => {
        assert.equal(error.statusCode, 502);
        assert.equal(error.details, "AI_AUTH_ERROR");
        assert.equal(gemini._client.calls(), 1);
        return true;
      },
    );
  },
);

await scenario("all retries + fallback exhausted → 503 user message", () => transient503(), async () => {
  await assert.rejects(
    () => gemini.generateContent("prompt"),
    (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.details, "AI_UNAVAILABLE");
      assert.equal(error.message, "We couldn't complete the AI analysis right now. Please try again shortly.");
      // 3 primary attempts (1 + AI_MAX_RETRIES=2) + 3 fallback attempts.
      assert.equal(gemini._client.calls(), 6);
      return true;
    },
  );
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures)" : ""}`);

