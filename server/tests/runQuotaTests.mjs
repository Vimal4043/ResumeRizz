/**
 * Analysis quota & cooldown tests (guest daily cap via express-rate-limit).
 *
 * Run with: node server/tests/runQuotaTests.mjs
 *
 * Uses a LOW guest daily limit (3) to verify the 429 behavior with real HTTP
 * requests against the app. The authenticated daily cap (20/day, MongoDB) and
 * the 10-minute cooldown (needs successful analyses) require a live DB +
 * Gemini key and are verified by the persistence flow / manually.
 *
 * NOTE: cooldown state is per process — failed requests never start it.
 */
// Must be set BEFORE env.js loads (ESM import hoisting → dynamic import).
process.env.GUEST_DAILY_ANALYSIS_LIMIT = "3";

const { app } = await import("../app.js");
const { env } = await import("../config/env.js");
import assert from "node:assert/strict";

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

async function post() {
  const res = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobDescription: "no file here" }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

if (env.guestDailyAnalysisLimit !== 3) {
  console.error(`Expected guest limit override of 3, got ${env.guestDailyAnalysisLimit}`);
  process.exitCode = 1;
} else {
  await test("requests 1-3 pass the guest daily limiter (400 validation, not 429)", async () => {
    for (let i = 0; i < env.guestDailyAnalysisLimit; i++) {
      const { status } = await post();
      assert.ok(status === 400, `request ${i + 1}: got ${status}, expected 400`);
    }
  });

  await test("request 4 hits the guest daily cap → 429 GUEST_DAILY_ANALYSIS_LIMIT_REACHED", async () => {
    const { status, json } = await post();
    assert.equal(status, 429);
    assert.equal(json?.error?.code, "GUEST_DAILY_ANALYSIS_LIMIT_REACHED");
    assert.match(json?.error?.message ?? json?.message ?? "", /daily limit/i);
  });

  await test("the cap keeps rejecting (not just once)", async () => {
    const { status, json } = await post();
    assert.equal(status, 429);
    assert.equal(json?.error?.code, "GUEST_DAILY_ANALYSIS_LIMIT_REACHED");
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
server.close();
process.exitCode = failed > 0 ? 1 : 0;
