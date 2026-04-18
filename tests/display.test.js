// tests/display.test.js
// Tests for the pure schedule-sorting/grouping helpers in js/display.js
// AND regression tests: adding `scheduledAt` to a match must not change
// anything the engine computes (standings, winners, playoffs progression).

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { loadEngine, makeMatch } = require("./harness");

if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
  globalThis.crypto = { randomUUID: () => crypto.randomUUID() };
}

// Load display.js into a synthetic window; it exposes VPDisplay with pure helpers.
function loadDisplay() {
  const code = fs.readFileSync(
    path.resolve(__dirname, "..", "js", "display.js"),
    "utf8"
  );
  const win = {};
  // Provide the globals display.js touches at import time. VP_UI + VPEngine
  // are used by the `boot()` path, not by the pure helpers, so empty shims are fine.
  // Pretend the document is still loading, so display.js registers a
  // DOMContentLoaded listener (which we never fire) instead of calling boot().
  const doc = {
    readyState: "loading",
    addEventListener() {},
    getElementById: () => null,
  };
  const fn = new Function("window", "document", code);
  fn(win, doc);
  if (!win.VPDisplay) throw new Error("display.js did not expose window.VPDisplay");
  return win.VPDisplay;
}

const D = loadDisplay();
const E = loadEngine();

// ---------------------------------------------------------------------------
// sortSchedule
// ---------------------------------------------------------------------------
describe("sortSchedule", () => {
  test("sorts by scheduledAt when present", () => {
    const ms = [
      makeMatch({ id: "m1", scheduledAt: "11:00" }),
      makeMatch({ id: "m2", scheduledAt: "09:30" }),
      makeMatch({ id: "m3", scheduledAt: "10:15" }),
    ];
    const sorted = D.sortSchedule(ms, []);
    assert.deepEqual(sorted.map((m) => m.id), ["m2", "m3", "m1"]);
  });

  test("matches WITH a time come before matches without", () => {
    const ms = [
      makeMatch({ id: "m1" }),
      makeMatch({ id: "m2", scheduledAt: "10:00" }),
      makeMatch({ id: "m3" }),
    ];
    const sorted = D.sortSchedule(ms, []);
    assert.equal(sorted[0].id, "m2");
  });

  test("falls back to queue order when no times are set", () => {
    const ms = [
      makeMatch({ id: "m1" }),
      makeMatch({ id: "m2" }),
      makeMatch({ id: "m3" }),
    ];
    const queue = [{ matchId: "m3" }, { matchId: "m1" }, { matchId: "m2" }];
    const sorted = D.sortSchedule(ms, queue);
    assert.deepEqual(sorted.map((m) => m.id), ["m3", "m1", "m2"]);
  });

  test("falls back to stage order when no times and no queue", () => {
    const ms = [
      makeMatch({ id: "final", stage: "final" }),
      makeMatch({ id: "group", stage: "group" }),
      makeMatch({ id: "qf", stage: "quarterfinal" }),
    ];
    const sorted = D.sortSchedule(ms, []);
    assert.deepEqual(sorted.map((m) => m.id), ["group", "qf", "final"]);
  });
});

// ---------------------------------------------------------------------------
// groupByCourt
// ---------------------------------------------------------------------------
describe("groupByCourt", () => {
  test("groups matches by court with numeric-first ordering", () => {
    const ms = [
      makeMatch({ id: "m1", court: "2" }),
      makeMatch({ id: "m2", court: "1" }),
      makeMatch({ id: "m3", court: "A" }),
      makeMatch({ id: "m4", court: "2" }),
      makeMatch({ id: "m5", court: "" }),
    ];
    const groups = D.groupByCourt(ms);
    const keys = groups.map(([k]) => k);
    // Numeric courts come first (asc), then non-numeric in locale "pl" order.
    assert.equal(keys[0], "1");
    assert.equal(keys[1], "2");
    // Both "A" and "—" end up after numeric courts; exact order depends on
    // locale collation, so we only check the set.
    assert.deepEqual(keys.slice(2).sort(), ["A", "—"].sort());
    const court2 = groups.find(([k]) => k === "2")[1];
    assert.equal(court2.length, 2);
  });

  test("empty input yields empty array", () => {
    assert.deepEqual(D.groupByCourt([]), []);
  });
});

// ---------------------------------------------------------------------------
// Regression — adding scheduledAt must NOT affect engine outputs
// ---------------------------------------------------------------------------
describe("scheduledAt regression", () => {
  function confirmedWith(overrides) {
    return makeMatch({ status: "confirmed", ...overrides });
  }

  test("scheduledAt on matches does not affect computeStandings", () => {
    const teams = [
      { id: "t1", name: "Alfa", group: "A" },
      { id: "t2", name: "Beta", group: "A" },
    ];
    const noTime = [
      confirmedWith({
        teamAId: "t1",
        teamBId: "t2",
        sets: [{ a: 25, b: 20 }, { a: 25, b: 22 }, { a: 0, b: 0 }],
      }),
    ];
    const withTime = [
      confirmedWith({
        teamAId: "t1",
        teamBId: "t2",
        scheduledAt: "10:30",
        sets: [{ a: 25, b: 20 }, { a: 25, b: 22 }, { a: 0, b: 0 }],
      }),
    ];
    const a = E.computeStandings({ teams, matches: noTime });
    const b = E.computeStandings({ teams, matches: withTime });
    // Strip teamId order-preservation isn't the concern — just compare point rows.
    assert.deepEqual(
      a.A.map((r) => [r.teamId, r.tablePoints]),
      b.A.map((r) => [r.teamId, r.tablePoints])
    );
  });

  test("emptyMatchPatch preserves scheduledAt field (does not strip it)", () => {
    const m = E.emptyMatchPatch({ scheduledAt: "10:30", sets: [{a:0,b:0},{a:0,b:0},{a:0,b:0}] });
    assert.equal(m.scheduledAt, "10:30");
  });
});
