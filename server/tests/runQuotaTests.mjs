/**
 * Guest quota & cooldown tests (success-only model).
 *
 * Run with: node server/tests/runQuotaTests.mjs
 *
 * Verifies the guest quota/cooldown fix: a usage unit is consumed ONLY on a
 * fully successful analysis. Cooldown rejections, validation failures, and AI
 * failures must never increment guest usage, and repeated clicks during
 * cooldown must leave usage unchanged.
 *
 * The AI layer is stubbed (analysisService.analyzeResume) so no real Gemini
 * calls are made. The guest quota path is in-memory, so no MongoDB is needed.
 * A small test seam in analysisQuotaMiddleware.js fast-forwards the
 * 10-minute cooldown so the suite finishes in milliseconds.
 *
 * The request IP is pinned via X-Forwarded-For (the app trusts 1 proxy hop)
 * so the in-memory per-IP state is observed directly via getGuestDailyCount.
 */
import assert from "node:assert/strict";

// Env overrides must be set before app.js is dynamically imported (ESM imports
// are hoisted, so a static import would load env.js too early).
process.env.GUEST_DAILY_ANALYSIS_LIMIT = "3";

const { app } = await import("../app.js");
const { env } = await import("../config/env.js");
const { analysisService } = await import("../services/ai/analysisService.js");
const {
  getGuestDailyCount,
  __testClearGuestState,
  __testAdvanceGuestCooldowns,
} = await import("../middleware/analysisQuotaMiddleware.js");
import { AppError } from "../utils/errors.js";

const TEST_IP = "203.0.113.42";
const COOLDOWN_MS = env.analysisCooldownMs; // 600_000 (10 min) by default

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

const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api/analysis`;

const tinyPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Page 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);
const okJd = "We are hiring a React developer with Node.js experience. Remote friendly team. ".repeat(2);

// Reuses the proven multipart builder shape (cf. runErrorContractTests.mjs).
function multipart(file) {
  const boundary = `----q${Date.now()}${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  chunks.push(
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="jobDescription"\r\n\r\n${okJd}\r\n`),
  );
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="r.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
    );
    chunks.push(file);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), boundary };
}

async function post(file) {
  const { body, boundary } = multipart(file);
  const res = await fetch(base, {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "X-Forwarded-For": TEST_IP,
    },
    body,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ---- AI stub management ----
const realAnalyze = analysisService.analyzeResume;
function stubSuccess() {
  analysisService.analyzeResume = async () => ({
    analysis: {
      matchScore: 80,
      matchSummary: "Good fit.",
      strengths: [{ title: "React", explanation: "Strong.", evidence: ["Built apps"] }],
      missingSkills: [],
      partialMatches: [],
      keywordAnalysis: { matched: ["React"], missing: [] },
      resumeIssues: [],
    },
    structuredResume: {},
    resumeText: "resume text",
  });
}
function stubFailure(error) {
  analysisService.analyzeResume = async () => {
    throw error;
  };
}
function restore() {
  analysisService.analyzeResume = realAnalyze;
}

// Fast-forward the per-IP cooldown into the past (expires it).
function expireCooldown() {
  __testAdvanceGuestCooldowns(COOLDOWN_MS + 1000);
}

try {
  __testClearGuestState();
  console.log("=== Guest quota & cooldown (success-only) ===\n");

  // 1) Successful analysis -> usage 1, cooldown starts.
  stubSuccess();
  await test("successful analysis counts as 1 usage unit", async () => {
    const { status, json } = await post(tinyPdf);
    assert.equal(status, 200, `got ${status} ${JSON.stringify(json)}`);
    assert.equal(json?.success, true);
    assert.equal(getGuestDailyCount(TEST_IP), 1);
  });

  // 2) 20 clicks DURING cooldown -> all rejected as cooldown, usage stays 1.
  stubSuccess();
  await test("20 repeated clicks during cooldown do NOT consume quota", async () => {
    for (let i = 0; i < 20; i++) {
      const { status, json } = await post(tinyPdf);
      assert.equal(status, 429, `click ${i + 1}: got ${status}`);
      assert.equal(json?.error?.code, "ANALYSIS_COOLDOWN");
    }
    assert.equal(getGuestDailyCount(TEST_IP), 1, "usage must remain 1");
  });

  // 3) Cooldown expires -> another success -> usage 2.
  expireCooldown();
  stubSuccess();
  await test("after cooldown, a successful analysis increments to 2", async () => {
    const { status } = await post(tinyPdf);
    assert.equal(status, 200);
    assert.equal(getGuestDailyCount(TEST_IP), 2);
  });

  // 4) Validation failure (no resume) -> 400, usage unchanged (still 2).
  expireCooldown();
  stubSuccess();
  await test("validation failure (missing resume) does NOT consume quota", async () => {
    const { status, json } = await post(null);
    assert.equal(status, 400);
    assert.equal(json?.error?.code, "RESUME_REQUIRED");
    assert.equal(getGuestDailyCount(TEST_IP), 2);
  });

  // 5) AI failure (Gemini 503) -> 503, usage unchanged, cooldown NOT started.
  stubFailure(new AppError("gemini unavailable", 503, "AI_UNAVAILABLE"));
  await test("a Gemini failure does NOT consume quota or start cooldown", async () => {
    const { status, json } = await post(tinyPdf);
    assert.equal(status, 503, `got ${status}`);
    assert.equal(json?.error?.code, "AI_UNAVAILABLE");
    assert.equal(getGuestDailyCount(TEST_IP), 2);
  });

  // 6) Proving no cooldown was started by the failure: immediate retry succeeds.
  stubSuccess();
  await test("no cooldown started by failure -> immediate retry succeeds (usage 3)", async () => {
    const { status } = await post(tinyPdf);
    assert.equal(status, 200);
    assert.equal(getGuestDailyCount(TEST_IP), 3);
  });

  // 7) Daily quota reached -> 429 ANALYSIS_QUOTA_EXCEEDED, usage stays 3.
  expireCooldown();
  stubSuccess();
  await test("reaching the daily limit -> 429 QUOTA_EXCEEDED, usage stays 3", async () => {
    const { status, json } = await post(tinyPdf);
    assert.equal(status, 429);
    assert.equal(json?.error?.code, "ANALYSIS_QUOTA_EXCEEDED");
    assert.equal(getGuestDailyCount(TEST_IP), 3);
  });

  // 8) Further requests stay quota-exceeded; usage frozen at 3.
  stubSuccess();
  await test("further requests keep returning quota-exceeded (usage frozen at 3)", async () => {
    const { status, json } = await post(tinyPdf);
    assert.equal(status, 429);
    assert.equal(json?.error?.code, "ANALYSIS_QUOTA_EXCEEDED");
    assert.equal(getGuestDailyCount(TEST_IP), 3);
  });
} finally {
  restore();
  __testClearGuestState();
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;