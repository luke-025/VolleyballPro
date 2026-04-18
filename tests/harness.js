// tests/harness.js
// Loads the browser-style IIFE modules (engine.js) into Node by shimming `window`,
// so the pure logic can be exercised with `node --test`. We use `new Function` (not `vm`)
// to keep prototypes aligned with the test runner — otherwise `deepStrictEqual` fails
// because arrays/objects created in a `vm` context have different prototypes.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Node 22 has global crypto.randomUUID already; engine.js uses it as a free variable.
if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
  globalThis.crypto = { randomUUID: () => crypto.randomUUID() };
}

function loadEngine() {
  const enginePath = path.resolve(__dirname, "..", "js", "engine.js");
  const code = fs.readFileSync(enginePath, "utf8");
  const win = {};
  // Wrap the IIFE source; `window` becomes a local binding, engine attaches VPEngine to it.
  const runner = new Function("window", code);
  runner(win);
  if (!win.VPEngine) {
    throw new Error("engine.js did not expose window.VPEngine");
  }
  return win.VPEngine;
}

// Helpful builders for tests -------------------------------------------------

function makeMatch(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    stage: overrides.stage ?? "group",
    group: overrides.group ?? "A",
    teamAId: overrides.teamAId ?? "team-a",
    teamBId: overrides.teamBId ?? "team-b",
    sets: overrides.sets ?? [
      { a: 0, b: 0 },
      { a: 0, b: 0 },
      { a: 0, b: 0 },
    ],
    status: overrides.status ?? "pending",
    winner: overrides.winner ?? null,
    events: overrides.events ?? [],
    ...overrides,
  };
}

// Play a match from 0:0 by feeding a script of "a"/"b" rally winners.
function playMatch(engine, match, script) {
  let m = engine.emptyMatchPatch(match);
  for (const side of script) {
    m = engine.addPoint(m, side, +1);
    if (m.status === "finished") break;
  }
  return m;
}

function run(side, n) {
  return Array(n).fill(side);
}

module.exports = { loadEngine, makeMatch, playMatch, run };
