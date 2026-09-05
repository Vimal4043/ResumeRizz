/*
 * Standalone, framework-free test for the pure stage-progression logic.
 * Runs with plain Node (no fake timers needed — stageAtElapsed is a pure
 * function of elapsed time), covering the loading-behavior contract:
 *
 *   A. Fast API response      -> only early stages are ever shown
 *   B. Normal response        -> strictly forward, one-way progression
 *   C. Slow response          -> advances through many stages, no repetition/looping
 *   D. Very slow response     -> holds at the final stage indefinitely
 *
 * Run from the `client` package:  node test/analysisStages.test.js
 */
import { strict as assert } from "node:assert";
import {
  ANALYSIS_STAGES,
  stageAtElapsed,
  finalStageIndex,
  isFinalStage,
} from "../src/utils/analysisStages.js";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  \u2713 " + name);
  } catch (e) {
    failed += 1;
    console.error("  \u2717 " + name);
    console.error("    " + e.message);
  }
}

// --- Stage list shape -----------------------------------------------------
check("has between 12 and 16 stages", () => {
  assert.ok(
    ANALYSIS_STAGES.length >= 12 && ANALYSIS_STAGES.length <= 16,
    `got ${ANALYSIS_STAGES.length} stages`,
  );
});

check("final stage is a holding stage (durationMs null)", () => {
  const last = ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1];
  assert.equal(last.durationMs, null);
});

check("no empty/filler labels and all unique", () => {
  const labels = new Set();
  for (const s of ANALYSIS_STAGES) {
    assert.ok(s.label.trim().length > 0, "empty label");
    assert.ok(!labels.has(s.label), `duplicate label: ${s.label}`);
    labels.add(s.label);
  }
});

check("every non-final stage has a positive duration", () => {
  for (let i = 0; i < ANALYSIS_STAGES.length - 1; i++) {
    assert.ok(
      ANALYSIS_STAGES[i].durationMs > 0,
      `non-positive duration at index ${i}`,
    );
  }
});

const totalHoldThreshold = ANALYSIS_STAGES.slice(0, -1).reduce(
  (sum, s) => sum + s.durationMs,
  0,
);
const finalIndex = finalStageIndex(ANALYSIS_STAGES);

// --- A. Fast response -----------------------------------------------------
check("A. fast response: stays on early stages", () => {
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, 0), 0);
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, 400), 0);
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, 1100), 0); // not yet past stage 0
});

// --- Timing boundaries ----------------------------------------------------
check("advances to stage 1 exactly at the first boundary", () => {
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, 1200), 1);
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, 1201), 1);
});

// --- B. Normal response ---------------------------------------------------
check("B. normal response: strictly forward, never loops back", () => {
  let prev = stageAtElapsed(ANALYSIS_STAGES, 0);
  assert.equal(prev, 0);
  let lastSeen = prev;
  for (let t = 500; t <= 12000; t += 500) {
    const next = stageAtElapsed(ANALYSIS_STAGES, t);
    assert.ok(next >= prev, `regression at ${t}ms: ${prev} -> ${next}`);
    prev = next;
    lastSeen = next;
  }
  // A ~12s request should have moved well past the opening stages.
  assert.ok(lastSeen >= 5, `expected progress past stage 5 by 12s, got ${lastSeen}`);
});

// --- Monotonicity ---------------------------------------------------------
check("stageAtElapsed is monotonically non-decreasing", () => {
  let prev = stageAtElapsed(ANALYSIS_STAGES, 0);
  for (let t = 300; t < 80000; t += 300) {
    const cur = stageAtElapsed(ANALYSIS_STAGES, t);
    assert.ok(cur >= prev, `non-monotonic at ${t}ms: ${prev} -> ${cur}`);
    prev = cur;
  }
});

// --- C. Slow response -----------------------------------------------------
check("C. slow response: passes through many stages without repetition", () => {
  const seen = [];
  let prev = -1;
  for (let t = 0; t <= totalHoldThreshold; t += 1000) {
    const s = stageAtElapsed(ANALYSIS_STAGES, t);
    assert.ok(s >= prev, `regression at ${t}ms: ${prev} -> ${s}`);
    if (s !== prev) seen.push(s);
    prev = s;
  }
  // Should climb through a good chunk of the unique stages (no cycling).
  assert.ok(seen.length >= 8, `only advanced through ${seen.length} stages`);
  assert.ok(seen[0] === 0, "should start at stage 0");
});

// --- D. Very slow response ------------------------------------------------
check("D. very slow response: holds at the final stage, never cycles", () => {
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, totalHoldThreshold), finalIndex);
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, totalHoldThreshold + 5_000), finalIndex);
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, 999_999), finalIndex);
  assert.equal(stageAtElapsed(ANALYSIS_STAGES, 999_999_999), finalIndex);
  assert.equal(isFinalStage(ANALYSIS_STAGES, finalIndex), true);
  assert.equal(isFinalStage(ANALYSIS_STAGES, 0), false);
});

// --- Hook clamp contract --------------------------------------------------
// The hook uses `next > current ? next : current`. Even if stageAtElapsed
// were ever called out of order, the stage must never regress.
check("hook clamp never regresses the stage", () => {
  let current = 0;
  for (let t = 0; t < 80_000; t += 400) {
    const next = stageAtElapsed(ANALYSIS_STAGES, t);
    current = next > current ? next : current;
    assert.ok(current >= next, "clamp invariant violated");
  }
  assert.equal(current, finalIndex);
});

// --- Bounds ---------------------------------------------------------------
check("never returns an index past the final stage", () => {
  for (let t = 0; t < 80_000; t += 250) {
    const s = stageAtElapsed(ANALYSIS_STAGES, t);
    assert.ok(s <= finalIndex, `index ${s} past final ${finalIndex} at ${t}ms`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
