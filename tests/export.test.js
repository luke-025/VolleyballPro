// tests/export.test.js
// Unit tests for js/export.js — pure data assembly for the XLSX report.
// Run with:  npm test   (or)   node --test tests/

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadEngine } = require("./harness");

// ---------------------------------------------------------------------------
// Load export.js in the same IIFE shim style as engine.js. The export module
// expects `window.VPEngine` — so we load engine first and share the window.
// ---------------------------------------------------------------------------
function loadExport() {
  if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
    globalThis.crypto = { randomUUID: () => crypto.randomUUID() };
  }
  const win = {};
  const enginePath = path.resolve(__dirname, "..", "js", "engine.js");
  const engineCode = fs.readFileSync(enginePath, "utf8");
  new Function("window", engineCode)(win);

  const exportPath = path.resolve(__dirname, "..", "js", "export.js");
  const exportCode = fs.readFileSync(exportPath, "utf8");
  // Pass undefined for `module` so the CommonJS export branch in export.js is skipped.
  new Function("window", "module", exportCode)(win, undefined);
  if (!win.VPExport) throw new Error("export.js did not expose window.VPExport");
  return { XP: win.VPExport, VPEngine: win.VPEngine };
}

const { XP } = loadExport();
const E = loadEngine();

// ---------------------------------------------------------------------------
// Helpers to build a fully-confirmed, fully-scored mini tournament state.
// ---------------------------------------------------------------------------
function team(id, name, group) { return { id, name, group }; }
function confirmed2_0(teamAId, teamBId, scoreA, scoreB, rest = {}) {
  return {
    id: crypto.randomUUID(),
    stage: "group",
    group: rest.group || "A",
    teamAId, teamBId,
    sets: [{ a: scoreA, b: scoreB }, { a: scoreA, b: scoreB }, { a: 0, b: 0 }],
    status: "confirmed",
    winner: "a",
    events: [],
    court: rest.court || "",
    scheduledAt: rest.scheduledAt || "",
    ...rest,
  };
}

// Build 4 groups of 3 teams (12 teams) with all 12 group-stage matches confirmed.
// Each group has 3 matches: T1 beats T2, T1 beats T3, T2 beats T3 — so order is T1>T2>T3.
function buildFullConfirmedGroupState() {
  const teams = [];
  const groups = ["A", "B", "C", "D"];
  for (const g of groups) {
    for (let i = 1; i <= 3; i++) {
      teams.push(team(`${g}${i}`, `${g}${i}-Team`, g));
    }
  }
  const matches = [];
  for (const g of groups) {
    const [t1, t2, t3] = [`${g}1`, `${g}2`, `${g}3`];
    matches.push(confirmed2_0(t1, t2, 25, 10, { group: g }));
    matches.push(confirmed2_0(t1, t3, 25, 12, { group: g }));
    matches.push(confirmed2_0(t2, t3, 25, 15, { group: g }));
  }
  return {
    meta: { name: "Test Cup 2026" },
    teams,
    matches,
    playoffs: null,
  };
}

// Confirm a playoff match with a given winner side ("a" or "b").
function confirmPlayoff(match, winSide) {
  const scoreA = winSide === "a" ? 25 : 10;
  const scoreB = winSide === "b" ? 25 : 10;
  match.sets = [
    { a: scoreA, b: scoreB },
    { a: scoreA, b: scoreB },
    { a: 0, b: 0 },
  ];
  match.status = "confirmed";
  match.winner = winSide;
  return match;
}

function buildFullyCompletedTournament() {
  // Step 1: group stage
  let state = buildFullConfirmedGroupState();
  // Step 2: auto-generate playoffs
  state = E.maybeAutoGeneratePlayoffs(state);
  // Step 3: confirm every playoff match with A-side winner (for determinism)
  //         then re-apply progression after QFs, then confirm SFs, etc.
  const br = state.playoffs.bracket;
  const byId = (id) => state.matches.find(m => m.id === id);

  // QFs
  for (const qfId of br.qf) confirmPlayoff(byId(qfId), "a");
  state = E.applyPlayoffsProgression(state);
  // SFs
  for (const sfId of br.sf) confirmPlayoff(byId(sfId), "a");
  state = E.applyPlayoffsProgression(state);
  // Final + 3rd
  confirmPlayoff(byId(br.final), "a");
  confirmPlayoff(byId(br.third), "a");
  // place9
  for (const pid of br.place9) confirmPlayoff(byId(pid), "a");

  return state;
}

// ---------------------------------------------------------------------------
// isReady / countMissing
// ---------------------------------------------------------------------------
describe("isReady", () => {
  test("false when no matches at all", () => {
    assert.equal(XP.isReady({}), false);
    assert.equal(XP.isReady({ matches: [] }), false);
  });

  test("false when playoffs not generated", () => {
    const st = buildFullConfirmedGroupState();
    // Group stage confirmed but auto-generation not invoked
    assert.equal(XP.isReady(st), false);
  });

  test("false when playoffs generated but not all confirmed", () => {
    let st = buildFullConfirmedGroupState();
    st = E.maybeAutoGeneratePlayoffs(st);
    assert.equal(st.playoffs?.generated, true);
    // QF matches are still pending
    assert.equal(XP.isReady(st), false);
  });

  test("true only when every single match is confirmed + playoffs generated", () => {
    const st = buildFullyCompletedTournament();
    assert.equal(XP.isReady(st), true);
    assert.equal(XP.countMissing(st), 0);
  });
});

