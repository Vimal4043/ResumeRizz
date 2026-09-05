/**
 * Error-contract tests for the analysis endpoint.
 *
 * Run with: node server/tests/runErrorContractTests.mjs
 *
 * Verifies the standardized failure shape for every input error:
 *   { success: false, message, error: { code, message } }
 * and that no generic "check your PDF..." hint text is ever attached, and no
 * internals (stack traces, paths) leak.
 */
// Quota middleware is skipped in NODE_ENV=test; set it before app.js loads.
process.env.NODE_ENV = "test";
const { app } = await import("../app.js");
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

const tinyPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);
const okJd = "We are hiring a React developer with Node.js experience. Remote friendly team. ".repeat(2);

function multipart(fields = {}, file) {
  const boundary = `----err${Date.now()}${Math.random().toString(16).slice(2)}`;
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

async function post(fields, file) {
  const { body, boundary } = multipart(fields, file);
  const res = await fetch(base, {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/**
 * Assert the full error contract: status, machine-readable code, user-safe
 * message, and the absence of the generic PDF/JD hint or internals.
 */
async function expectError(name, promise, { status, code, messageIncludes }) {
  await test(name, async () => {
    const { status: actualStatus, json } = await promise;
    assert.equal(actualStatus, status);
    assert.equal(json?.success, false);
    assert.equal(json?.error?.code, code);
    assert.equal(typeof json?.error?.message, "string");
    assert.ok(json?.error?.message.length > 5);
    assert.equal(json?.message, json?.error?.message); // legacy alias in sync
    assert.ok(!json?.stack, "stack traces must never leak");
    if (messageIncludes) {
      assert.ok(json.error.message.toLowerCase().includes(messageIncludes));
    }
    // The banned generic hint must never appear anywhere in the payload.
    assert.ok(
      !JSON.stringify(json).includes("Check that your PDF has selectable text"),
      "generic input hint must not be attached to errors",
    );
  });
}

console.log("=== Analysis error contract ===");
await expectError(
  "no resume → 400 RESUME_REQUIRED",
  post({ jobDescription: okJd }),
  { status: 400, code: "RESUME_REQUIRED", messageIncludes: "upload a pdf resume" },
);
await expectError(
  "missing JD → 400 JOB_DESCRIPTION_REQUIRED",
  post({}, { name: "r.pdf", type: "application/pdf", content: tinyPdf }),
  { status: 400, code: "JOB_DESCRIPTION_REQUIRED", messageIncludes: "paste the job description" },
);
await expectError(
  "short JD → 400 JOB_DESCRIPTION_TOO_SHORT",
  post({ jobDescription: "too short" }, { name: "r.pdf", type: "application/pdf", content: tinyPdf }),
  { status: 400, code: "JOB_DESCRIPTION_TOO_SHORT", messageIncludes: "too short" },
);
await expectError(
  "oversized PDF → 413 FILE_TOO_LARGE",
  post(
    { jobDescription: okJd },
    { name: "big.pdf", type: "application/pdf", content: Buffer.concat([tinyPdf, Buffer.alloc(5 * 1024 * 1024, 0)]) },
  ),
  { status: 413, code: "FILE_TOO_LARGE", messageIncludes: "too large" },
);
await expectError(
  "non-PDF upload → 400 INVALID_FILE_TYPE",
  post({ jobDescription: okJd }, { name: "r.txt", type: "text/plain", content: Buffer.from("nope") }),
  { status: 400, code: "INVALID_FILE_TYPE", messageIncludes: "pdf" },
);

await test("long JD → 400 JOB_DESCRIPTION_TOO_LONG", async () => {
  const { status, json } = await post(
    { jobDescription: "x".repeat(20001) },
    { name: "r.pdf", type: "application/pdf", content: tinyPdf },
  );
  assert.equal(status, 400);
  assert.equal(json?.error?.code, "JOB_DESCRIPTION_TOO_LONG");
});

await test("unknown route → 404 NOT_FOUND with standard shape", async () => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/definitely-not-real`);
  const json = await res.json().catch(() => null);
  assert.equal(res.status, 404);
  assert.equal(json?.error?.code, "NOT_FOUND");
  assert.equal(json?.success, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
server.close();
process.exitCode = failed > 0 ? 1 : 0;
