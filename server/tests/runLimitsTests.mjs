/**
 * Limits & launch-readiness tests.
 *
 * Run with: node server/tests/runLimitsTests.mjs
 *
 * Covers the limits users will actually hit, without any network calls:
 *   A. Centralized config defaults & bounds (env.js)
 *   B. AI output validation edge cases (no malformed data can reach users)
 *   C. Retry/time-budget bounds (worst-case user waiting is bounded)
 *   D. HTTP input limits (JD length, missing file, bad file type/size)
 */
import assert from "node:assert/strict";

// Config overrides must be set BEFORE env.js is imported (ESM import hoisting).
process.env.NODE_ENV = "test";
process.env.AI_RETRY_BASE_DELAY_MS = "50";
process.env.AI_REQUEST_TIMEOUT_MS = "120000";
process.env.AI_TOTAL_BUDGET_MS = ""; // use default derivation
process.env.GEMINI_FALLBACK_MODEL = "gemini-3.6-flash-lite";

const { env } = await import("../config/env.js");
const { app } = await import("../app.js");
const { gemini, classifyGeminiError } = await import("../services/ai/gemini.js");
const { validateAndNormalizeAnalysis } = await import("../services/ai/analysisValidator.js");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(error);
  }
}

// ---------- A. Config defaults & bounds ----------
console.log("=== A. Config defaults & bounds ===");

await test("sensible production defaults are set", () => {
  assert.equal(env.maxJobDescriptionLength, 20_000);
  assert.equal(env.maxUploadBytes, 5 * 1024 * 1024);
  assert.equal(env.aiMaxRetries, 2);
  // Base delay is overridden to 50ms in this test file for speed; env.js clamps
  // it to a 100ms minimum (by design) so production can never set a 0/absurd delay.
  assert.equal(env.aiRetryBaseDelayMs, Math.max(100, Number(process.env.AI_RETRY_BASE_DELAY_MS)));
  // Timeout honors AI_REQUEST_TIMEOUT_MS → legacy AI_TIMEOUT_MS (may be set in
  // the local .env) → 60s default.
  const expectedTimeout =
    Number(process.env.AI_REQUEST_TIMEOUT_MS) ||
    Number(process.env.AI_TIMEOUT_MS) ||
    60_000;
  assert.equal(env.aiRequestTimeoutMs, expectedTimeout);
  // Overall budget = 2 × per-attempt timeout → bounded worst-case wait.
  assert.equal(env.aiTotalBudgetMs, expectedTimeout * 2);
});

await test("retry config can never be negative/unbounded", () => {
  assert.ok(env.aiMaxRetries >= 0);
  assert.ok(env.aiRequestTimeoutMs > 0);
  assert.ok(env.aiTotalBudgetMs >= env.aiRequestTimeoutMs);
});

await test("worst-case user wait is bounded and reasonable", () => {
  // Worst case ≈ total budget + small backoff overhead. Must stay well under
  // an unacceptable wait (e.g. > 5 minutes).
  const worstCaseMs = env.aiTotalBudgetMs + env.aiRetryBaseDelayMs * (2 ** env.aiMaxRetries);
  assert.ok(worstCaseMs < 5 * 60_000, `worst case ${worstCaseMs}ms is too long for users`);
});

// ---------- B. Validator edge cases ----------
console.log("=== B. AI output validation edge cases ===");

const VALID_ANALYSIS = JSON.stringify({
  matchScore: 72,
  matchSummary: "Good fit.",
  strengths: [{ title: "React", explanation: "Strong.", evidence: ["Built apps"] }],
  missingSkills: [{ skill: "Go", importance: "medium", reason: "Required." }],
  partialMatches: [{ requirement: "3+ yrs Node", status: "supported", note: "5 yrs" }],
  keywordAnalysis: { matched: ["React"], missing: ["Go"] },
  resumeIssues: [{ section: "Experience", issue: "Vague.", priority: "high", recommendation: "Add metrics." }],
  bulletSuggestions: [{ section: "Experience", original: "Did X", suggestion: "Did X, improving Y by 30%", reason: "Impact." }],
  actionPlan: [{ priority: 2, action: "B", reason: "r" }, { priority: 1, action: "A", reason: "r" }],
});

async function rejectsValidation(name, raw) {
  await test(name, () => {
    assert.throws(() => validateAndNormalizeAnalysis(raw), (e) => e.statusCode === 502);
  });
}

await test("valid analysis passes with action plan renumbered 1..n", () => {
  const out = validateAndNormalizeAnalysis(VALID_ANALYSIS);
  assert.equal(out.matchScore, 72);
  assert.deepEqual(out.actionPlan.map((a) => a.priority), [1, 2]);
});
await rejectsValidation("empty response is rejected", "");
await rejectsValidation("non-JSON prose is rejected", "Sorry, I cannot help with that.");
await rejectsValidation("truncated JSON is rejected", '{"matchScore": 50, "matchSum');
await rejectsValidation("JSON array is rejected", "[]");
await rejectsValidation("missing required field is rejected", '{"matchScore": 50}');
await rejectsValidation("out-of-range matchScore is rejected", VALID_ANALYSIS.replace("72", "150"));
await rejectsValidation("NaN matchScore is rejected", VALID_ANALYSIS.replace("72", '"abc"'));