describe("countMissing", () => {
  test("counts matches whose status !== confirmed", () => {
    const st = buildFullConfirmedGroupState();
    // All 12 group matches confirmed → 0
    assert.equal(XP.countMissing(st), 0);
    // Flip one back to pending
    st.matches[0].status = "pending";
    assert.equal(XP.countMissing(st), 1);
  });
});

// ---------------------------------------------------------------------------
// buildExportData — shape and contents
// ---------------------------------------------------------------------------
describe("buildExportData", () => {
  test("returns all expected sheets", () => {
    const st = buildFullyCompletedTournament();
    const data = XP.buildExportData(st);
    assert.equal(data.ready, true);
    assert.equal(data.missing, 0);
    const sheetNames = Object.keys(data.sheets);
    for (const expected of [
      "Podsumowanie",
      "Zespoły",
      "Faza grupowa",
      "Tabele grup",
      "Playoff",
      "Klasyfikacja końcowa",
    ]) {
      assert.ok(sheetNames.includes(expected), `missing sheet: ${expected}`);
    }
  });

  test("Zespoły sheet lists all teams sorted by group then name", () => {
    const st = buildFullyCompletedTournament();
    const rows = XP.buildExportData(st).sheets["Zespoły"];
    // Header + 12 teams
    assert.equal(rows.length, 13);
    assert.deepEqual(rows[0], ["Grupa", "Nazwa zespołu"]);
    // Group A rows come first
    assert.equal(rows[1][0], "A");
    assert.equal(rows[2][0], "A");
    assert.equal(rows[3][0], "A");
    assert.equal(rows[4][0], "B");
  });

  test("Faza grupowa sheet has one row per group match + header", () => {
    const st = buildFullyCompletedTournament();
    const rows = XP.buildExportData(st).sheets["Faza grupowa"];
    // 12 matches + 1 header
    assert.equal(rows.length, 13);
    assert.equal(rows[0][0], "Grupa");
    // Every confirmed group match has a winner cell filled
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i][7], `row ${i} missing winner`);
    }
  });

  test("Klasyfikacja końcowa places champion at position 1", () => {
    const st = buildFullyCompletedTournament();
    const rank = XP.buildFinalRanking(st);
    const first = rank.find(r => r.place === "1");
    const second = rank.find(r => r.place === "2");
    const third = rank.find(r => r.place === "3");
    assert.ok(first && first.teamName, "no champion found");
    assert.ok(second && second.teamName, "no vice-champion found");
    assert.ok(third && third.teamName, "no third place found");
    // All three must be distinct
    assert.notEqual(first.teamId, second.teamId);
    assert.notEqual(first.teamId, third.teamId);
    assert.notEqual(second.teamId, third.teamId);
  });

  test("Klasyfikacja końcowa returns all 12 teams across placement tiers", () => {
    const st = buildFullyCompletedTournament();
    const rank = XP.buildFinalRanking(st);
    const placeGroups = rank.reduce((acc, r) => {
      acc[r.place] = (acc[r.place] || 0) + 1;
      return acc;
    }, {});
    assert.equal(placeGroups["1"], 1);
    assert.equal(placeGroups["2"], 1);
    assert.equal(placeGroups["3"], 1);
    assert.equal(placeGroups["4"], 1);
    assert.equal(placeGroups["5-8"], 4);
    assert.equal(placeGroups["9-10"], 2);
    assert.equal(placeGroups["11-12"], 2);
    const total = Object.values(placeGroups).reduce((a, b) => a + b, 0);
    assert.equal(total, 12);
  });

  test("Podsumowanie contains champion name and tournament name", () => {
    const st = buildFullyCompletedTournament();
    const data = XP.buildExportData(st);
    const summary = data.sheets["Podsumowanie"];
    const flat = summary.flat().join("|");
    assert.ok(flat.includes("Test Cup 2026"), "summary missing tournament name");
    const rank = XP.buildFinalRanking(st);
    assert.ok(flat.includes(rank.find(r => r.place === "1").teamName),
      "summary missing champion name");
  });
});

// ---------------------------------------------------------------------------
// pluralMatches — Polish plural helper
// ---------------------------------------------------------------------------
describe("pluralMatches", () => {
  test("1 → mecz", () => assert.equal(XP.pluralMatches(1), "mecz"));
  test("2,3,4 → mecze", () => {
    assert.equal(XP.pluralMatches(2), "mecze");
    assert.equal(XP.pluralMatches(4), "mecze");
  });
  test("5-11 → meczów (including teens)", () => {
    assert.equal(XP.pluralMatches(5), "meczów");
    assert.equal(XP.pluralMatches(11), "meczów");
    assert.equal(XP.pluralMatches(12), "meczów");
    assert.equal(XP.pluralMatches(14), "meczów");
    assert.equal(XP.pluralMatches(100), "meczów");
  });
  test("22-24 → mecze (ends in 2/3/4, not teens)", () => {
    assert.equal(XP.pluralMatches(22), "mecze");
    assert.equal(XP.pluralMatches(23), "mecze");
    assert.equal(XP.pluralMatches(24), "mecze");
  });
  test("25-30 → meczów", () => {
    assert.equal(XP.pluralMatches(25), "meczów");
    assert.equal(XP.pluralMatches(30), "meczów");
  });
});
