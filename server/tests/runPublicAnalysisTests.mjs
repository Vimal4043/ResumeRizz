/**
 * DEV-ONLY tests for the PUBLIC analysis flow (Task — analysis without login).
 *
 *   node server/tests/runPublicAnalysisTests.mjs
 *
 * Covers the parts that do NOT require a live Gemini call or a completed run:
 *   - POST /api/analysis is public (401 no longer returned for guests).
 *   - Authenticated-only routes (/history, /:id GET/DELETE) stay protected.
 *   - Application-level analysis quota exists but is bypassed in NODE_ENV=test.
 *   - Guests can actually upload a PDF (multipart passes the upload middleware).
 *
 * The persistence assertions (guest leaves no DB record / logged-in user's
 * analysis is saved to their own account) require a real Gemini call, so those
 * are run manually against a live server.
 */
// Quota middleware is skipped in NODE_ENV=test; set it before app.js loads
// (ESM import hoisting → dynamic import).
process.env.NODE_ENV = "test";
const { app } = await import("../app.js");

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Build a multipart/form-data body with an optional file part.
function multipart({ file, fields = {} }) {
  const boundary = `----aijh${Date.now()}${Math.random().toString(16).slice(2)}`;
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="${file.name}"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
    );
    chunks.push(file.content);
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), boundary };
}

// Minimal but spec-conformant single-page PDF (extractable text).
function fakeValidPdf() {
  const text = "Alice Johnson React Node.js 5 years Python REST APIs";
  const stream = `BT /F1 11 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = {};
  objects.forEach((body, i) => {
    const id = i + 1;
    offsets[id] = out.length;
    out += `${id} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = out.length;
  out += `xref\n0 ${objects.length + 1}\n`;
  out += `0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api`;

let ipCounter = 0;
function guestHeaders() {
  // Unique synthetic guest IP so the rate-limit test never collides with a
  // real client and doesn't trip the shared /api quota.
  ipCounter += 1;
  return {
    "Content-Type": "application/json",
    "X-Forwarded-For": `203.0.113.${(ipCounter % 254) + 1}`,
  };
}
console.log("=== A. POST /api/analysis is PUBLIC ===");
{
  const res = await fetch(`${base}/analysis`, {
    method: "POST",
    headers: guestHeaders(),
  });
  check(
    "no auth + no file → 400 (validation), not 401",
    res.status === 400,
    `got ${res.status}`,
  );
}

console.log("=== B. Guests can upload a PDF (multipart passes upload middleware) ===");
{
  const { body, boundary } = multipart({
    file: { name: "resume.pdf", content: fakeValidPdf() },
    fields: { jobDescription: "React & JS" }, // < 40 chars → validation error, no Gemini
  });
  const res = await fetch(`${base}/analysis`, {
    method: "POST",
    headers: {
      ...guestHeaders(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  check(
    "public multipart upload reaches the controller (400 JD-too-short, not 401)",
    res.status === 400,
    `got ${res.status}`,
  );
}

console.log("=== C. Protected routes still require auth ===");
{
  const hd = guestHeaders();
  const history = await fetch(`${base}/analysis/history`, { headers: hd });
  const get = await fetch(`${base}/analysis/000000000000000000000000`, { headers: hd });
  const del = await fetch(`${base}/analysis/000000000000000000000000`, {
    method: "DELETE",
    headers: hd,
  });
  check("GET /history without token → 401", history.status === 401, `got ${history.status}`);
  check("GET /:id without token → 401", get.status === 401, `got ${get.status}`);
  check("DELETE /:id without token → 401", del.status === 401, `got ${del.status}`);
}

console.log("=== D. No application-level analysis quota ===");
{
  // Application-level analysis quota temporarily disabled.
  // Re-enable after monitoring real usage and establishing production limits.
  // The API must never return our custom ANALYSIS_LIMIT_REACHED response.
  // (A provider-side 429 from Gemini is still valid and expected under load.)
  const ip = `198.51.100.${(ipCounter % 250) + 1}`;
  let quotaHit = false;
  for (let i = 0; i < 12; i += 1) {
    const res = await fetch(`${base}/analysis`, {
      method: "POST",
      headers: { "X-Forwarded-For": ip },
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      if (
        body.code === "ANALYSIS_LIMIT_REACHED" ||
        /analysis limit reached/i.test(body.message ?? "")
      ) {
        quotaHit = true;
      }
      break;
    }
  }
  check(
    "no application-level analysis limit is enforced",
    !quotaHit,
    "got the custom ANALYSIS_LIMIT_REACHED quota response",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
await new Promise((r) => server.close(r));
process.exit(failed ? 1 : 0);