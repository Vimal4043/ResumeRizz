/** DEV-ONLY persistence flow test. Requires MongoDB + live Gemini key.
 *  node server/tests/runPersistenceFlow.mjs
 *  Verifies guest NO-save, authenticated save-to-correct-user, temp PDF cleanup. */
// Quota middleware is skipped in NODE_ENV=test; set it before app.js loads.
process.env.NODE_ENV = "test";
const { app } = await import("../app.js");
const { connectDB, disconnectDB } = await import("../config/db.js");
const { User } = await import("../models/User.js");
const { Resume } = await import("../models/Resume.js");
const { Analysis } = await import("../models/Analysis.js");
const { env } = await import("../config/env.js");
import { readdir } from "node:fs/promises";

let p = 0, f = 0;
const ck = (n, c, d = "") => (c ? (p++, console.log(`  \u2713 ${n}`)) : (f++, console.log(`  \u2717 ${n}${d ? " — " + d : ""}`)));

function pdf() {
  const text = "Alice Johnson React Node.js 5 years Python REST APIs MySQL";
  const stream = `BT /F1 11 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n"; const off = {};
  objs.forEach((b, i) => { const id = i + 1; off[id] = out.length; out += `${id} 0 obj\n${b}\nendobj\n`; });
  const xr = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) out += `${String(off[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

function mp(fields) {
  const b = `----aijh${Date.now()}`; const c = [];
  for (const [k, v] of Object.entries(fields)) c.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  c.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="resume"; filename="r.pdf"\r\nContent-Type: application/pdf\r\n\r\n`));
  c.push(pdf()); c.push(Buffer.from(`\r\n--${b}--\r\n`));
  return { body: Buffer.concat(c), boundary: b };
}

const JD = `Senior Full-Stack Engineer
Requirements: 5+ years software engineering experience. Strong experience
with React, Node.js and PostgreSQL. REST API design.
Preferred: Kubernetes, GraphQL.`;

await connectDB();
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const email = `publicflow_${Date.now()}@test.com`;
const before = {
  analyses: await Analysis.countDocuments({}),
  resumes: await Resume.countDocuments({}),
};

console.log("A. Guest analysis (no token)");
{
  const { body, boundary } = mp({ jobDescription: JD });
  const res = await fetch(`${base}/analysis`, { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "X-Forwarded-For": "192.0.2.10" }, body });
  // The AI provider's own free-tier quota can be exhausted during heavy test
  // runs. That is environmental, not a persistence regression — skip cleanly.
  if (res.status === 429) {
    const b = await res.json().catch(() => ({}));
    if (/temporarily busy|temporarily unavailable/i.test(b.message ?? "")) {
      console.log("SKIP: AI provider quota is exhausted right now.");
      console.log("Re-run `npm run test:persistence` after the quota resets to verify persistence end-to-end.");
      await new Promise((r) => server.close(r));
      await disconnectDB();
      process.exit(0);
    }
  }
  const g = (await res.json()).data;
  ck("guest 200", res.status === 200, res.status);
  ck("guest matchScore present", typeof g.matchScore === "number");
  ck("guest saved=false", g.saved === false, `saved=${g.saved}`);
  ck("guest analysisId null", g.analysisId == null, `id=${g.analysisId}`);
}
console.log("Verify no guest records / no anonymous account");
{
  ck("Analysis count unchanged", (await Analysis.countDocuments({})) === before.analyses);
  ck("Resume count unchanged", (await Resume.countDocuments({})) === before.resumes);
  ck("no anonymous account", (await User.countDocuments({ email })) === 0);
}

let token, userId;
console.log("B. Authenticated analysis");
const reg = await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "FT", email, password: "Passw0rd!" }) });
token = (await reg.json()).data.token;
userId = (await User.findOne({ email }))._id.toString();
let analysisId;
{
  const { body, boundary } = mp({ jobDescription: JD });
  const res = await fetch(`${base}/analysis`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/form-data; boundary=${boundary}` }, body });
  const d = (await res.json()).data;
  ck("auth 200", res.status === 200, res.status);
  ck("auth saved=true", d.saved === true, `saved=${d.saved}`);
  ck("auth analysisId set", Boolean(d.analysisId), `id=${d.analysisId}`);
  analysisId = d.analysisId;
}
{
  const saved = await Analysis.find({ userId });
  ck("exactly 1 analysis owned by user", saved.length === 1, `count=${saved.length}`);
  ck("resume reference present", saved[0]?.resume != null);
  const hist = await fetch(`${base}/analysis/history`, { headers: { Authorization: `Bearer ${token}` } });
  ck("owner history total=1", (await hist.json()).data.total === 1);
}

console.log("D. Cross-user access (User B vs User A's record)");
let tokenB, emailB;
{
  emailB = `publicflow_b_${Date.now()}@test.com`;
  const regB = await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "FT-B", email: emailB, password: "Passw0rd!" }) });
  tokenB = (await regB.json()).data.token;
  const getB = await fetch(`${base}/analysis/${analysisId}`, { headers: { Authorization: `Bearer ${tokenB}` } });
  ck("user B GET user A's analysis → 404", getB.status === 404, getB.status);
  const delB = await fetch(`${base}/analysis/${analysisId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } });
  ck("user B DELETE user A's analysis → 404", delB.status === 404, delB.status);
  const own = await fetch(`${base}/analysis/${analysisId}`, { headers: { Authorization: `Bearer ${token}` } });
  ck("user A can still GET own analysis", own.status === 200, own.status);
}

console.log("E. History newest first");
{
  // Seed two extra records directly (no extra Gemini calls) with staggered dates.
  const resumeDoc = await Resume.create({ userId, originalName: "seed.pdf", resumeText: "seed", structuredResume: {} });
  await Analysis.create({ userId, resume: resumeDoc._id, jobTitle: "Older role", jobDescription: JD, analysis: { matchScore: 10, matchSummary: "", strengths: [], missingSkills: [], partialMatches: [], keywordAnalysis: {}, resumeIssues: [], bulletSuggestions: [], actionPlan: [] }, matchScore: 10, createdAt: new Date(Date.now() - 86400000) });
  await Analysis.create({ userId, resume: resumeDoc._id, jobTitle: "Middle role", jobDescription: JD, analysis: { matchScore: 20, matchSummary: "", strengths: [], missingSkills: [], partialMatches: [], keywordAnalysis: {}, resumeIssues: [], bulletSuggestions: [], actionPlan: [] }, matchScore: 20, createdAt: new Date(Date.now() - 3600000) });
  const hist = await fetch(`${base}/analysis/history`, { headers: { Authorization: `Bearer ${token}` } });
  const items = (await hist.json()).data.items;
  ck("history returns 3 items", items.length === 3, `count=${items.length}`);
  const titles = items.map((i) => i.jobTitle);
  ck("newest first order", titles[0] === "Senior Full-Stack Engineer" && titles[1] === "Middle role" && titles[2] === "Older role", titles.join(" | "));
  ck("history items omit full JD/analysis", !("jobDescription" in items[0]) && !("analysis" in items[0]));
}

console.log("C. Temp PDF cleanup");
{
  const files = await readdir(env.uploadsDir).catch(() => []);
  ck("uploads dir empty after both flows", files.length === 0, files.join(", "));
}

await User.deleteOne({ _id: userId });
await User.deleteOne({ email: emailB });
await Analysis.deleteMany({ userId });
await Resume.deleteMany({ userId });

console.log(`\n${p} passed, ${f} failed`);
await new Promise((r) => server.close(r));
await disconnectDB();
process.exit(f ? 1 : 0);