await test("fenced markdown JSON is accepted", () => {
  const out = validateAndNormalizeAnalysis("```json\n" + VALID_ANALYSIS + "\n```");
  assert.equal(out.matchScore, 72);
});
await test("boundary scores 0 and 100 are accepted", () => {
  for (const score of [0, 100]) {
    const out = validateAndNormalizeAnalysis(VALID_ANALYSIS.replace("72", String(score)));
    assert.equal(out.matchScore, score);
  }
});
await test("keyword analysis is case-insensitively deduped", () => {
  const out = validateAndNormalizeAnalysis(
    VALID_ANALYSIS.replace('["React"]', '["React", "react", "REACT"]'),
  );
  assert.deepEqual(out.keywordAnalysis.matched, ["React"]);
});
await test("empty arrays are valid (fields required, not non-empty)", () => {
  const out = validateAndNormalizeAnalysis(VALID_ANALYSIS.replace(
    /\{[\s\S]*\}/,
    JSON.stringify({
      matchScore: 50, matchSummary: "", strengths: [], missingSkills: [],
      partialMatches: [], keywordAnalysis: { matched: [], missing: [] },
      resumeIssues: [], bulletSuggestions: [], actionPlan: [],
    }),
  ));
  assert.equal(out.strengths.length, 0);
});

// ---------- C. Retry & time-budget bounds ----------
console.log("=== C. Retry & time-budget bounds ===");

function stubClient(behavior) {
  let calls = 0;
  return {
    calls: () => calls,
    models: {
      async *list() { yield { name: "models/gemini-3.6-flash" }; },
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

async function withStub(behavior, fn) {
  const prevClient = gemini._client;
  const prevFallback = gemini._fallbackAvailable;
  gemini._client = stubClient(behavior);
  gemini._fallbackAvailable = null;
  try {
    await fn();
  } finally {
    gemini._client = prevClient;
    gemini._fallbackAvailable = prevFallback;
  }
}

await test("fast 503s: full retry ladder runs (3 primary + fallback succeeds)", async () => {
  await withStub((n, model) => (model === gemini.model ? transient503() : { text: '{"ok":1}' }), async () => {
    const started = Date.now();
    const text = await gemini.generateContent("p");
    const elapsed = Date.now() - started;
    assert.equal(text, '{"ok":1}');
    assert.equal(gemini._client.calls(), 4); // 3 primary + 1 fallback
    assert.ok(elapsed < 5_000, `fast-failure path took ${elapsed}ms, expected quick`);
  });
});

await test("slow hanging attempts: overall deadline caps total wait and attempts", async () => {
  // Hang past the per-attempt timeout; the race must reject at ~timeout each try.
  const prevTimeout = env.aiRequestTimeoutMs;
  const prevBudget = env.aiTotalBudgetMs;
  env.aiRequestTimeoutMs = 100;
  env.aiTotalBudgetMs = 250; // room for ~2 timed-out attempts, not 3 + fallback
  try {
    await withStub(() => new Promise(() => {}), async () => { // hangs forever
      const started = Date.now();
      await assert.rejects(
        () => gemini.generateContent("p"),
        (e) => e.statusCode === 503 && e.details === "AI_UNAVAILABLE",
      );
      const elapsed = Date.now() - started;
      const attempts = gemini._client.calls();
      assert.ok(elapsed < 1_500, `hanging provider held the request ${elapsed}ms`);
      assert.ok(attempts <= 2, `expected ≤2 attempts within budget, got ${attempts}`);
    });
  } finally {
    env.aiRequestTimeoutMs = prevTimeout;
    env.aiTotalBudgetMs = prevBudget;
  }
});

await test("every transient 503 is retried, never surfacing provider text", async () => {
  await withStub(() => Object.assign(new Error("backendSECRET detail xyz"), { status: 503 }), async () => {
    await assert.rejects(
      () => gemini.generateContent("p"),
      (e) => e.statusCode === 503 && !e.message.includes("SECRET"),
    );
  });
});

// ---------- D. HTTP input limits ----------
console.log("=== D. HTTP input limits ===");

function buildMultipart(fields = {}, file) {
  const boundary = `----lim${Date.now()}${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    chunks.push(file.content);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), boundary };
}

const tinyPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);
const okJd = "We are hiring a React developer with Node.js experience. Remote friendly team. ".repeat(2);
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api/analysis`;

async function postAnalysis(fields, file) {
  const { body, boundary } = buildMultipart(fields, file);
  const res = await fetch(base, {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

await test("JD shorter than 40 chars → 400 validation error", async () => {
  const { status } = await postAnalysis(
    { jobDescription: "too short" },
    { name: "r.pdf", type: "application/pdf", content: tinyPdf },
  );
  assert.ok(status === 400, `got ${status}`);
});

await test("JD longer than 20,000 chars → 400 validation error", async () => {
  const { status, json } = await postAnalysis(
    { jobDescription: "x".repeat(env.maxJobDescriptionLength + 1) },
    { name: "r.pdf", type: "application/pdf", content: tinyPdf },
  );
  assert.equal(status, 400);
  assert.ok(String(json?.message ?? "").includes("too long"));
});

await test("no file attached → 400, not 500", async () => {
  const { status } = await postAnalysis({ jobDescription: okJd });
  assert.equal(status, 400);
});

await test("non-PDF upload → rejected (4xx), never analyzed", async () => {
  const { status } = await postAnalysis(
    { jobDescription: okJd },
    { name: "r.txt", type: "text/plain", content: Buffer.from("not a pdf") },
  );
  assert.ok(status >= 400 && status < 500, `got ${status}`);
});

await test("oversized PDF (> 5MB) → rejected, never analyzed", async () => {
  const bigPdf = Buffer.concat([tinyPdf, Buffer.alloc(5 * 1024 * 1024, 0)]);
  const { status } = await postAnalysis(
    { jobDescription: okJd },
    { name: "big.pdf", type: "application/pdf", content: bigPdf },
  );
  assert.ok(status >= 400 && status < 500, `got ${status}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
server.close();
process.exitCode = failed > 0 ? 1 : 0;
